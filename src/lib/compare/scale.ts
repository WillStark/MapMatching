const EARTH_RADIUS_METERS = 6_378_137;
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * EARTH_RADIUS_METERS;
const WEB_MERCATOR_TILE_SIZE = 512;
const DEFAULT_VIEWPORT_PADDING_PX = 56;
const NICE_SCALE_STEPS = [1, 2, 5, 10] as const;

export type CompareViewportSize = {
  height: number;
  width: number;
};

export type CompareGeometry = {
  bbox: [number, number, number, number];
  centroid: [number, number];
};

function clampLatitude(latitude: number) {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function clampCosine(latitude: number) {
  return Math.max(Math.cos((clampLatitude(latitude) * Math.PI) / 180), 0.000001);
}

function usablePixels(size: number, paddingPx: number) {
  return Math.max(1, size - paddingPx * 2);
}

export function metersPerPixelAtLatitude(latitude: number, zoom: number) {
  return (
    (EARTH_CIRCUMFERENCE_METERS * clampCosine(latitude)) /
    (WEB_MERCATOR_TILE_SIZE * 2 ** zoom)
  );
}

export function zoomForMetersPerPixel(latitude: number, metersPerPixel: number) {
  return Math.log2(
    (EARTH_CIRCUMFERENCE_METERS * clampCosine(latitude)) /
      (WEB_MERCATOR_TILE_SIZE * Math.max(metersPerPixel, 0.000001)),
  );
}

export function getGeometryExtentMeters(geometry: CompareGeometry) {
  const [west, south, east, north] = geometry.bbox;
  const latitude = geometry.centroid[1];
  const heightMeters =
    (Math.abs(north - south) * EARTH_CIRCUMFERENCE_METERS) / 360;
  const widthMeters =
    (Math.abs(east - west) * EARTH_CIRCUMFERENCE_METERS * clampCosine(latitude)) / 360;

  return {
    heightMeters,
    maxDimensionMeters: Math.max(widthMeters, heightMeters),
    widthMeters,
  };
}

export function getMetersPerPixelForGeometryFit({
  geometry,
  paddingPx = DEFAULT_VIEWPORT_PADDING_PX,
  viewport,
}: {
  geometry: CompareGeometry;
  paddingPx?: number;
  viewport: CompareViewportSize;
}) {
  const { heightMeters, widthMeters } = getGeometryExtentMeters(geometry);

  return Math.max(
    widthMeters / usablePixels(viewport.width, paddingPx),
    heightMeters / usablePixels(viewport.height, paddingPx),
  );
}

export function getSharedTargetMetersPerPixel({
  leftGeometry,
  leftViewport,
  paddingPx = DEFAULT_VIEWPORT_PADDING_PX,
  rightGeometry,
  rightViewport,
}: {
  leftGeometry: CompareGeometry;
  leftViewport: CompareViewportSize;
  paddingPx?: number;
  rightGeometry: CompareGeometry;
  rightViewport: CompareViewportSize;
}) {
  return Math.max(
    getMetersPerPixelForGeometryFit({
      geometry: leftGeometry,
      paddingPx,
      viewport: leftViewport,
    }),
    getMetersPerPixelForGeometryFit({
      geometry: rightGeometry,
      paddingPx,
      viewport: rightViewport,
    }),
  );
}

export function getNiceScaleDistanceMeters(
  metersPerPixel: number,
  preferredPixels = 96,
) {
  const rawDistance = Math.max(metersPerPixel * preferredPixels, 1);
  const exponent = 10 ** Math.floor(Math.log10(rawDistance));
  const normalizedDistance = rawDistance / exponent;
  const step =
    NICE_SCALE_STEPS.find((candidate) => normalizedDistance <= candidate) ?? 10;

  return step * exponent;
}

export function formatScaleDistance(distanceMeters: number) {
  if (distanceMeters >= 1_000) {
    const kilometers = distanceMeters / 1_000;

    if (kilometers >= 10 || Number.isInteger(kilometers)) {
      return `${new Intl.NumberFormat("en-US").format(kilometers)} km`;
    }

    return `${kilometers.toFixed(1)} km`;
  }

  return `${new Intl.NumberFormat("en-US").format(Math.round(distanceMeters))} m`;
}
