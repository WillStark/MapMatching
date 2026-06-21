import { expect, test, type Page } from "@playwright/test";

function getComparisonSetup(page: Page) {
  return page
    .getByRole("complementary", { name: "Comparison setup" })
    .or(page.getByRole("region", { name: "Comparison setup" }));
}

function getWorkspaceUtilities(page: Page) {
  return page
    .getByRole("group", { name: /utilities/i })
    .or(page.getByRole("region", { name: /utilities/i }));
}

test("starts on an empty search-first landing state", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("compare-workspace")).toBeVisible();
  await expect(getComparisonSetup(page)).toBeVisible();
  await expect(getWorkspaceUtilities(page)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Search two cities to start the compare\./i,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("First city")).toHaveValue("");
  await expect(page.getByLabel("Second city")).toHaveValue("");
  await expect(page.getByText(/Editorial Atlas Workspace/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Search$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy link" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Swap cities" })).toBeDisabled();
  await expect(page.getByTestId("compare-surface")).toHaveAttribute(
    "data-compare-ready",
    "staging",
  );
});

test("restores two map panes inside the V2 compare workspace", async ({ page }) => {
  await page.goto("/?preset=tokyo-paris");

  const workspace = page.getByTestId("compare-workspace");
  const mapPanes = workspace.locator('[data-testid^="map-pane-"]');

  await expect(workspace).toBeVisible();
  await expect(getComparisonSetup(page)).toBeVisible();
  await expect(getWorkspaceUtilities(page)).toBeVisible();
  await expect(mapPanes).toHaveCount(2);
  await expect(mapPanes.nth(0)).toBeVisible();
  await expect(mapPanes.nth(1)).toBeVisible();
  await expect(page.getByRole("button", { name: /Labels/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reference Rings" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Line reference" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Circle reference" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("First city")).toHaveValue("Tokyo, Japan");
  await expect(page.getByLabel("Second city")).toHaveValue("Paris, France");
});

test("opens and closes the comparison setup sheet on mobile", async ({ page }) => {
  await page.setViewportSize({ height: 932, width: 430 });
  await page.goto("/?preset=tokyo-paris");

  const trigger = page.getByRole("button", {
    exact: true,
    name: "Cities & controls",
  });

  await expect(page.getByTestId("mobile-comparison-bar")).toContainText(
    "Tokyo / Paris",
  );
  await expect(
    page.getByRole("link", { name: "MapMatching home" }),
  ).toBeVisible();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  const controlledId = await trigger.getAttribute("aria-controls");

  expect(controlledId).toMatch(/\S/);
  await expect(
    page.getByRole("dialog", { name: "Cities & controls" }),
  ).toHaveCount(0);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const sheet = page.getByRole("dialog", { name: "Cities & controls" });

  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("id", controlledId!);
  await expect(
    sheet.getByRole("button", { name: "Close cities & controls" }),
  ).toBeFocused();
  await expect(
    sheet
      .getByRole("complementary", { name: "Comparison setup" })
      .or(sheet.getByRole("region", { name: "Comparison setup" })),
  ).toBeVisible();

  await sheet
    .getByRole("button", { name: "Close cities & controls" })
    .click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("dialog", { name: "Cities & controls" }),
  ).toHaveCount(0);
});

test("desktop settings button focuses the comparison settings section", async ({
  page,
}) => {
  await page.setViewportSize({ height: 950, width: 1440 });
  await page.goto("/?preset=london-san-francisco");

  const trigger = page.getByRole("button", {
    exact: true,
    name: "Settings",
  });
  const settings = page.getByRole("navigation", {
    name: "Comparison settings",
  });
  const controlledId = await trigger.getAttribute("aria-controls");

  expect(controlledId).toMatch(/\S/);
  await expect(settings).toHaveAttribute("id", controlledId!);

  await trigger.click();
  await expect(settings).toBeFocused();
  await expect(settings).toBeInViewport();
});

test("opens comparison setup by default on an empty mobile entry", async ({
  page,
}) => {
  await page.setViewportSize({ height: 932, width: 430 });
  await page.goto("/");

  const trigger = page.getByRole("button", {
    exact: true,
    name: "Cities & controls",
  });

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("dialog", { name: "Cities & controls" }),
  ).toBeVisible();
  await expect(page.getByLabel("First city")).toBeVisible();
  await expect(page.getByLabel("Second city")).toBeVisible();
});

test("links to the attribution page from the staging surface", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "View full attribution" }).click();
  await expect(page).toHaveURL(/\/attribution$/);
  await expect(
    page.getByRole("heading", {
      name: /Source details for search, geometry, and maps\./i,
    }),
  ).toBeVisible();
});

test("searches for a new preset pair and syncs the URL", async ({ page }) => {
  await page.goto("/");

  const firstCity = page.getByLabel("First city");
  const secondCity = page.getByLabel("Second city");

  await firstCity.fill("Seoul");
  await expect(page.getByRole("button", { name: /^Search$/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Seoul/i }).click();
  await expect(firstCity).toHaveValue("Seoul, South Korea");

  await secondCity.fill("Barcelona");
  await page.getByRole("option", { name: /Barcelona/i }).click();
  await expect(secondCity).toHaveValue("Barcelona, Spain");

  await expect(page).toHaveURL(/preset=seoul-barcelona/);
  await expect(
    page.getByRole("heading", {
      name: /Seoul and Barcelona are staged for side-by-side comparison\./,
    }),
  ).toBeVisible();
});

test("draws one session-only measured ruler", async ({ page }) => {
  await page.goto("/?preset=tokyo-paris");

  await expect(page.getByTestId("compare-surface")).toHaveAttribute(
    "data-compare-ready",
    "ready",
    { timeout: 15_000 },
  );

  const leftPane = page.getByTestId("map-pane-city-a-pane");
  const leftBounds = await leftPane.boundingBox();

  expect(leftBounds).not.toBeNull();

  await page.getByRole("button", { name: "Measure" }).click();
  await page.mouse.move(leftBounds!.x + leftBounds!.width * 0.36, leftBounds!.y + 380);
  await page.mouse.down();
  await page.mouse.move(leftBounds!.x + leftBounds!.width * 0.56, leftBounds!.y + 380);
  await page.mouse.up();
  await expect(page.getByTestId("scale-measurement-summary")).toContainText(
    /Measured \d/,
  );
  await expect(page.getByTestId("scale-measurement-map-label")).toHaveCount(2);

  const firstSummary = await page
    .getByTestId("scale-measurement-summary")
    .textContent();

  await page.getByRole("button", { name: "Measure" }).click();
  await page.mouse.move(leftBounds!.x + leftBounds!.width * 0.42, leftBounds!.y + 470);
  await page.mouse.down();
  await page.mouse.move(leftBounds!.x + leftBounds!.width * 0.78, leftBounds!.y + 470);
  await page.mouse.up();
  await expect(page.getByTestId("scale-measurement-summary")).not.toHaveText(
    firstSummary ?? "",
  );

  await expect(page).toHaveURL(/preset=tokyo-paris$/);

  await page.getByRole("button", { name: "Clear ruler" }).click();
  await expect(page.getByTestId("scale-measurement-summary")).toContainText(
    "No measurement",
  );
});
