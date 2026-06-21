import { getDemoPlaceGeometry } from "./demo";
import { getNominatimPlaceGeometry } from "./nominatim";
import type { PlaceGeometry, PlaceGeometryResponse } from "./types";

const PLACE_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

export const NO_BOUNDARY_COPY = "We found the place, but not a clean boundary.";

const placeCache = new Map<
  string,
  {
    expiresAt: number;
    place: PlaceGeometry;
  }
>();

function getCachedPlace(placeId: string) {
  const cached = placeCache.get(placeId);

  if (!cached || cached.expiresAt <= Date.now()) {
    placeCache.delete(placeId);
    return null;
  }

  return cached.place;
}

function cachePlace(place: PlaceGeometry) {
  placeCache.set(place.id, {
    expiresAt: Date.now() + PLACE_CACHE_TTL_MS,
    place,
  });
}

export async function getPlaceGeometry(
  placeId: string,
  acceptLanguage?: string,
): Promise<PlaceGeometryResponse> {
  const cached = getCachedPlace(placeId);

  if (cached) {
    return {
      cached: true,
      place: cached,
    };
  }

  let place: PlaceGeometry | null = null;

  if (placeId.startsWith("demo:")) {
    place = getDemoPlaceGeometry(placeId);
  } else if (placeId.startsWith("nominatim:")) {
    place = await getNominatimPlaceGeometry({
      acceptLanguage,
      placeId,
    });
  }

  if (!place) {
    throw new Error(NO_BOUNDARY_COPY);
  }

  cachePlace(place);

  return {
    cached: false,
    place,
  };
}
