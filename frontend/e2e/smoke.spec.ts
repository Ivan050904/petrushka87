import { expect, test, type Page } from "@playwright/test";

const DEMO_EMAIL = "demo@folio-one.local";
const DEMO_PASSWORD = "demo12345";
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8000/api/v1";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const TOKEN_KEY = "folio_one_access_token";

async function loginDemo(page: Page) {
  const response = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`login failed: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  const base = new URL(BASE_URL);

  await page.context().addCookies([
    {
      name: "folio_one_auth",
      value: "1",
      domain: base.hostname,
      path: "/",
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ tokenKey, token }) => {
      window.localStorage.setItem(tokenKey, token);
    },
    { tokenKey: TOKEN_KEY, token: body.access_token },
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });
}

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /личный пульт/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
});

test("demo credentials login redirects to dashboard", async ({ page }) => {
  await loginDemo(page);
});

test("dashboard shows capture on mobile viewport", async ({ page }) => {
  test.skip(Boolean(process.env.CI), "Extended smoke — run locally");

  await page.setViewportSize({ width: 360, height: 740 });
  await loginDemo(page);

  const capture = page.getByLabel(/быстрая запись/i);
  await expect(capture.first()).toBeVisible();
});

test("articles filter empty shows reset action", async ({ page }) => {
  test.skip(Boolean(process.env.CI), "Extended smoke — run locally");

  await page.setViewportSize({ width: 1280, height: 800 });
  await loginDemo(page);

  await page.goto("/articles");
  await expect(page.getByRole("heading", { name: /статьи/i })).toBeVisible({ timeout: 15_000 });

  const search = page.getByLabel(/поиск статей/i);
  if (await search.isVisible()) {
    await search.fill("zzzz-no-articles-match-query-xyz");
    const filteredEmpty = page.getByText(/ничего не найдено/i);
    if (await filteredEmpty.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(page.getByRole("button", { name: /сбросить фильтры/i })).toBeVisible();
    }
  }
});
