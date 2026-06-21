import { findDemoPlaceById } from "@/lib/search/demo-data";

import {
  createGeometryFeature,
  getGeometryMetrics,
} from "./geometry";
import { DEMO_BOUNDARY_FIXTURES } from "./demo-boundary-fixtures";
import type { PlaceGeometryPayload } from "./types";

export function getDemoPlaceGeometry(placeId: string): PlaceGeometryPayload | null {
  const place = findDemoPlaceById(placeId);
  const fixture = DEMO_BOUNDARY_FIXTURES[placeId];

  if (!place || !fixture) {
    return null;
  }

  const geometry = createGeometryFeature(fixture.geometry);

  if (!geometry) {
    return null;
  }

  const metrics = getGeometryMetrics(geometry);

  return {
    id: place.id,
    name: place.name,
    country: place.country,
    countryCode: place.countryCode,
    boundaryType: place.boundaryType,
    searchSource: "demo",
    boundarySource: "osm-fixture",
    boundarySourceLabel: "OpenStreetMap fixture boundary",
    sourceAttribution:
      `Boundary fixture from OpenStreetMap contributors, ODbL 1.0. OSM ${fixture.osmType} ${fixture.osmId}; simplified by Nominatim and bundled by GeoSync.`,
    centroid: metrics.centroid,
    bbox: metrics.bbox,
    areaSqKm: metrics.areaSqKm,
    geometry,
  };
}
