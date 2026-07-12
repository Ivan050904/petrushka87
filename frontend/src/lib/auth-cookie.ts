export const AUTH_TOKEN_KEY = "folio_one_access_token";
export const AUTH_COOKIE = "folio_one_auth";

export function setAuthCookie() {
  if (typeof document === "undefined") {
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AUTH_COOKIE}=1; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
}

export function clearAuthCookie() {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function hasAuthCookie() {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie.split(";").some((part) => part.trim().startsWith(`${AUTH_COOKIE}=1`));
}
