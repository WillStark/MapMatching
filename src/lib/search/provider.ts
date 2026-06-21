import { findDemoPlaces } from "./demo-data";
import type {
  BoundaryType,
  SearchPlaceSummary,
  SearchProvider,
  SearchProviderId,
} from "./types";

const NOMINATIM_MIN_INTERVAL_MS = 1100;
let lastNominatimRequestAt = 0;

type NominatimResponseItem = {
  place_id: number;
  geojson?: {
    type?: string;
  };
  osm_id?: number;
  osm_type?: string;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  addresstype?: string;
  address?: {
    city?: string;
    administrative?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
};

const cityLikeTypes = new Set([
  "administrative",
  "borough",
  "city",
  "commune",
  "county",
  "district",
  "locality",
  "municipality",
  "province",
  "quarter",
  "state",
  "suburb",
  "town",
  "village",
]);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clamp(limit: number) {
  return Math.max(1, Math.min(limit, 6));
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
    ].includes(normalized)
  ) {
    return "city";
  }

  if (["municipality", "commune", "district"].includes(normalized)) {
    return "municipality";
  }

  return "admin";
}

function pickName(item: NominatimResponseItem) {
  return (
    item.name ??
    item.address?.administrative ??
    item.address?.city ??
    item.address?.town ??
    item.address?.village ??
    item.address?.municipality ??
    item.address?.county ??
    item.address?.state ??
    item.display_name.split(",")[0]?.trim() ??
    "Unknown place"
  );
}

function getOsmTypePrefix(osmType?: string) {
  const normalized = osmType?.toLowerCase() ?? "";

  if (normalized === "node" || normalized === "n") {
    return "N";
  }

  if (normalized === "way" || normalized === "w") {
    return "W";
  }

  if (normalized === "relation" || normalized === "r") {
    return "R";
  }

  return null;
}

function getNominatimItemId(item: NominatimResponseItem) {
  const osmTypePrefix = getOsmTypePrefix(item.osm_type);

  if (osmTypePrefix && typeof item.osm_id === "number") {
    return `nominatim:${osmTypePrefix}${item.osm_id}`;
  }

  return `nominatim:${item.place_id}`;
}

function mapNominatimItem(item: NominatimResponseItem): SearchPlaceSummary {
  const name = pickName(item);
  const country = item.address?.country ?? "Unknown country";
  const boundaryType = normalizeBoundaryType(item.addresstype ?? item.type);

  return {
    id: getNominatimItemId(item),
    name,
    displayName: item.display_name,
    country,
    countryCode: (item.address?.country_code ?? "").toUpperCase(),
    lat: Number(item.lat),
    lng: Number(item.lon),
    boundaryType,
    source: "nominatim",
  };
}

function isCityLike(item: NominatimResponseItem) {
  const normalized = (item.addresstype ?? item.type ?? "").toLowerCase();

  return cityLikeTypes.has(normalized);
}

function hasBoundaryGeometry(item: NominatimResponseItem) {
  return item.geojson?.type === "Polygon" || item.geojson?.type === "MultiPolygon";
}

function getNominatimHeaders() {
  return {
    "User-Agent":
      process.env.NOMINATIM_USER_AGENT ??
      "MapMatching/0.1 (server search proxy; local development)",
  };
}

const demoProvider: SearchProvider = {
  id: "demo",
  async search({ limit, query }) {
    return findDemoPlaces(query, clamp(limit));
  },
};

const nominatimProvider: SearchProvider = {
  id: "nominatim",
  async search({ acceptLanguage, limit, query }) {
    const now = Date.now();
    const waitMs = Math.max(
      0,
      NOMINATIM_MIN_INTERVAL_MS - (now - lastNominatimRequestAt),
    );

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastNominatimRequestAt = Date.now();

    const baseUrl =
      process.env.NOMINATIM_BASE_URL ?? "https://nominatim.openstreetmap.org";
    const searchUrl = new URL("/search", baseUrl);

    searchUrl.searchParams.set("format", "jsonv2");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", String(Math.max(clamp(limit), 10)));
    searchUrl.searchParams.set("addressdetails", "1");
    searchUrl.searchParams.set("dedupe", "1");
    searchUrl.searchParams.set("polygon_geojson", "1");

    if (acceptLanguage) {
      searchUrl.searchParams.set("accept-language", acceptLanguage);
    }

    if (process.env.NOMINATIM_EMAIL) {
      searchUrl.searchParams.set("email", process.env.NOMINATIM_EMAIL);
    }

    const response = await fetch(searchUrl, {
      headers: getNominatimHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Nominatim search failed with ${response.status}`);
    }

    const items = (await response.json()) as NominatimResponseItem[];

    return items
      .filter(isCityLike)
      .filter(hasBoundaryGeometry)
      .map(mapNominatimItem)
      .filter((item) => item.name && item.country)
      .slice(0, clamp(limit));
  },
};

export const searchProviders = {
  demo: demoProvider,
  nominatim: nominatimProvider,
} as const satisfies Record<SearchProviderId, SearchProvider>;

export function getSearchProviderId(): SearchProviderId {
  const configuredProvider = process.env.MAPCOMPARE_SEARCH_PROVIDER?.toLowerCase();

  if (configuredProvider === "nominatim") {
    return "nominatim";
  }

  if (configuredProvider === "demo") {
    return "demo";
  }

  return "nominatim";
}

export function getSearchProvider() {
  return searchProviders[getSearchProviderId()];
}

export function getSearchProviderById(providerId: SearchProviderId) {
  return searchProviders[providerId];
}
