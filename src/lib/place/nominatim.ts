import type { Geometry } from "geojson";

import type { BoundaryType } from "@/lib/search/types";

import {
  createGeometryFeature,
  getGeometryMetrics,
  simplifyFeature,
} from "./geometry";
import type { PlaceGeometryPayload } from "./types";

const NOMINATIM_MIN_INTERVAL_MS = 1100;
const DEFAULT_POLYGON_THRESHOLD = "0.0005";
let lastNominatimDetailsRequestAt = 0;

type NominatimAddressEntry = {
  class?: string;
  isaddress?: boolean;
  localname?: string;
  place_id?: number;
  rank_address?: number;
  type?: string;
};

type NominatimLookupId =
  | {
      kind: "osm";
      osmId: string;
      osmType: "N" | "R" | "W";
    }
  | {
      kind: "place";
      placeId: string;
    };

type NominatimDetailsResponse = {
  addresstags?: Record<string, string>;
  address?: NominatimAddressEntry[];
  admin_level?: number | string;
  category?: string;
  centroid?: {
    coordinates?: [number, number];
    type?: string;
  };
  country_code?: string;
  geometry?: Geometry;
  localname?: string;
  names?: Record<string, string>;
  place_id?: number;
  type?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeBoundaryType(value?: string): BoundaryType {
  const normalized = value?.toLowerCase() ?? "";

  if (
    [
      "city",
      "town",
      "village",
      "borough",
      "suburb",
      "quarter",
      "hamlet",
      "locality",
      "settlement",
    ].includes(normalized)
  ) {
    return "city";
  }

  if (["municipality", "commune", "district"].includes(normalized)) {
    return "municipality";
  }

  return "admin";
}

function firstNonEmptyString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function getNominatimHeaders() {
  return {
    "User-Agent":
      process.env.NOMINATIM_USER_AGENT ??
      "GeoSync/0.1 (server place-detail proxy; local development)",
  };
}

function parseCountry(details: NominatimDetailsResponse) {
  const addressEntries = details.address ?? [];

  for (const entry of addressEntries) {
    if (entry.type === "country" && entry.localname) {
      return entry.localname;
    }
  }

  return (
    firstNonEmptyString(
      details.addresstags?.country,
      details.names?.["name:en"],
      details.names?.name,
    ) ??
    "Unknown country"
  );
}

function parseName(details: NominatimDetailsResponse) {
  return (
    firstNonEmptyString(
      details.localname,
      details.names?.["name:en"],
      details.names?.name,
      details.addresstags?.city,
      details.addresstags?.town,
      details.addresstags?.municipality,
      details.addresstags?.county,
      details.addresstags?.state,
    ) ??
    "Unknown place"
  );
}

function parseCountryCode(details: NominatimDetailsResponse) {
  return (details.country_code ?? "").toUpperCase();
}

function calmGeometryError(message: string) {
  const error = new Error(message);
  error.name = "GeometryUnavailableError";

  return error;
}

function unsupportedPlaceIdError() {
  const error = new Error("This place link is not supported yet.");
  error.name = "UnsupportedPlaceIdError";

  return error;
}

function parseNominatimLookupId(placeId: string): NominatimLookupId | null {
  const placeIdMatch = /^nominatim:(\d+)$/.exec(placeId);

  if (placeIdMatch) {
    return {
      kind: "place",
      placeId: placeIdMatch[1],
    };
  }

  const osmIdMatch = /^nominatim:([NRW])(\d+)$/i.exec(placeId);

  if (osmIdMatch) {
    return {
      kind: "osm",
      osmId: osmIdMatch[2],
      osmType: osmIdMatch[1].toUpperCase() as "N" | "R" | "W",
    };
  }

  return null;
}

export async function getNominatimPlaceGeometry({
  acceptLanguage,
  placeId,
}: {
  acceptLanguage?: string;
  placeId: string;
}) {
  const lookupId = parseNominatimLookupId(placeId);

  if (!lookupId) {
    throw unsupportedPlaceIdError();
  }

  const now = Date.now();
  const waitMs = Math.max(
    0,
    NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimDetailsRequestAt),
  );

  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastNominatimDetailsRequestAt = Date.now();

  const baseUrl =
    process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org";
  const detailsUrl = new URL("/details", baseUrl);

  if (lookupId.kind === "place") {
    detailsUrl.searchParams.set("place_id", lookupId.placeId);
  } else {
    detailsUrl.searchParams.set("osmtype", lookupId.osmType);
    detailsUrl.searchParams.set("osmid", lookupId.osmId);
  }

  detailsUrl.searchParams.set("format", "json");
  detailsUrl.searchParams.set("addressdetails", "1");
  detailsUrl.searchParams.set("polygon_geojson", "1");
  detailsUrl.searchParams.set(
    "polygon_threshold",
    process.env.NOMINATIM_POLYGON_THRESHOLD ?? DEFAULT_POLYGON_THRESHOLD,
  );

  if (acceptLanguage) {
    detailsUrl.searchParams.set("accept-language", acceptLanguage);
  }

  if (process.env.NOMINATIM_EMAIL) {
    detailsUrl.searchParams.set("email", process.env.NOMINATIM_EMAIL);
  }

  const response = await fetch(detailsUrl, {
    headers: getNominatimHeaders(),
    cache: "no-store",
  });

  if (response.status === 404) {
    const error = new Error("We couldn't find that city boundary.");
    error.name = "PlaceNotFoundError";
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      "Live boundary lookup is unavailable right now. Try again or use a preset.",
    );
    error.name = "UpstreamUnavailableError";
    throw error;
  }

  const details = (await response.json()) as NominatimDetailsResponse;

  if (!details.geometry) {
    throw calmGeometryError("We found the place, but not a clean boundary.");
  }

  const feature = createGeometryFeature(details.geometry);

  if (!feature) {
    throw calmGeometryError("We found the place, but not a clean boundary.");
  }

  const geometry = simplifyFeature(feature, 80);
  const metrics = getGeometryMetrics(geometry);
  const boundaryType = normalizeBoundaryType(
    details.addresstags?.type ?? details.type ?? details.category,
  );

  if (geometry.geometry.type !== "Polygon" && geometry.geometry.type !== "MultiPolygon") {
    throw calmGeometryError("We found the place, but not a clean boundary.");
  }

  if (metrics.areaSqKm <= 0) {
    throw calmGeometryError("We found the place, but not a clean boundary.");
  }

  return {
    id: placeId,
    name: parseName(details),
    country: parseCountry(details),
    countryCode: parseCountryCode(details),
    boundaryType,
    searchSource: "nominatim",
    boundarySource: "nominatim",
    boundarySourceLabel: "OpenStreetMap Nominatim boundary",
    sourceAttribution:
      "Boundary geometry from Nominatim and OpenStreetMap contributors, ODbL 1.0. Simplified by GeoSync.",
    centroid: metrics.centroid,
    bbox: metrics.bbox,
    areaSqKm: metrics.areaSqKm,
    geometry,
  } satisfies PlaceGeometryPayload;
}
