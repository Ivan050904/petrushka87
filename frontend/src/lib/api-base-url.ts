const DEFAULT_API_BASE_URL = "http://localhost:8000/api/v1";

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;
  if (typeof window === "undefined") {
    return configured;
  }

  const hostname = window.location.hostname;
  if (isLocalHostname(hostname)) {
    return configured;
  }

  return `http://${hostname}:8000/api/v1`;
}
