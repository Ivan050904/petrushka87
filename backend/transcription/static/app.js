(() => {
  const ROOT_PATH = document.querySelector('meta[name="root-path"]')?.content?.replace(/\/$/, "") || "";
  function apiPath(path) {
    return `${ROOT_PATH}${path}`;
  }

  const jobEl = document.getElementById("job");
  if (!jobEl) return;

  const jobId = jobEl.dataset.jobId;
  let status = jobEl.dataset.status;

  const progressWrap = document.getElementById("progress");
  const progressPct = document.getElementById("progress-pct");
  const progressFill = document.getElementById("progress-fill");
  const stageEl = document.getElementById("stage");
  const modelName = document.getElementById("model-name");
  const resultModel = document.getElementById("result-model");
  const durationNote = document.getElementById("duration-note");
  const errorBox = document.getElementById("error-box");
  const errorText = document.getElementById("error-text");
  const result = document.getElementById("result");
  const summaryEl = document.getElementById("summary");
  const titleEl = document.getElementById("job-title");
  const sourceNote = document.getElementById("source-note");

  function fmtDuration(sec) {
    if (!sec) return "";
    const totalMin = Math.floor(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  }

  function setProgress(pct, stage) {
    const p = Math.max(0, Math.min(100, pct || 0));
    if (progressPct) progressPct.textContent = `${p}%`;
    if (progressFill) progressFill.style.width = `${p}%`;
    if (stageEl && stage) stageEl.textContent = stage;
  }

  function render(data) {
    status = data.status;
    if (data.title) titleEl.textContent = data.title;
    if (data.stage) setProgress(data.progress, data.stage);
    if (data.summary_model && modelName) modelName.textContent = data.summary_model;
    if (data.summary_model && resultModel) resultModel.textContent = data.summary_model;

    if (data.duration_sec && durationNote) {
      durationNote.hidden = false;
      durationNote.textContent = `Длительность видео: ${fmtDuration(data.duration_sec)}`;
    }

    if (data.status === "done") {
      progressWrap.hidden = true;
      errorBox.hidden = true;
      summaryEl.textContent = data.summary || "";
      if (sourceNote) {
        if (data.source === "whisper") sourceNote.textContent = "(распознано из речи)";
        else if (data.source === "subtitles") sourceNote.textContent = "(из субтитров)";
      }
      setProgress(100, "Готово");
      result.hidden = false;
    } else if (data.status === "error") {
      progressWrap.hidden = true;
      result.hidden = true;
      errorText.textContent = data.error || "Что-то пошло не так.";
      errorBox.hidden = false;
    } else {
      progressWrap.hidden = false;
    }
  }

  function poll() {
    fetch(apiPath(`/jobs/${jobId}/status`))
      .then((r) => r.json())
      .then((data) => {
        render(data);
        if (data.status !== "done" && data.status !== "error") {
          setTimeout(poll, 2000);
        }
      })
      .catch(() => setTimeout(poll, 4000));
  }

  const toggleBtn = document.getElementById("toggle-transcript");
  const transcriptBox = document.getElementById("transcript-box");
  const transcriptEl = document.getElementById("transcript");
  let transcriptLoaded = false;

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      if (transcriptBox.hidden) {
        transcriptBox.hidden = false;
        toggleBtn.textContent = "Скрыть полный текст";
        if (!transcriptLoaded) {
          fetch(apiPath(`/jobs/${jobId}/transcript`))
            .then((r) => r.text())
            .then((t) => {
              transcriptEl.textContent = t || "Текст пуст.";
              transcriptLoaded = true;
            });
        }
      } else {
        transcriptBox.hidden = true;
        toggleBtn.textContent = "Показать полный текст";
      }
    });
  }

  setProgress(parseInt(jobEl.dataset.progress || "0", 10), stageEl ? stageEl.textContent : "");

  if (status !== "done" && status !== "error") {
    poll();
  }
})();
