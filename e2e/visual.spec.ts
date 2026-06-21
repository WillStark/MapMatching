import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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

async function freezeVisualNoise(page: Page) {
  await page.emulateMedia({
    reducedMotion: "reduce",
  });

  await page.addStyleTag({
    content: `
      .shell-enter,
      .shell-delay-1,
      .shell-delay-2,
      .shell-delay-3 {
        animation: none !important;
      }

      *,
      *::before,
      *::after {
        caret-color: transparent !important;
      }
    `,
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function waitForLiveCompareReady(
  page: Page,
  viewport: { width: number; height: number },
) {
  const workspace = page.getByTestId("compare-workspace");
  const mapPanes = workspace.locator(
    '[data-testid^="map-pane-"][data-geometry-status="ready"]',
  );

  await expect(workspace).toBeVisible();

  if (viewport.width < 1024) {
    const controlsTrigger = page.getByRole("button", {
      exact: true,
      name: "Cities & controls",
    });

    await expect(controlsTrigger).toBeVisible();
    await expect(page.getByTestId("mobile-comparison-bar")).toBeVisible();
    await expect(controlsTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("dialog", { name: "Cities & controls" }),
    ).toHaveCount(0);
    await expect(getWorkspaceUtilities(page)).toHaveCount(0);
  } else {
    await expect(getWorkspaceUtilities(page)).toBeVisible();
    await expect(getComparisonSetup(page)).toBeVisible();
  }

  await expect(page.getByTestId("compare-surface")).toBeVisible();
  await expect(page.getByTestId("compare-surface")).toHaveAttribute(
    "data-compare-ready",
    "ready",
    { timeout: 15_000 },
  );
  await expect(mapPanes).toHaveCount(2);
  await expect(mapPanes.nth(0)).toBeVisible();
  await expect(mapPanes.nth(1)).toBeVisible();
}

async function preparePresetVisualState(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/?preset=tokyo-paris");
  await freezeVisualNoise(page);
  await waitForLiveCompareReady(page, viewport);
}

async function selectSearchOption(
  page: Page,
  slot: "left" | "right",
  query: string,
  optionName: RegExp,
) {
  const field =
    slot === "left" ? page.getByLabel("First city") : page.getByLabel("Second city");

  await field.fill(query);
  await page.getByRole("option", { name: optionName }).click();
}

async function prepareSearchVisualState(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await freezeVisualNoise(page);
  await selectSearchOption(page, "left", "Seoul", /Seoul/i);
  await selectSearchOption(page, "right", "Barcelona", /Barcelona/i);
  await waitForLiveCompareReady(page, viewport);
}

async function expectCompareSnapshot(page: Page, name: string) {
  const screenshot = await page.getByTestId("compare-workspace").screenshot({
    animations: "disabled",
    scale: "css",
  });

  expect(screenshot).toMatchSnapshot(name, {
    maxDiffPixels: 8_000,
  });
}

test("desktop live compare layout", async ({ page }) => {
  await preparePresetVisualState(page, { width: 1440, height: 1000 });
  await expectCompareSnapshot(page, "compare-live-desktop.png");
});

test("mobile live compare layout", async ({ page }) => {
  await preparePresetVisualState(page, { width: 430, height: 932 });
  await expectCompareSnapshot(page, "compare-live-mobile.png");
});

test("desktop boundary detail layout", async ({ page }) => {
  await preparePresetVisualState(page, { width: 1440, height: 1100 });

  const setup = getComparisonSetup(page);
  const boundaryCards = setup.getByTestId("boundary-info-card");

  await setup.getByRole("button", { name: /About This Boundary/i }).click();
  await expect(boundaryCards).toHaveCount(2);
  await boundaryCards.last().scrollIntoViewIfNeeded();
  await expect(boundaryCards.last()).toBeInViewport();
  await expectCompareSnapshot(page, "compare-live-boundary-open-desktop.png");
});

test("mobile boundary detail layout", async ({ page }) => {
  await preparePresetVisualState(page, { width: 430, height: 932 });
  await page
    .getByRole("button", { exact: true, name: "Cities & controls" })
    .click();

  const sheet = page.getByRole("dialog", { name: "Cities & controls" });
  const boundaryCards = sheet.getByTestId("boundary-info-card");

  await sheet.getByRole("button", { name: /About This Boundary/i }).click();
  await expect(boundaryCards).toHaveCount(2);
  await boundaryCards.last().scrollIntoViewIfNeeded();
  await expect(boundaryCards.last()).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByTestId("mobile-comparison-bar")).toBeVisible();
  await expectCompareSnapshot(page, "compare-live-boundary-open-mobile.png");
});

test("desktop search-selected compare layout", async ({ page }) => {
  await prepareSearchVisualState(page, { width: 1440, height: 1000 });
  await expectCompareSnapshot(page, "compare-live-search-desktop.png");
});
