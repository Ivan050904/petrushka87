(function () {
  const ROOT_PATH = document.querySelector('meta[name="root-path"]')?.content?.replace(/\/$/, "") || "";
  function apiPath(path) {
    return `${ROOT_PATH}${path}`;
  }

  let activePollToken = 0;

  function renderMarkdown(root) {
    if (!root || typeof marked === "undefined") return;
    marked.setOptions({ breaks: true, gfm: true });
    root.querySelectorAll(".md-content").forEach((el) => {
      if (el.dataset.rendered === "1") return;
      const raw = el.textContent || "";
      el.innerHTML = marked.parse(raw);
      el.dataset.rendered = "1";
    });
  }

  function getCopyText(btn) {
    const bubble = btn.closest(".message-bubble");
    if (!bubble) return "";
    const md = bubble.querySelector(".md-content");
    if (md) {
      if (md.dataset.raw) return md.dataset.raw;
      return md.textContent || "";
    }
    return bubble.textContent || "";
  }

  function showCopyToast() {
    const toast = document.getElementById("copy-toast");
    if (!toast) return;
    toast.textContent = "Скопировано";
    toast.classList.remove("sr-only");
    toast.classList.add("copy-toast-visible");
    setTimeout(() => {
      toast.classList.add("sr-only");
      toast.classList.remove("copy-toast-visible");
    }, 1500);
  }

  function initCopyButtons(root) {
    const scope = root || document;
    scope.querySelectorAll(".btn-copy").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = getCopyText(btn);
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          showCopyToast();
        } catch {
          /* ignore */
        }
      });
    });
  }

  function createCopyButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-copy";
    btn.setAttribute("aria-label", "Скопировать");
    btn.title = "Копировать";
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.8"/></svg>';
    return btn;
  }

  function updateSidebarActive() {
    const path = window.location.pathname;
    document.querySelectorAll(".chat-item").forEach((link) => {
      const href = link.getAttribute("href");
      const active = href === path;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function initDeleteButtons() {
    document.querySelectorAll(".btn-delete-chat").forEach((btn) => {
      if (btn.dataset.bound === "1") return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const chatId = btn.dataset.chatId;
        if (!chatId) return;
        if (!confirm("Удалить чат и все данные по этому видео?")) return;

        const res = await fetch(apiPath(`/chats/${chatId}`), { method: "DELETE" });
        if (!res.ok) return;
        const data = await res.json();
        const boot = document.getElementById("chat-boot");
        const isActive = boot && boot.dataset.chatId === chatId;
        if (isActive || data.redirect === apiPath("/")) {
          window.location.href = apiPath("/");
        } else {
          btn.closest(".chat-item-wrap")?.remove();
        }
      });
    });
  }

  function initEmptyState() {
    const input = document.getElementById("video-url");
    document.querySelectorAll(".example-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!input) return;
        input.value = btn.dataset.url || "";
        input.focus();
      });
    });
  }

  function renderProgressSteps(steps) {
    const container = document.getElementById("progress-steps");
    if (!container || !steps) return;
    container.innerHTML = steps
      .map(
        (s) =>
          `<span class="progress-step progress-step-${s.state}" data-key="${s.key}">${s.label}</span>`
      )
      .join("");
  }

  function initChatPage() {
    const boot = document.getElementById("chat-boot");
    if (!boot) {
      initEmptyState();
      return;
    }

    const pollToken = ++activePollToken;
    const chatId = boot.dataset.chatId;
    let status = boot.dataset.status;
    let streaming = false;

    const progressWrap = document.getElementById("progress");
    const progressPct = document.getElementById("progress-pct");
    const progressFill = document.getElementById("progress-fill");
    const progressBar = document.getElementById("progress-bar");
    const stageEl = document.getElementById("stage");
    const progressStatus = document.getElementById("progress-status");
    const progressEta = document.getElementById("progress-eta");
    const errorBox = document.getElementById("error-box");
    const errorText = document.getElementById("error-text");
    const messagesEl = document.getElementById("messages");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const chatSend = document.getElementById("chat-send");
    const suggestionChips = document.getElementById("suggestion-chips");
    const chatScroll = document.getElementById("chat-scroll");

    renderMarkdown(document.getElementById("chat-main") || document);
    initCopyButtons(document.getElementById("chat-main") || document);

    function setProgress(pct, stage, data) {
      const p = Math.max(0, Math.min(100, pct || 0));
      if (progressPct) progressPct.textContent = `${p}%`;
      if (progressFill) progressFill.style.width = `${p}%`;
      if (progressBar) progressBar.setAttribute("aria-valuenow", String(p));
      if (stageEl && stage) stageEl.textContent = stage;
      if (progressStatus && stage) progressStatus.textContent = stage;
      if (data && data.steps) renderProgressSteps(data.steps);
      if (progressEta) {
        if (data && data.eta_label) {
          progressEta.textContent = `${data.eta_label} осталось`;
          progressEta.hidden = false;
        } else {
          progressEta.hidden = true;
        }
      }
    }

    function scrollToBottom() {
      if (chatScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    function enableChatInput() {
      if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = "Спроси что угодно по этому видео…";
        chatInput.removeAttribute("aria-describedby");
      }
      if (chatSend) chatSend.disabled = false;
      if (suggestionChips) suggestionChips.hidden = false;
    }

    function appendMessage(role, content, options) {
      const opts = options || {};
      if (!messagesEl) return null;
      const wrap = document.createElement("div");
      wrap.className =
        `message message-${role} message-enter` + (opts.pending ? " pending" : "") + (opts.streaming ? " streaming" : "");

      if (role === "assistant") {
        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = "AI";
        wrap.appendChild(avatar);
      }

      const contentWrap = document.createElement("div");
      contentWrap.className = "message-content";
      const bubble = document.createElement("div");
      bubble.className = "message-bubble" + (role === "assistant" ? " message-bubble-with-copy" : "");
      bubble.setAttribute("aria-label", role === "user" ? "Вы" : "Ассистент");

      if (role === "assistant") {
        if (!opts.pending) bubble.appendChild(createCopyButton());
        const md = document.createElement("div");
        md.className = "md-content";
        if (opts.streaming) {
          md.dataset.raw = content;
          md.textContent = content;
        } else if (!opts.pending) {
          md.textContent = content;
        } else {
          bubble.textContent = content;
        }
        if (!opts.pending) bubble.appendChild(md);
      } else {
        bubble.textContent = content;
      }

      contentWrap.appendChild(bubble);
      wrap.appendChild(contentWrap);
      messagesEl.appendChild(wrap);

      if (role === "assistant" && !opts.pending && !opts.streaming) {
        renderMarkdown(wrap);
        initCopyButtons(wrap);
      }
      scrollToBottom();
      return { wrap, bubble, md: bubble.querySelector(".md-content") };
    }

    function refreshPanel() {
      if (typeof htmx === "undefined") return;
      htmx.ajax("GET", apiPath(`/chats/${chatId}/panel`), {
        target: "#chat-main",
        swap: "innerHTML",
      });
    }

    function renderStatus(data) {
      if (pollToken !== activePollToken) return;
      const prevStatus = status;
      status = data.status;
      if (data.stage) setProgress(data.progress, data.stage, data);

      if (data.status === "done" && prevStatus !== "done") {
        refreshPanel();
      } else if (data.status === "error") {
        if (progressWrap) progressWrap.hidden = true;
        if (errorText) errorText.textContent = data.error || "Что-то пошло не так.";
        if (errorBox) errorBox.hidden = false;
      }
    }

    function poll() {
      if (pollToken !== activePollToken) return;
      fetch(apiPath(`/chats/${chatId}/status`))
        .then((r) => {
          if (!r.ok) throw new Error("status");
          return r.json();
        })
        .then((data) => {
          if (pollToken !== activePollToken) return;
          renderStatus(data);
          if (data.status !== "done" && data.status !== "error") {
            setTimeout(poll, 2000);
          }
        })
        .catch(() => {
          if (pollToken !== activePollToken) return;
          setTimeout(poll, 4000);
        });
    }

    function initRetryButtons() {
      document.querySelectorAll(".btn-retry").forEach((btn) => {
        if (btn.dataset.bound === "1") return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => {
          const mode = btn.dataset.mode || "llm";
          const label = mode === "full" ? "Переобработать видео с нуля?" : "Пересказать заново?";
          if (!confirm(label)) return;

          status = "processing";
          if (progressWrap) progressWrap.hidden = false;
          if (errorBox) errorBox.hidden = true;
          if (chatInput) chatInput.disabled = true;
          if (chatSend) chatSend.disabled = true;
          if (suggestionChips) suggestionChips.hidden = true;

          fetch(apiPath(`/chats/${chatId}/retry?mode=${mode}`), {
            method: "POST",
            headers: { "HX-Request": "true" },
          })
            .then(async (r) => {
              if (!r.ok) {
                const data = await r.json();
                throw new Error(data.message || "Ошибка");
              }
              return r.text();
            })
            .then((html) => {
              const main = document.getElementById("chat-main");
              if (main) main.innerHTML = html;
              initChatPage();
            })
            .catch((err) => {
              alert(err.message || "Не удалось запустить повторную обработку");
            });
        });
      });
    }

    const toggleBtn = document.getElementById("toggle-transcript");
    const transcriptBox = document.getElementById("transcript-box");
    const transcriptEl = document.getElementById("transcript");
    let transcriptLoaded = false;

    if (toggleBtn && transcriptBox) {
      toggleBtn.addEventListener("click", function () {
        const opening = transcriptBox.hidden;
        transcriptBox.hidden = !opening;
        toggleBtn.setAttribute("aria-expanded", opening ? "true" : "false");
        toggleBtn.textContent = opening ? "Скрыть текст" : "Полный текст";
        if (opening && !transcriptLoaded && transcriptEl) {
          fetch(apiPath(`/chats/${chatId}/transcript`))
            .then((r) => r.text())
            .then((t) => {
              transcriptEl.textContent = t || "Текст пуст.";
              transcriptLoaded = true;
            });
        }
      });
    }

    function parseSSEChunk(buffer, onEvent) {
      const parts = buffer.split("\n\n");
      const rest = parts.pop() || "";
      for (const block of parts) {
        let event = "message";
        let data = "";
        block.split("\n").forEach((line) => {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data = line.slice(5).trim();
        });
        if (data) {
          const parsed = JSON.parse(data);
          onEvent(event, parsed);
        }
      }
      return rest;
    }

    async function sendMessage(text) {
      const question = text.trim();
      if (!question || status !== "done" || streaming) return;

      streaming = true;
      chatInput.value = "";
      chatInput.style.height = "auto";
      chatInput.disabled = true;
      chatSend.disabled = true;

      appendMessage("user", question);
      const pending = appendMessage("assistant", "Думаю…", { streaming: true });
      let fullText = "";
      let mdRenderTimer = null;

      function scheduleMdRender() {
        if (!pending || !pending.md) return;
        clearTimeout(mdRenderTimer);
        mdRenderTimer = setTimeout(() => {
          pending.md.dataset.rendered = "0";
          renderMarkdown(pending.wrap);
        }, 300);
      }

      try {
        const res = await fetch(apiPath(`/chats/${chatId}/messages/stream`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: question }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Ошибка запроса");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = parseSSEChunk(buffer, (event, data) => {
            if (event === "token" && data.text) {
              fullText += data.text;
              if (pending && pending.md) {
                pending.md.dataset.raw = fullText;
                pending.md.textContent = fullText + "▍";
                scheduleMdRender();
                scrollToBottom();
              }
            } else if (event === "error") {
              throw new Error(data.message || "Ошибка");
            } else if (event === "done") {
              fullText = data.content || fullText;
            }
          });
        }

        if (pending && pending.wrap) {
          pending.wrap.classList.remove("streaming");
          if (!fullText.trim()) {
            throw new Error("Пустой ответ от модели");
          }
          if (pending.md) {
            pending.md.dataset.raw = fullText;
            pending.md.textContent = fullText;
            pending.md.dataset.rendered = "0";
            renderMarkdown(pending.wrap);
            initCopyButtons(pending.wrap);
          }
        }
      } catch (err) {
        if (pending && pending.wrap) {
          pending.wrap.remove();
        }
        appendMessage("assistant", err.message || "Не удалось получить ответ.");
      } finally {
        streaming = false;
        clearTimeout(mdRenderTimer);
        if (status === "done") {
          chatInput.disabled = false;
          chatSend.disabled = false;
          chatInput.focus();
        }
      }
    }

    if (chatForm && chatInput) {
      chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        sendMessage(chatInput.value);
      });

      chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
      });

      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          chatForm.requestSubmit();
        }
      });
    }

    if (suggestionChips && chatInput) {
      suggestionChips.addEventListener("click", (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        const prompt = chip.dataset.prompt;
        if (!prompt) return;
        chatInput.value = prompt;
        chatInput.dispatchEvent(new Event("input"));
        chatInput.focus();
      });
    }

    initRetryButtons();
    setProgress(parseInt(boot.dataset.progress || "0", 10), stageEl ? stageEl.textContent : "");

    if (status !== "done" && status !== "error") {
      fetch(apiPath(`/chats/${chatId}/status`))
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data || pollToken !== activePollToken) return;
          setProgress(data.progress, data.stage, data);
        })
        .catch(() => {});
      poll();
    } else {
      scrollToBottom();
    }
  }

  document.body.addEventListener("htmx:afterSwap", (e) => {
    if (e.detail.target && e.detail.target.id === "chat-main") {
      updateSidebarActive();
      initChatPage();
    }
  });

  document.body.addEventListener("htmx:oobAfterSwap", () => {
    updateSidebarActive();
    initDeleteButtons();
  });

  updateSidebarActive();
  initDeleteButtons();
  initChatPage();
})();
