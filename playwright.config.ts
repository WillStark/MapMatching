import { defineConfig } from "@playwright/test";

const visualPort = 3006;
const visualBaseUrl = `http://127.0.0.1:${visualPort}`;
const visualStyleUrl = `${visualBaseUrl}/maplibre-test-style.json`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: visualBaseUrl,
    browserName: "chromium",
    channel: "chrome",
    colorScheme: "light",
    headless: true,
    locale: "en-US",
    viewport: {
      height: 1600,
      width: 1440,
    },
  },
  webServer: {
    command:
      `MAPCOMPARE_SEARCH_PROVIDER=demo MAPCOMPARE_MAP_STYLE_URL=${visualStyleUrl} MAPCOMPARE_EXPECT_BASEMAP=false npm run build && MAPCOMPARE_SEARCH_PROVIDER=demo MAPCOMPARE_MAP_STYLE_URL=${visualStyleUrl} MAPCOMPARE_EXPECT_BASEMAP=false ./node_modules/.bin/next start --hostname 127.0.0.1 --port ${visualPort}`,
    reuseExistingServer: false,
    timeout: 180_000,
    url: visualBaseUrl,
  },
});
