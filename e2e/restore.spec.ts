import { expect, test } from "@playwright/test";

test("restores a preset compare URL and serves the OG card", async ({
  page,
  request,
}) => {
  await page.goto("/?preset=tokyo-paris");

  await expect(page).toHaveTitle(/Tokyo vs Paris/);
  await expect(page.getByLabel("First city")).toHaveValue("Tokyo, Japan");
  await expect(page.getByLabel("Second city")).toHaveValue("Paris, France");
  await expect(
    page.getByRole("heading", {
      name: /Tokyo covers about 20.9 times the area of Paris\./,
    }),
  ).toBeVisible();

  const ogResponse = await request.get("/api/og?preset=tokyo-paris");

  expect(ogResponse.ok()).toBe(true);
  expect(ogResponse.headers()["content-type"]).toContain("image/png");
});
