import { formatScaleDistance } from "@/lib/compare/scale";

const EARTH_RADIUS_METERS = 6_378_137;

export type GeoPoint = [number, number];
export type ScaleReferenceSlot = "left" | "right";

export type ScaleMeasurement = {
  distanceMeters: number;
  end: GeoPoint;
  sourceSlot: ScaleReferenceSlot;
  start: GeoPoint;
  translatedAnchor?: GeoPoint;
};

export function createScaleMeasurement({
  end,
  sourceSlot,
  start,
  translatedAnchor,
}: {
  end: GeoPoint;
  sourceSlot: ScaleReferenceSlot;
  start: GeoPoint;
  translatedAnchor?: GeoPoint;
}) {
  return {
    distanceMeters: getLineDistanceMeters(start, end),
    end,
    sourceSlot,
    start,
    translatedAnchor,
  } satisfies ScaleMeasurement;
}

export function getScaleMeasurementLabel(measurement: ScaleMeasurement) {
  return formatScaleDistance(measurement.distanceMeters);
}

export function getScaleMeasurementGeometry(
  measurement: ScaleMeasurement,
  slot: ScaleReferenceSlot,
) {
  if (measurement.sourceSlot === slot) {
    return {
      end: measurement.end,
      start: measurement.start,
    };
  }

  if (!measurement.translatedAnchor) {
    return null;
  }

  return translateLineReference({
    anchor: measurement.translatedAnchor,
    end: measurement.end,
    start: measurement.start,
  });
}

type ProjectedPoint = {
  x: number;
  y: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function clampCosine(latitude: number) {
  return Math.max(Math.cos(toRadians(latitude)), 0.000001);
}

function projectPosition(position: GeoPoint, referenceLatitude: number) {
  return {
    x:
      EARTH_RADIUS_METERS *
      toRadians(position[0]) *
      clampCosine(referenceLatitude),
    y: EARTH_RADIUS_METERS * toRadians(position[1]),
  } satisfies ProjectedPoint;
}

function unprojectPoint(
  point: ProjectedPoint,
  referenceLatitude: number,
): GeoPoint {
  return [
    toDegrees(point.x / (EARTH_RADIUS_METERS * clampCosine(referenceLatitude))),
    toDegrees(point.y / EARTH_RADIUS_METERS),
  ];
}

function getReferenceLatitude(...positions: GeoPoint[]) {
  return (
    positions.reduce((total, position) => total + position[1], 0) /
    Math.max(positions.length, 1)
  );
}

export function getLineDistanceMeters(start: GeoPoint, end: GeoPoint) {
  const referenceLatitude = getReferenceLatitude(start, end);
  const projectedStart = projectPosition(start, referenceLatitude);
  const projectedEnd = projectPosition(end, referenceLatitude);

  return Math.hypot(
    projectedEnd.x - projectedStart.x,
    projectedEnd.y - projectedStart.y,
  );
}

export function getLineMidpoint(start: GeoPoint, end: GeoPoint): GeoPoint {
  const referenceLatitude = getReferenceLatitude(start, end);
  const projectedStart = projectPosition(start, referenceLatitude);
  const projectedEnd = projectPosition(end, referenceLatitude);

  return unprojectPoint(
    {
      x: (projectedStart.x + projectedEnd.x) / 2,
      y: (projectedStart.y + projectedEnd.y) / 2,
    },
    referenceLatitude,
  );
}

export function translateLineReference({
  anchor,
  end,
  start,
}: {
  anchor: GeoPoint;
  end: GeoPoint;
  start: GeoPoint;
}) {
  const sourceReferenceLatitude = getReferenceLatitude(start, end);
  const targetReferenceLatitude = anchor[1];
  const projectedStart = projectPosition(start, sourceReferenceLatitude);
  const projectedEnd = projectPosition(end, sourceReferenceLatitude);
  const projectedAnchor = projectPosition(anchor, targetReferenceLatitude);
  const delta = {
    x: projectedEnd.x - projectedStart.x,
    y: projectedEnd.y - projectedStart.y,
  };

  return {
    end: unprojectPoint(
      {
        x: projectedAnchor.x + delta.x / 2,
        y: projectedAnchor.y + delta.y / 2,
      },
      targetReferenceLatitude,
    ),
    start: unprojectPoint(
      {
        x: projectedAnchor.x - delta.x / 2,
        y: projectedAnchor.y - delta.y / 2,
      },
      targetReferenceLatitude,
    ),
  };
}
