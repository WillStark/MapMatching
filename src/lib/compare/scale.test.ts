import { describe, expect, it } from "vitest";

import {
  formatScaleDistance,
  getGeometryExtentMeters,
  getMetersPerPixelForGeometryFit,
  getNiceScaleDistanceMeters,
  getSharedTargetMetersPerPixel,
  metersPerPixelAtLatitude,
  zoomForMetersPerPixel,
} from "@/lib/compare/scale";

describe("compare scale math", () => {
  it("round-trips meters per pixel through zoom across latitudes", () => {
    const samples = [
      { latitude: 0, zoom: 10 },
      { latitude: 35.6762, zoom: 11.5 },
      { latitude: 48.8566, zoom: 12.25 },
    ];

    for (const sample of samples) {
      const metersPerPixel = metersPerPixelAtLatitude(
        sample.latitude,
        sample.zoom,
      );
      const resolvedZoom = zoomForMetersPerPixel(
        sample.latitude,
        metersPerPixel,
      );

      expect(resolvedZoom).toBeCloseTo(sample.zoom, 10);
    }
  });

  it("computes geometry extents from a bbox", () => {
    const extent = getGeometryExtentMeters({
      bbox: [0, 0, 1, 2],
      centroid: [0.5, 1],
    });

    expect(extent.heightMeters).toBeGreaterThan(extent.widthMeters);
    expect(extent.maxDimensionMeters).toBe(extent.heightMeters);
  });

  it("uses the larger viewport fit when syncing two panes", () => {
    const leftFit = getMetersPerPixelForGeometryFit({
      geometry: {
        bbox: [0, 0, 1, 1],
        centroid: [0.5, 0.5],
      },
      viewport: {
        height: 640,
        width: 640,
      },
    });

    const rightFit = getMetersPerPixelForGeometryFit({
      geometry: {
        bbox: [0, 0, 2.2, 2.2],
        centroid: [1.1, 1.1],
      },
      viewport: {
        height: 640,
        width: 640,
      },
    });

    const sharedFit = getSharedTargetMetersPerPixel({
      leftGeometry: {
        bbox: [0, 0, 1, 1],
        centroid: [0.5, 0.5],
      },
      leftViewport: {
        height: 640,
        width: 640,
      },
      rightGeometry: {
        bbox: [0, 0, 2.2, 2.2],
        centroid: [1.1, 1.1],
      },
      rightViewport: {
        height: 640,
        width: 640,
      },
    });

    expect(sharedFit).toBeCloseTo(Math.max(leftFit, rightFit), 10);
    expect(sharedFit).toBeCloseTo(rightFit, 10);
  });

  it("snaps ruler distances to friendly values", () => {
    expect(getNiceScaleDistanceMeters(1.7, 96)).toBe(200);
    expect(getNiceScaleDistanceMeters(0.42, 96)).toBe(50);
  });

  it("formats meter and kilometer ruler labels cleanly", () => {
    expect(formatScaleDistance(240)).toBe("240 m");
    expect(formatScaleDistance(1_500)).toBe("1.5 km");
    expect(formatScaleDistance(20_000)).toBe("20 km");
  });
});
