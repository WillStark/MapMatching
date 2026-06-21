import type { Geometry, MultiPolygon, Polygon, Position } from "geojson";

import type { PlaceGeometryFeature } from "./types";

const EARTH_RADIUS_METERS = 6_378_137;

type ProjectedPoint = {
  x: number;
  y: number;
};

type RingMetrics = {
  areaMetersSq: number;
  centroidMeters: ProjectedPoint | null;
};

type GeometryMetrics = {
  areaSqKm: number;
  bbox: [number, number, number, number];
  centroid: [number, number];
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function isFinitePosition(position: Position): position is [number, number] {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1])
  );
}

function positionsEqual(left: [number, number], right: [number, number]) {
  return left[0] === right[0] && left[1] === right[1];
}

function clonePosition(position: [number, number]): [number, number] {
  return [position[0], position[1]];
}

function normalizeRing(ring: Position[]) {
  const normalized: [number, number][] = [];

  for (const position of ring) {
    if (!isFinitePosition(position)) {
      continue;
    }

    const nextPosition: [number, number] = [position[0], position[1]];
    const previous = normalized[normalized.length - 1];

    if (!previous || !positionsEqual(previous, nextPosition)) {
      normalized.push(nextPosition);
    }
  }

  if (normalized.length < 3) {
    return null;
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];

  if (!positionsEqual(first, last)) {
    normalized.push(clonePosition(first));
  }

  if (normalized.length < 4) {
    return null;
  }

  return normalized;
}

function simplifyRing(
  ring: [number, number][],
  toleranceMeters: number,
  referenceLatitude: number,
) {
  if (ring.length <= 8) {
    return ring;
  }

  const openRing = ring.slice(0, -1);
  const kept: [number, number][] = [clonePosition(openRing[0])];
  let lastProjected = projectPosition(openRing[0], referenceLatitude);

  for (let index = 1; index < openRing.length; index += 1) {
    const current = openRing[index];
    const projected = projectPosition(current, referenceLatitude);
    const isLastPoint = index === openRing.length - 1;
    const deltaX = projected.x - lastProjected.x;
    const deltaY = projected.y - lastProjected.y;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance >= toleranceMeters || isLastPoint) {
      kept.push(clonePosition(current));
      lastProjected = projected;
    }
  }

  if (kept.length < 3) {
    return ring;
  }

  kept.push(clonePosition(kept[0]));

  return kept;
}

function normalizePolygonCoordinates(coordinates: Position[][]) {
  const normalized = coordinates
    .map((ring) => normalizeRing(ring))
    .filter((ring): ring is [number, number][] => Boolean(ring));

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function normalizeMultiPolygonCoordinates(coordinates: Position[][][]) {
  const normalized = coordinates
    .map((polygon) => normalizePolygonCoordinates(polygon))
    .filter((polygon): polygon is [number, number][][] => Boolean(polygon));

  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

export function normalizeGeometry(geometry: Geometry) {
  if (geometry.type === "Polygon") {
    const coordinates = normalizePolygonCoordinates(geometry.coordinates);

    if (!coordinates) {
      return null;
    }

    return {
      type: "Polygon",
      coordinates,
    } satisfies Polygon;
  }

  if (geometry.type === "MultiPolygon") {
    const coordinates = normalizeMultiPolygonCoordinates(geometry.coordinates);

    if (!coordinates) {
      return null;
    }

    return {
      type: "MultiPolygon",
      coordinates,
    } satisfies MultiPolygon;
  }

  return null;
}

export function createGeometryFeature(geometry: Geometry) {
  const normalized = normalizeGeometry(geometry);

  if (!normalized) {
    return null;
  }

  return {
    type: "Feature",
    properties: {},
    geometry: normalized,
  } satisfies PlaceGeometryFeature;
}

function projectPosition(
  position: [number, number],
  referenceLatitude: number,
): ProjectedPoint {
  return {
    x:
      EARTH_RADIUS_METERS *
      toRadians(position[0]) *
      Math.cos(toRadians(referenceLatitude)),
    y: EARTH_RADIUS_METERS * toRadians(position[1]),
  };
}

function unprojectPoint(
  point: ProjectedPoint,
  referenceLatitude: number,
): [number, number] {
  return [
    toDegrees(point.x / (EARTH_RADIUS_METERS * Math.cos(toRadians(referenceLatitude)))),
    toDegrees(point.y / EARTH_RADIUS_METERS),
  ];
}

function getRingMetrics(
  ring: [number, number][],
  referenceLatitude: number,
): RingMetrics {
  let areaAccumulator = 0;
  let centroidXAccumulator = 0;
  let centroidYAccumulator = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = projectPosition(ring[index], referenceLatitude);
    const next = projectPosition(ring[index + 1], referenceLatitude);
    const cross = current.x * next.y - next.x * current.y;

    areaAccumulator += cross;
    centroidXAccumulator += (current.x + next.x) * cross;
    centroidYAccumulator += (current.y + next.y) * cross;
  }

  const signedArea = areaAccumulator / 2;

  if (signedArea === 0) {
    return {
      areaMetersSq: 0,
      centroidMeters: null,
    };
  }

  return {
    areaMetersSq: Math.abs(signedArea),
    centroidMeters: {
      x: centroidXAccumulator / (6 * signedArea),
      y: centroidYAccumulator / (6 * signedArea),
    },
  };
}

function getGeometryCoordinates(
  feature: PlaceGeometryFeature,
): Position[][][] {
  if (feature.geometry.type === "Polygon") {
    return [feature.geometry.coordinates];
  }

  return feature.geometry.coordinates;
}

export function getFeatureBbox(feature: PlaceGeometryFeature) {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const polygon of getGeometryCoordinates(feature)) {
    for (const ring of polygon) {
      for (const position of ring) {
        if (!isFinitePosition(position)) {
          continue;
        }

        const [lng, lat] = position;
        west = Math.min(west, lng);
        south = Math.min(south, lat);
        east = Math.max(east, lng);
        north = Math.max(north, lat);
      }
    }
  }

  return [west, south, east, north] as [number, number, number, number];
}

