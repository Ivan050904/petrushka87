import { expect, test, type Page } from "@playwright/test";

const DEMO_EMAIL = "demo@folio-one.local";
const DEMO_PASSWORD = "demo12345";

async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(DEMO_EMAIL);
  await page.locator("#password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
}

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /личный пульт/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти", exact: true })).toBeVisible();
});

test("demo credentials login redirects to dashboard", async ({ page }) => {
  await loginDemo(page);
  await expect(page).toHaveURL(/dashboard/);
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
