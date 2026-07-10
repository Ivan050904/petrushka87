import type {
  DashboardSummary,
  Entry,
  EntryList,
  EntryType,
  TokenResponse,
  User,
} from "@/lib/types";
import type {
  FinanceAIStatus,
  FinanceBankCode,
  FinanceImportPreview,
  FinanceImportRow,
  FinanceSettings,
  FinanceSummary,
} from "@/lib/finance-import";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FastApiValidationIssue = {
  loc?: unknown;
  msg?: unknown;
};

export function getErrorMessage(error: unknown, fallback = "Не удалось выполнить действие.") {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

function formatErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const issues = detail
      .map((item) => formatValidationIssue(item))
      .filter((item): item is string => Boolean(item));
    return issues.length > 0 ? issues.join("; ") : null;
  }

  if (detail && typeof detail === "object") {
    const maybeIssue = formatValidationIssue(detail);
    if (maybeIssue) {
      return maybeIssue;
    }
  }

  return null;
}

function formatValidationIssue(item: unknown): string | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const issue = item as FastApiValidationIssue;
  const message = typeof issue.msg === "string" ? issue.msg : null;
  const location = Array.isArray(issue.loc)
    ? issue.loc
        .filter((part) => part !== "body" && part !== "query" && part !== "path")
        .map((part) => String(part))
        .join(".")
    : "";

  if (message && location) {
    if (location === "content" && message.toLowerCase().includes("at least 1")) {
      return "Текст заметки не может быть пустым.";
    }
    return `${location}: ${message}`;
  }
  return message;
}

async function errorMessageFromResponse(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return formatErrorDetail(body.detail) ?? (response.statusText || "Request failed");
  } catch {
    return response.statusText || "Request failed";
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body && !headers.has("Content-Type")) {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    if (!isFormData) {
      headers.set("Content-Type", "application/json");
    }
  }

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(await errorMessageFromResponse(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function requestBlob(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(await errorMessageFromResponse(response), response.status);
  }

  return response.blob();
}

export function registerUser(payload: {
  email: string;
  password: string;
  full_name?: string;
}): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload: { email: string; password: string }): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser(token: string): Promise<User> {
  return request<User>("/auth/me", { token });
}

export function getEntry(token: string, id: string): Promise<Entry> {
  return request<Entry>(`/entries/${id}`, { token });
}

export function getDashboard(token: string): Promise<DashboardSummary> {
  return request<DashboardSummary>("/dashboard", { token });
}

export function listEntries(
  token: string,
  params: {
    q?: string;
    type?: EntryType;
    kind?: string;
    limit?: number;
    offset?: number;
    collection?: string;
    exclude_collection?: string;
    category?: string;
    entry_date_from?: string;
    entry_date_to?: string;
    sort?: string;
  } = {},
): Promise<EntryList> {
  const searchParams = new URLSearchParams();
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.type) {
    searchParams.set("type", params.type);
  }
  if (params.kind) {
    searchParams.set("kind", params.kind);
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset) {
    searchParams.set("offset", String(params.offset));
  }
  if (params.collection) {
    searchParams.set("collection", params.collection);
  }
  if (params.exclude_collection) {
    searchParams.set("exclude_collection", params.exclude_collection);
  }
  if (params.category) {
    searchParams.set("category", params.category);
  }
  if (params.entry_date_from) {
    searchParams.set("entry_date_from", params.entry_date_from);
  }
  if (params.entry_date_to) {
    searchParams.set("entry_date_to", params.entry_date_to);
  }
  if (params.sort) {
    searchParams.set("sort", params.sort);
  }

  const query = searchParams.toString();
  return request<EntryList>(`/entries${query ? `?${query}` : ""}`, { token });
}

