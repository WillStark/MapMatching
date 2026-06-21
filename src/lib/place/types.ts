import type { Feature, MultiPolygon, Polygon } from "geojson";

import type { BoundaryType, SearchProviderId } from "@/lib/search/types";

export type PlaceGeometry = {
  areaSqKm: number;
  bbox: [number, number, number, number];
  boundarySource: string;
  boundarySourceLabel: string;
  boundaryType: BoundaryType;
  centroid: [number, number];
  country: string;
  countryCode: string;
  geometry: Feature<Polygon | MultiPolygon>;
  id: string;
  name: string;
  searchSource: SearchProviderId;
  sourceAttribution: string;
};

export type PlaceGeometryFeature = Feature<Polygon | MultiPolygon>;
export type PlaceGeometryPayload = PlaceGeometry;

export type PlaceGeometryResponse = {
  cached: boolean;
  place: PlaceGeometry;
};
