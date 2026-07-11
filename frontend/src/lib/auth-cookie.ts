export const AUTH_TOKEN_KEY = "folio_one_access_token";
export const AUTH_COOKIE = "folio_one_auth";

export function setAuthCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${AUTH_COOKIE}=1; path=/; max-age=604800; SameSite=Lax`;
}

export function clearAuthCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0`;
}
