import type {
  DashboardSummary,
  Entry,
  EntryList,
  EntryType,
  TokenResponse,
  User,
} from "@/lib/types";

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

export function getDashboard(token: string): Promise<DashboardSummary> {
  return request<DashboardSummary>("/dashboard", { token });
}

export function listEntries(
  token: string,
  params: { q?: string; type?: EntryType; limit?: number; offset?: number } = {},
): Promise<EntryList> {
  const searchParams = new URLSearchParams();
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.type) {
    searchParams.set("type", params.type);
  }
  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset) {
    searchParams.set("offset", String(params.offset));
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
