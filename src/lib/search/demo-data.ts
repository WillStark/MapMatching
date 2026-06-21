import type { SearchPlaceSummary } from "./types";

export const DEMO_PLACES: SearchPlaceSummary[] = [
  {
    id: "demo:tokyo",
    name: "Tokyo",
    displayName: "Tokyo, Japan",
    country: "Japan",
    countryCode: "JP",
    lat: 35.6762,
    lng: 139.6503,
    boundaryType: "admin",
    source: "demo",
    areaSqKm: 2194,
  },
  {
    id: "demo:paris",
    name: "Paris",
    displayName: "Paris, France",
    country: "France",
    countryCode: "FR",
    lat: 48.8566,
    lng: 2.3522,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 105,
  },
  {
    id: "demo:seoul",
    name: "Seoul",
    displayName: "Seoul, South Korea",
    country: "South Korea",
    countryCode: "KR",
    lat: 37.5665,
    lng: 126.978,
    boundaryType: "city",
    source: "demo",
    areaSqKm: 605,
  },
  {
    id: "demo:barcelona",
    name: "Barcelona",
    displayName: "Barcelona, Spain",
    country: "Spain",
    countryCode: "ES",
    lat: 41.3874,
    lng: 2.1686,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 101,
  },
  {
    id: "demo:berlin",
    name: "Berlin",
    displayName: "Berlin, Germany",
    country: "Germany",
    countryCode: "DE",
    lat: 52.52,
    lng: 13.405,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 892,
  },
  {
    id: "demo:vienna",
    name: "Vienna",
    displayName: "Vienna, Austria",
    country: "Austria",
    countryCode: "AT",
    lat: 48.2082,
    lng: 16.3738,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 414,
  },
  {
    id: "demo:los-angeles",
    name: "Los Angeles",
    displayName: "Los Angeles, United States",
    country: "United States",
    countryCode: "US",
    lat: 34.0549,
    lng: -118.2426,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 1302,
  },
  {
    id: "demo:chicago",
    name: "Chicago",
    displayName: "Chicago, United States",
    country: "United States",
    countryCode: "US",
    lat: 41.8781,
    lng: -87.6298,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 606,
  },
  {
    id: "demo:london",
    name: "London",
    displayName: "London, United Kingdom",
    country: "United Kingdom",
    countryCode: "GB",
    lat: 51.5072,
    lng: -0.1276,
    boundaryType: "admin",
    source: "demo",
    areaSqKm: 1572,
  },
  {
    id: "demo:new-york",
    name: "New York",
    displayName: "New York, United States",
    country: "United States",
    countryCode: "US",
    lat: 40.7128,
    lng: -74.006,
    boundaryType: "admin",
    source: "demo",
    areaSqKm: 783,
  },
  {
    id: "demo:san-francisco",
    name: "San Francisco",
    displayName: "San Francisco, United States",
    country: "United States",
    countryCode: "US",
    lat: 37.7749,
    lng: -122.4194,
    boundaryType: "municipality",
    source: "demo",
    areaSqKm: 121,
  },
];

export const DEMO_PLACES_BY_ID = new Map(
  DEMO_PLACES.map((place) => [place.id, place]),
);

export function findDemoPlaceById(id: string) {
  return DEMO_PLACES_BY_ID.get(id) ?? null;
}

function scorePlace(place: SearchPlaceSummary, normalizedQuery: string) {
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack =
    `${place.name} ${place.country} ${place.displayName}`.toLowerCase();

  if (!tokens.every((token) => haystack.includes(token))) {
    return -1;
  }

  let score = 0;

  if (place.name.toLowerCase() === normalizedQuery) {
    score += 8;
  }

  if (place.name.toLowerCase().startsWith(normalizedQuery)) {
    score += 4;
  }

  if (place.displayName.toLowerCase().startsWith(normalizedQuery)) {
    score += 2;
  }

  score -= haystack.length / 1000;

  return score;
}

export function findDemoPlaces(query: string, limit: number) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return DEMO_PLACES.map((place) => ({
    place,
    score: scorePlace(place, normalizedQuery),
  }))
    .filter((result) => result.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((result) => result.place);
}
