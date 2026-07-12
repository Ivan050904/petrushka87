import type {
  DashboardSummary,
  Entry,
  EntryList,
  EntryType,
  TokenResponse,
  User,
} from "@/lib/types";
import { resolveApiBaseUrl } from "@/lib/api-base-url";
import type {
  FinanceAIStatus,
  FinanceBankCode,
  FinanceImportPreview,
  FinanceImportRow,
  FinanceSettings,
  FinanceSummary,
} from "@/lib/finance-import";
import type {
  ExerciseCatalogItem,
  MuscleGroup,
  PersonalRecord,
  ProgressPoint,
  WorkoutSession,
  WorkoutSessionList,
  WorkoutSet,
} from "@/lib/workouts";


const DEFAULT_ENTRY_PAGE_SIZE = 200;

type RequestOptions = RequestInit & {
  token?: string | null;
};

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

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
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter && /^\d+$/.test(retryAfter)) {
      return `Слишком много попыток. Подождите ${retryAfter} сек.`;
    }
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }

  try {
    const body = (await response.json()) as { detail?: unknown };
    return formatErrorDetail(body.detail) ?? (response.statusText || "Request failed");
  } catch {
    return response.statusText || "Request failed";
  }
}

async function handleFailedResponse(response: Response) {
  const isAuthLoginRequest = response.url.includes("/auth/login");
  if (response.status === 401 && unauthorizedHandler && !isAuthLoginRequest) {
    unauthorizedHandler();
  }
  throw new ApiError(await errorMessageFromResponse(response), response.status);
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

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await handleFailedResponse(response);
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

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    await handleFailedResponse(response);
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
    metadata_status?: string;
    metadata_source?: string;
    limit?: number;
    offset?: number;
    collection?: string;
    exclude_collection?: string;
    category?: string;
    entry_date_from?: string;
    entry_date_to?: string;
    sort?: string;
    exclude_hidden?: boolean;
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
  if (params.metadata_status) {
    searchParams.set("metadata_status", params.metadata_status);
  }
  if (params.metadata_source) {
    searchParams.set("metadata_source", params.metadata_source);
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
  if (params.exclude_hidden) {
    searchParams.set("exclude_hidden", "true");
  }

  const query = searchParams.toString();
  return request<EntryList>(`/entries${query ? `?${query}` : ""}`, { token });
}

export async function fetchAllEntries(
  token: string,
  params: Omit<Parameters<typeof listEntries>[1], "limit" | "offset"> = {},
  pageSize = DEFAULT_ENTRY_PAGE_SIZE,
): Promise<EntryList> {
  const items: Entry[] = [];
  let offset = 0;
  let total = 0;

  while (true) {
    const page = await listEntries(token, { ...params, limit: pageSize, offset });
    total = page.total;
    items.push(...page.items);
    offset += page.items.length;
    if (offset >= total || page.items.length === 0) {
      break;
    }
  }

  return { items, total };
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

export type AssistantChatDebug = {
  snippet_count: number;
  matched_dates: string[];
  effective_scope?: string | null;
  searched_scopes?: string[];
  router_confidence?: number;
  embedding_provider?: string;
  model?: string;
};

export type AssistantChatDonePayload = {
  id: string;
  role: string;
  content: string;
  debug?: AssistantChatDebug;
};

export function listAssistantConversations(token: string): Promise<AssistantConversation[]> {
  return request<AssistantConversation[]>("/assistant/conversations", { token });
}

export function createAssistantConversation(
  token: string,
  options: { title?: string; scope?: string } = {},
): Promise<AssistantConversation> {
  return request<AssistantConversation>("/assistant/conversations", {
    method: "POST",
    token,
    body: JSON.stringify({
      title: options.title ?? "Новый диалог",
      scope: options.scope ?? "all",
    }),
  });
}

export function deleteAssistantConversation(token: string, conversationId: string): Promise<void> {
  return request<void>(`/assistant/conversations/${conversationId}`, {
    method: "DELETE",
    token,
  });
}

export function updateAssistantConversation(
  token: string,
  conversationId: string,
  payload: { title: string },
): Promise<AssistantConversation> {
  return request<AssistantConversation>(`/assistant/conversations/${conversationId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
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
    onDone?: (payload: AssistantChatDonePayload) => void;
  },
): Promise<void> {
  const response = await fetch(`${resolveApiBaseUrl()}/assistant/conversations/${conversationId}/chat`, {
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
      const payload = JSON.parse(data) as {
        text?: string;
        message?: string;
        id?: string;
        role?: string;
        content?: string;
        debug?: AssistantChatDebug;
      };
      if (eventName === "token" && payload.text) {
        handlers.onToken(payload.text);
      }
      if (eventName === "done" && payload.id && payload.content !== undefined) {
        handlers.onDone?.({
          id: payload.id,
          role: payload.role ?? "assistant",
          content: payload.content,
          debug: payload.debug,
        });
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

export function transcribeAssistantAudio(
  token: string,
  audio: Blob,
  filename = "voice.webm",
): Promise<{ text: string }> {
  const formData = new FormData();
  formData.append("audio", audio, filename);

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

export type DigestProfileStatus = {
  enabled: boolean;
  last_run_at: string | null;
  last_status: string;
  last_articles_saved: number;
  last_error: string | null;
  last_topics: string[] | null;
  last_search_until: string | null;
  next_search_from: string | null;
  query_source?: string | null;
  tuned_at?: string | null;
};

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
  psychology: DigestProfileStatus;
};

export type DigestRunResponse = {
  status: string;
  articles_saved: number;
  articles_skipped: number;
  topics: string[];
  message: string;
  search_period_from: string | null;
  search_period_to: string | null;
  profile?: "ai" | "psychology";
};

export function getDigestStatus(token: string): Promise<DigestStatus> {
  return request<DigestStatus>("/agent/digest/status", { token });
}

export function runDigest(
  token: string,
  options: { force?: boolean; maxArticles?: number; profile?: "ai" | "psychology" } = {},
): Promise<DigestRunResponse> {
  return request<DigestRunResponse>("/agent/digest/run", {
    method: "POST",
    token,
    body: JSON.stringify({
      force: options.force ?? false,
      max_articles: options.maxArticles,
      profile: options.profile ?? "ai",
    }),
  });
}

export type PsychQueryTuneResponse = {
  status: string;
  queries: string[];
  message: string;
  source: string;
};

export function tunePsychQueries(token: string): Promise<PsychQueryTuneResponse> {
  return request<PsychQueryTuneResponse>("/agent/digest/psychology/tune-queries", {
    method: "POST",
    token,
  });
}

export type ArticleFeedbackType = "dislike" | "off_topic";

export function submitArticleFeedback(
  token: string,
  entryId: string,
  feedback: ArticleFeedbackType,
): Promise<Entry> {
  return request<Entry>("/agent/digest/feedback", {
    method: "POST",
    token,
    body: JSON.stringify({ entry_id: entryId, feedback }),
  });
}

export type TherapyProblemItem = {
  thesis: string;
  evidence: string;
  speaker: "client" | "therapist" | "unknown";
};

export type TherapyDefenseMechanism = {
  name: string;
  description: string;
  evidence: string;
  speaker: "client" | "therapist" | "unknown";
};

export type TherapySessionAnalysis = {
  session_summary: string;
  key_topics: string[];
  problems: TherapyProblemItem[];
  defense_mechanisms: TherapyDefenseMechanism[];
  emotional_dynamics: string;
  client_patterns: string[];
  therapist_interventions: string[];
  insights: string[];
  homework_or_next_steps: string[];
  open_questions: string[];
  confidence_notes: string;
};

export type TherapySessionJob = {
  id: number;
  title: string;
  session_date: string | null;
  status: string;
  stage: string;
  stage_key: string;
  progress: number;
  source_filename: string;
  duration_sec: number;
  transcription_source: string;
  transcript: string;
  diarized_transcript: string;
  speakers_json: Record<string, unknown>;
  analysis_json: TherapySessionAnalysis | Record<string, unknown>;
  analysis_markdown: string;
  analysis_model: string;
  error: string;
  entry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TherapySessionSummary = {
  id: number;
  title: string;
  session_date: string | null;
  status: string;
  stage: string;
  stage_key: string;
  progress: number;
  source_filename: string;
  duration_sec: number;
  error: string;
  created_at: string;
  updated_at: string;
};

export type TherapySessionStatus = {
  id: number;
  status: string;
  stage: string;
  stage_key: string;
  progress: number;
  error: string;
};

export function listTherapySessions(token: string): Promise<TherapySessionSummary[]> {
  return request<TherapySessionSummary[]>("/therapy-sessions", { token });
}

export function getTherapySession(token: string, jobId: number): Promise<TherapySessionJob> {
  return request<TherapySessionJob>(`/therapy-sessions/${jobId}`, { token });
}

export function getTherapySessionStatus(token: string, jobId: number): Promise<TherapySessionStatus> {
  return request<TherapySessionStatus>(`/therapy-sessions/${jobId}/status`, { token });
}

export async function uploadTherapySession(
  token: string,
  payload: { file: File; title?: string; sessionDate?: string },
): Promise<TherapySessionJob> {
  const formData = new FormData();
  formData.append("file", payload.file);
  if (payload.title?.trim()) {
    formData.append("title", payload.title.trim());
  }
  if (payload.sessionDate?.trim()) {
    formData.append("session_date", payload.sessionDate.trim());
  }

  const response = await fetch(`${resolveApiBaseUrl()}/therapy-sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) {
    throw new ApiError(await errorMessageFromResponse(response), response.status);
  }
  return response.json() as Promise<TherapySessionJob>;
}

export function uploadTherapySessionText(
  token: string,
  payload: { text: string; title?: string; sessionDate?: string },
): Promise<TherapySessionJob> {
  return request<TherapySessionJob>("/therapy-sessions/text", {
    method: "POST",
    token,
    body: JSON.stringify({
      text: payload.text,
      title: payload.title?.trim() || "",
      session_date: payload.sessionDate?.trim() || null,
    }),
  });
}

export function retryTherapySession(
  token: string,
  jobId: number,
  mode: "full" | "analysis" = "full",
): Promise<TherapySessionJob> {
  return request<TherapySessionJob>(`/therapy-sessions/${jobId}/retry?mode=${mode}`, {
    method: "POST",
    token,
  });
}

export function deleteTherapySession(token: string, jobId: number): Promise<void> {
  return request<void>(`/therapy-sessions/${jobId}`, { method: "DELETE", token });
}

export type AgendaBundle = {
  tasks: Entry[];
  events: Entry[];
  reminders: Entry[];
};

export function getAgendaEntries(token: string): Promise<AgendaBundle> {
  return request<AgendaBundle>("/plans/agenda", { token });
}

export type EntryLink = {
  id: string;
  source_entry_id: string;
  target_entry_id: string;
  link_type: string;
};

export function listEntryLinks(token: string, entryId: string): Promise<EntryLink[]> {
  return request<EntryLink[]>(`/entries/${entryId}/links`, { token });
}

export function createEntryLink(
  token: string,
  entryId: string,
  payload: { target_entry_id: string; link_type?: string },
): Promise<EntryLink> {
  return request<EntryLink>(`/entries/${entryId}/links`, {
    method: "POST",
    token,
    body: JSON.stringify({ link_type: "related", ...payload }),
  });
}

export function deleteEntryLink(token: string, entryId: string, linkId: string): Promise<void> {
  return request<void>(`/entries/${entryId}/links/${linkId}`, {
    method: "DELETE",
    token,
  });
}

export type UserSettingsPayload = {
  food_targets?: Record<string, unknown> | null;
  finance_accounts?: Array<Record<string, unknown>> | null;
  finance_categories?: string[] | null;
};

export function getUserSettings(token: string): Promise<UserSettingsPayload> {
  return request<UserSettingsPayload>("/user/settings", { token });
}

export function patchUserSettings(token: string, payload: UserSettingsPayload): Promise<UserSettingsPayload> {
  return request<UserSettingsPayload>("/user/settings", {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function listWorkoutCatalog(token: string, muscleGroup?: MuscleGroup): Promise<ExerciseCatalogItem[]> {
  const query = muscleGroup ? `?muscle_group=${muscleGroup}` : "";
  return request<ExerciseCatalogItem[]>(`/workouts/catalog${query}`, { token });
}

export function createWorkoutCatalogItem(
  token: string,
  payload: { name: string; muscle_group: MuscleGroup },
): Promise<ExerciseCatalogItem> {
  return request<ExerciseCatalogItem>("/workouts/catalog", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateWorkoutCatalogItem(
  token: string,
  catalogId: string,
  payload: { name?: string; muscle_group?: MuscleGroup },
): Promise<ExerciseCatalogItem> {
  return request<ExerciseCatalogItem>(`/workouts/catalog/${catalogId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function deleteWorkoutCatalogItem(token: string, catalogId: string): Promise<void> {
  return request<void>(`/workouts/catalog/${catalogId}`, { method: "DELETE", token });
}

export function createWorkoutSession(
  token: string,
  payload: {
    body_weight: number;
    mood: number;
    muscle_readiness: number;
    sleep_quality: number;
    general_fatigue: number;
    exercises?: Array<{ exercise_catalog_id: string; sets: WorkoutSet[] }>;
    date?: string;
  },
): Promise<WorkoutSession> {
  return request<WorkoutSession>("/workouts/sessions", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateWorkoutSession(
  token: string,
  sessionId: string,
  payload: {
    exercises?: Array<{ exercise_catalog_id: string; sets: WorkoutSet[] }>;
    body_weight?: number;
    mood?: number;
    muscle_readiness?: number;
    sleep_quality?: number;
    general_fatigue?: number;
  },
): Promise<WorkoutSession> {
  return request<WorkoutSession>(`/workouts/sessions/${sessionId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function deleteWorkoutSession(token: string, sessionId: string): Promise<void> {
  return request<void>(`/workouts/sessions/${sessionId}`, { method: "DELETE", token });
}

export function listWorkoutSessions(
  token: string,
  options?: { offset?: number; limit?: number },
): Promise<WorkoutSessionList> {
  const params = new URLSearchParams();
  if (options?.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return request<WorkoutSessionList>(`/workouts/sessions${query ? `?${query}` : ""}`, { token });
}

export function listWorkoutRecords(token: string, exerciseCatalogId?: string): Promise<PersonalRecord[]> {
  const query = exerciseCatalogId ? `?exercise_catalog_id=${exerciseCatalogId}` : "";
  return request<PersonalRecord[]>(`/workouts/records${query}`, { token });
}

export function createWorkoutRecord(
  token: string,
  payload: { exercise_catalog_id: string; weight: number; reps: number; date: string },
): Promise<PersonalRecord> {
  return request<PersonalRecord>("/workouts/records", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getWorkoutExerciseAnalytics(token: string, catalogId: string): Promise<ProgressPoint[]> {
  return request<ProgressPoint[]>(`/workouts/analytics/exercise/${catalogId}`, { token });
}

export function getWorkoutMuscleGroupAnalytics(token: string, group: MuscleGroup): Promise<ProgressPoint[]> {
  return request<ProgressPoint[]>(`/workouts/analytics/muscle-group/${group}`, { token });
}
