import { describe, expect, it } from "vitest";

import {
  resolveMapStyleConfig,
  styleHasRenderableBasemap,
} from "@/lib/map/style";

describe("map style config", () => {
  it("defaults to the live OpenFreeMap style and expects a basemap", () => {
    const config = resolveMapStyleConfig({});

    expect(config.styleUrl).toBe("https://tiles.openfreemap.org/styles/bright");
    expect(config.expectsBasemap).toBe(true);
  });

  it("uses runtime server env values without requiring client-side NEXT_PUBLIC inlining", () => {
    const config = resolveMapStyleConfig({
      NEXT_PUBLIC_MAPLIBRE_STYLE_URL: "http://127.0.0.1:3006/maplibre-test-style.json",
    });

    expect(config.styleUrl).toBe("http://127.0.0.1:3006/maplibre-test-style.json");
    expect(config.expectsBasemap).toBe(false);
  });

  it("detects a style with only a background layer as not having a basemap", () => {
    expect(
      styleHasRenderableBasemap({
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
          },
        ],
      }),
    ).toBe(false);
  });

  it("detects vector or raster source-backed layers as a renderable basemap", () => {
    expect(
      styleHasRenderableBasemap({
        version: 8,
        sources: {
          openmaptiles: {
            type: "vector",
            url: "https://tiles.openfreemap.org/planet",
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
          },
          {
            id: "land",
            source: "openmaptiles",
            "source-layer": "landcover",
            type: "fill",
          },
        ],
      }),
    ).toBe(true);
  });
});
