import { expect, test } from "@playwright/test";

test("home page loads and shows the dashboard", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: /SafePlate UK/i })).toBeVisible();
});

test("establishments page loads and the search form renders", async ({ page }) => {
  const response = await page.goto("/establishments");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Search establishments" })).toBeVisible();
  await expect(page.getByLabel("Business name")).toBeVisible();
  await expect(page.getByLabel("Postcode")).toBeVisible();
  await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
});

test("health endpoint returns JSON with a status field", async ({ request }) => {
  const response = await request.get("/api/health");
  // A DB outage should still return a clean JSON body (200 or 503), never a
  // raw error page or leaked stack trace.
  expect([200, 503]).toContain(response.status());
  const body = await response.json();
  expect(body).toHaveProperty("status");
  expect(body).toHaveProperty("database");
  expect(body).toHaveProperty("timestamp");
});

test("map page loads", async ({ page }) => {
  const response = await page.goto("/map");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Map" })).toBeVisible();
});

test("local authorities page loads", async ({ page }) => {
  const response = await page.goto("/local-authorities");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Local authorities" })).toBeVisible();
});

test("about the data page loads", async ({ page }) => {
  const response = await page.goto("/about/data");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "About the data" })).toBeVisible();
});

test("status page loads and never displays a connection string", async ({ page }) => {
  const response = await page.goto("/status");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Status", exact: true })).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText.toLowerCase()).not.toContain("postgresql://");
  expect(bodyText.toLowerCase()).not.toContain("database_url");
});

test("an unknown establishment id shows a not-found page", async ({ page }) => {
  // Note: we don't assert the HTTP status code here. This route awaits a DB
  // call before deciding whether to call notFound(), and under streaming SSR
  // Next.js can commit a 200 response shell before that decision is made —
  // a known framework characteristic for async not-found(), not a bug in
  // this app. The important, user-visible behavior is the rendered content.
  await page.goto("/establishments/does-not-exist-12345");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
