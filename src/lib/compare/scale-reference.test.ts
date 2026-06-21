import { describe, expect, it } from "vitest";

import {
  createScaleMeasurement,
  getLineDistanceMeters,
  getLineMidpoint,
  getScaleMeasurementGeometry,
  getScaleMeasurementLabel,
  translateLineReference,
} from "@/lib/compare/scale-reference";

describe("scale reference math", () => {
  it("measures a familiar line in meters", () => {
    const distance = getLineDistanceMeters(
      [-122.4194, 37.7749],
      [-122.4094, 37.7749],
    );

    expect(distance).toBeGreaterThan(870);
    expect(distance).toBeLessThan(890);
  });

  it("translates a line to a new center while preserving length and bearing", () => {
    const sourceStart: [number, number] = [-122.4194, 37.7749];
    const sourceEnd: [number, number] = [-122.4094, 37.7749];
    const translated = translateLineReference({
      anchor: [2.3522, 48.8566],
      end: sourceEnd,
      start: sourceStart,
    });

    const sourceDistance = getLineDistanceMeters(sourceStart, sourceEnd);
    const translatedDistance = getLineDistanceMeters(
      translated.start,
      translated.end,
    );
    const translatedMidpoint = getLineMidpoint(translated.start, translated.end);

    expect(translatedDistance).toBeCloseTo(sourceDistance, 0);
    expect(translatedMidpoint[0]).toBeCloseTo(2.3522, 4);
    expect(translatedMidpoint[1]).toBeCloseTo(48.8566, 4);
  });

  it("creates one labeled ruler measurement", () => {
    const measurement = createScaleMeasurement({
      sourceSlot: "left",
      start: [-122.4194, 37.7749],
      end: [-122.4094, 37.7749],
      translatedAnchor: [2.3522, 48.8566],
    });

    expect(measurement.distanceMeters).toBeGreaterThan(870);
    expect(measurement.distanceMeters).toBeLessThan(890);
    expect(getScaleMeasurementLabel(measurement)).toMatch(/m$/);
  });

  it("mirrors a ruler measurement to the opposite pane anchor", () => {
    const measurement = createScaleMeasurement({
      sourceSlot: "left",
      start: [-122.4194, 37.7749],
      end: [-122.4094, 37.7749],
      translatedAnchor: [2.3522, 48.8566],
    });
    const mirrored = getScaleMeasurementGeometry(measurement, "right");

    expect(mirrored).not.toBeNull();

    const mirroredMidpoint = getLineMidpoint(mirrored!.start, mirrored!.end);

    expect(mirroredMidpoint[0]).toBeCloseTo(2.3522, 4);
    expect(mirroredMidpoint[1]).toBeCloseTo(48.8566, 4);
    expect(getLineDistanceMeters(mirrored!.start, mirrored!.end)).toBeCloseTo(
      measurement.distanceMeters,
      0,
    );
  });
});
