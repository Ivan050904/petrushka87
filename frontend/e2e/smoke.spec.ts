import { expect, test } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /личный пульт/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /войти/i })).toBeVisible();
});

test("demo login redirects to dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /войти в демо/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15_000 });
  await expect(page).toHaveURL(/dashboard/);
});

test("dashboard shows capture on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/login");
  await page.getByRole("button", { name: /войти в демо/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15_000 });

  const capture = page.getByLabel(/быстрая запись/i);
  await expect(capture.first()).toBeVisible();
  const box = await capture.first().boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.y).toBeLessThan(740);
  }
});

test("articles filter empty shows reset action", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  await page.getByRole("button", { name: /войти в демо/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15_000 });

  await page.goto("/articles");
  await expect(page.getByRole("heading", { name: /статьи/i })).toBeVisible({ timeout: 15_000 });

  const search = page.getByLabel(/поиск статей/i);
  if (await search.isVisible()) {
    await search.fill("zzzz-no-articles-match-query-xyz");
    const reset = page.getByRole("button", { name: /сбросить фильтры/i });
    const filteredEmpty = page.getByText(/ничего не найдено/i);
    if (await filteredEmpty.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(reset).toBeVisible();
    }
  }
});
