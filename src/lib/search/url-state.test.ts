import { describe, expect, it } from "vitest";

import { findDemoPlaceById } from "@/lib/search/demo-data";
import {
  buildComparisonRelativeUrl,
  buildInitialCompareState,
} from "@/lib/search/url-state";

describe("compare url state", () => {
  it("falls back to the default preset when the url is empty", () => {
    const state = buildInitialCompareState();

    expect(state.resolution).toBe("default");
    expect(state.urlHadParams).toBe(false);
    expect(state.presetId).toBe("tokyo-paris");
  });

  it("keeps preset urls compact for known comparisons", () => {
    const tokyo = findDemoPlaceById("demo:tokyo");
    const paris = findDemoPlaceById("demo:paris");

    expect(tokyo).toBeTruthy();
    expect(paris).toBeTruthy();
    expect(buildComparisonRelativeUrl(tokyo!, paris!)).toBe(
      "/?preset=tokyo-paris",
    );
  });

  it("supports the London and San Francisco preset", () => {
    const london = findDemoPlaceById("demo:london");
    const sanFrancisco = findDemoPlaceById("demo:san-francisco");

    expect(london).toBeTruthy();
    expect(sanFrancisco).toBeTruthy();
    expect(buildComparisonRelativeUrl(london!, sanFrancisco!)).toBe(
      "/?preset=london-san-francisco",
    );

    const state = buildInitialCompareState({
      preset: "london-san-francisco",
    });

    expect(state.resolution).toBe("preset");
    expect(state.left.id).toBe("demo:london");
    expect(state.right.id).toBe("demo:san-francisco");
  });

  it("restores preset comparisons from the preset query param", () => {
    const state = buildInitialCompareState({
      preset: "tokyo-paris",
    });

    expect(state.resolution).toBe("preset");
    expect(state.urlHadParams).toBe(true);
    expect(state.left.id).toBe("demo:tokyo");
    expect(state.right.id).toBe("demo:paris");
  });

  it("restores custom pair urls from serialized left and right places", () => {
    const state = buildInitialCompareState({
      leftBoundaryType: "city",
      leftCountry: "United States",
      leftCountryCode: "US",
      leftId: "custom:left",
      leftLat: "40.7128",
      leftLng: "-74.0060",
      leftName: "New York",
      leftSource: "nominatim",
      rightBoundaryType: "municipality",
      rightCountry: "Spain",
      rightCountryCode: "ES",
      rightId: "custom:right",
      rightLat: "41.3874",
      rightLng: "2.1686",
      rightName: "Barcelona",
      rightSource: "nominatim",
    });

    expect(state.resolution).toBe("pair");
    expect(state.presetId).toBeNull();
    expect(state.left.displayName).toBe("New York, United States");
    expect(state.right.displayName).toBe("Barcelona, Spain");
  });
});