export function createEntry(
  token: string,
  payload: {
    type?: EntryType;
    title?: string;
    content: string;
    metadata?: Record<string, unknown>;
  },
): Promise<Entry> {
  return request<Entry>("/entries", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateEntry(
  token: string,
  id: string,
  payload: {
    type?: EntryType;
    title?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<Entry> {
  return request<Entry>(`/entries/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function deleteEntry(token: string, id: string): Promise<void> {
  return request<void>(`/entries/${id}`, {
    method: "DELETE",
    token,
  });
}

export type ParsedTaskCandidate = {
  title: string;
  description?: string | null;
  status?: string;
  priority?: string;
  scheduled_at?: string | null;
  deadline?: string | null;
  planned_duration_minutes?: number | null;
  actual_duration_minutes?: number | null;
  reminder_at?: string | null;
  reminder_text?: string | null;
  recurrence?: string | null;
  tags?: string[];
  assignee_name?: string | null;
  confidence?: number;
};

export type TaskParseResponse = {
  tasks: ParsedTaskCandidate[];
};

export function parseTasks(token: string, content: string): Promise<TaskParseResponse> {
  return request<TaskParseResponse>("/tasks/parse", {
    method: "POST",
    token,
    body: JSON.stringify({ content }),
  });
}

export async function uploadResource(
  token: string,
  payload: {
    title: string;
    description?: string;
    file: File;
  },
): Promise<Entry> {
  const formData = new FormData();
  formData.set("title", payload.title);
  formData.set("description", payload.description ?? "");
  formData.set("file", payload.file);

  return request<Entry>("/resources", {
    method: "POST",
    token,
    body: formData,
    headers: {
      Accept: "application/json",
    },
  });
}

export async function downloadResourceFile(token: string, entryId: string) {
  return requestBlob(`/resources/${entryId}/file`, { token });
}

export type LifeNoteDrySpot = {
  quote: string;
  issue: string;
  suggestion: string;
};

export type LifeNoteAnalyzeResponse = {
  tone: string;
  dry_spots: LifeNoteDrySpot[];
  summary: string;
  usage?: Record<string, unknown> | null;
};

export function analyzeLifeNote(
  token: string,
  payload: { content: string; entry_date?: string },
): Promise<LifeNoteAnalyzeResponse> {
  return request<LifeNoteAnalyzeResponse>("/notes/analyze", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}


export function getFinanceAIStatus(token: string): Promise<FinanceAIStatus> {
  return request<FinanceAIStatus>("/finance/ai-status", { token });
}

export function previewFinanceImport(
  token: string,
  payload: { bank: FinanceBankCode; accountId: string; file: File },
): Promise<FinanceImportPreview> {
  const formData = new FormData();
  formData.set("bank", payload.bank);
  formData.set("account_id", payload.accountId);
  formData.set("file", payload.file);
  return request<FinanceImportPreview>("/finance/import/preview", {
    method: "POST",
    token,
    body: formData,
  });
}

export function confirmFinanceImport(
  token: string,
  payload: { bank: FinanceBankCode; account_id: string; rows: FinanceImportRow[] },
): Promise<{ created: number; skipped_duplicates: number }> {
  return request("/finance/import/confirm", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function categorizeFinanceImport(
  token: string,
  payload: { rows: FinanceImportRow[]; categories: string[]; accounts: FinanceSettings["accounts"] },
): Promise<{ rows: FinanceImportRow[] }> {
  return request("/finance/categorize", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getFinanceSummary(
  token: string,
  params: { from?: string; to?: string } = {},
): Promise<FinanceSummary> {
  const searchParams = new URLSearchParams();
  if (params.from) {
    searchParams.set("from", params.from);
  }
  if (params.to) {
    searchParams.set("to", params.to);
  }
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return request<FinanceSummary>(`/finance/summary${suffix}`, { token });
}

export type AssistantConversation = {
  id: string;
  title: string;
  scope: string;
  created_at: string;
  updated_at: string;
};

export type AssistantMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

export function listAssistantConversations(token: string): Promise<AssistantConversation[]> {
  return request<AssistantConversation[]>("/assistant/conversations", { token });
}

export function createAssistantConversation(token: string, title = "Новый диалог"): Promise<AssistantConversation> {
  return request<AssistantConversation>("/assistant/conversations", {
    method: "POST",
    token,
    body: JSON.stringify({ title, scope: "all" }),
  });
}

export function getAssistantConversation(
  token: string,
  conversationId: string,
): Promise<AssistantConversation & { messages: AssistantMessage[] }> {
  return request(`/assistant/conversations/${conversationId}`, { token });
}

export async function streamAssistantChat(
  token: string,
  conversationId: string,
  message: string,
  handlers: {
    onToken: (text: string) => void;
    onError?: (message: string) => void;
  },
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/assistant/conversations/${conversationId}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new ApiError(await errorMessageFromResponse(response), response.status);
  }
  if (!response.body) {
    throw new ApiError("Пустой ответ ассистента", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let eventName = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventName = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          data += line.slice(6);
        }
      }
      if (!data) {
        continue;
      }
      const payload = JSON.parse(data) as { text?: string; message?: string };
      if (eventName === "token" && payload.text) {
        handlers.onToken(payload.text);
      }
      if (eventName === "error" && payload.message) {
        handlers.onError?.(payload.message);
        throw new ApiError(payload.message, 502);
      }
    }
  }
}

export type AssistantAgentPendingAction = {
  action: "create_task" | "create_event";
  params: Record<string, unknown>;
  missing_fields: string[];
};

export type AssistantAgentActionResult = {
  type: "task" | "event";
  title: string;
  entry_id: string | null;
  metadata: Record<string, unknown>;
};

export type AssistantAgentChatResponse = {
  reply: string;
  session_id: string;
  configured: boolean;
  actions: AssistantAgentActionResult[];
  pending_confirmation: AssistantAgentPendingAction | null;
  entries_preview: Array<Record<string, unknown>>;
};

export type AssistantAgentStatus = {
  enabled: boolean;
  configured: boolean;
  model: string;
  base_url: string;
  provider_reachable: boolean;
  auto_confirm: boolean;
  classification_enabled: boolean;
  classification_model: string;
  speech_enabled: boolean;
  speech_configured: boolean;
  whisper_model: string;
};

export function transcribeAssistantAudio(token: string, audio: Blob): Promise<{ text: string }> {
  const formData = new FormData();
  formData.append("audio", audio, "voice.webm");

  return request<{ text: string }>("/assistant/transcribe", {
    method: "POST",
    token,
    body: formData,
    headers: {
      Accept: "application/json",
    },
  });
}

export function getAssistantAgentStatus(token: string): Promise<AssistantAgentStatus> {
  return request<AssistantAgentStatus>("/assistant/status", { token });
}

export function assistantAgentChat(
  token: string,
  payload: { message: string; session_id?: string | null; confirm?: boolean },
): Promise<AssistantAgentChatResponse> {
  return request<AssistantAgentChatResponse>("/assistant/agent/chat", {
    method: "POST",
    token,
    body: JSON.stringify({
      message: payload.message,
      session_id: payload.session_id ?? null,
      confirm: payload.confirm ?? false,
    }),
  });
}

export type DigestStatus = {
  enabled: boolean;
  ollama_reachable: boolean;
  schedule_hour: number;
  scheduler_enabled: boolean;
  configured_topics: string[];
  search_provider: string;
  last_run_at: string | null;
  last_status: string;
  last_articles_saved: number;
  last_error: string | null;
  last_topics: string[] | null;
  last_search_until: string | null;
  next_search_from: string | null;
};

export type DigestRunResponse = {
  status: string;
  articles_saved: number;
  articles_skipped: number;
  topics: string[];
  message: string;
  search_period_from: string | null;
  search_period_to: string | null;
};

export function getDigestStatus(token: string): Promise<DigestStatus> {
  return request<DigestStatus>("/agent/digest/status", { token });
}

export function runDigest(token: string): Promise<DigestRunResponse> {
  return request<DigestRunResponse>("/agent/digest/run", {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
}