export function simplifyFeature(
  feature: PlaceGeometryFeature,
  toleranceMeters = 90,
) {
  const [, south, , north] = getFeatureBbox(feature);
  const referenceLatitude = (south + north) / 2;

  if (feature.geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: {
        type: "Polygon",
        coordinates: feature.geometry.coordinates.map((ring: Position[]) =>
          simplifyRing(
            ring as [number, number][],
            toleranceMeters,
            referenceLatitude,
          ),
        ),
      },
    } satisfies PlaceGeometryFeature;
  }

  return {
    ...feature,
    geometry: {
      type: "MultiPolygon",
      coordinates: feature.geometry.coordinates.map((polygon: Position[][]) =>
        polygon.map((ring: Position[]) =>
            simplifyRing(ring as [number, number][], toleranceMeters, referenceLatitude),
        ),
        ),
    },
  } satisfies PlaceGeometryFeature;
}

export function getGeometryMetrics(feature: PlaceGeometryFeature): GeometryMetrics {
  const bbox = getFeatureBbox(feature);
  const [, south, , north] = bbox;
  const referenceLatitude = (south + north) / 2;
  let totalAreaMetersSq = 0;
  let centroidXAccumulator = 0;
  let centroidYAccumulator = 0;

  for (const polygon of getGeometryCoordinates(feature)) {
    for (const [ringIndex, ring] of polygon.entries()) {
      const ringMetrics = getRingMetrics(
        ring as [number, number][],
        referenceLatitude,
      );

      if (!ringMetrics.centroidMeters || ringMetrics.areaMetersSq === 0) {
        continue;
      }

      const signedArea = ringIndex === 0 ? ringMetrics.areaMetersSq : -ringMetrics.areaMetersSq;

      totalAreaMetersSq += signedArea;
      centroidXAccumulator += ringMetrics.centroidMeters.x * signedArea;
      centroidYAccumulator += ringMetrics.centroidMeters.y * signedArea;
    }
  }

  if (totalAreaMetersSq <= 0) {
    const centroid: [number, number] = [
      (bbox[0] + bbox[2]) / 2,
      (bbox[1] + bbox[3]) / 2,
    ];

    return {
      areaSqKm: 0,
      bbox,
      centroid,
    };
  }

  const centroid = unprojectPoint(
    {
      x: centroidXAccumulator / totalAreaMetersSq,
      y: centroidYAccumulator / totalAreaMetersSq,
    },
    referenceLatitude,
  );

  return {
    areaSqKm: totalAreaMetersSq / 1_000_000,
    bbox,
    centroid,
  };
}

export function createPolygonFeatureFromMeters(
  ringMeters: ProjectedPoint[],
  center: [number, number],
) {
  const positions = ringMeters.map((point) => {
    const lng = center[0] + toDegrees(point.x / (EARTH_RADIUS_METERS * Math.cos(toRadians(center[1]))));
    const lat = center[1] + toDegrees(point.y / EARTH_RADIUS_METERS);

    return [lng, lat] as [number, number];
  });

  const geometry = {
    type: "Polygon",
    coordinates: [positions],
  } satisfies Polygon;

  return createGeometryFeature(geometry);
}

export function getPlanarRingArea(ring: ProjectedPoint[]) {
  let areaAccumulator = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];

    areaAccumulator += current.x * next.y - next.x * current.y;
  }

  return Math.abs(areaAccumulator / 2);
}

export function closeProjectedRing(ring: ProjectedPoint[]) {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (first.x === last.x && first.y === last.y) {
    return ring;
  }

  return [...ring, { x: first.x, y: first.y }];
}
