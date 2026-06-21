import { describe, expect, it } from "vitest";

import { getDemoPlaceGeometry } from "@/lib/place/demo";

describe("demo place geometry", () => {
  it("uses fixture-backed real boundary metadata instead of synthetic demo rings", () => {
    const tokyo = getDemoPlaceGeometry("demo:tokyo");

    expect(tokyo).not.toBeNull();
    expect(tokyo?.boundarySource).toBe("osm-fixture");
    expect(tokyo?.boundarySourceLabel).toBe("OpenStreetMap fixture boundary");
    expect(tokyo?.sourceAttribution).toContain("OpenStreetMap contributors");
    expect(tokyo?.areaSqKm).toBeGreaterThan(500);
    expect(tokyo?.areaSqKm).toBeLessThan(800);
  });
});
