export type BoundaryType = "city" | "municipality" | "admin";

export type SearchProviderId = "demo" | "nominatim";

export type SearchPlaceSummary = {
  id: string;
  name: string;
  displayName: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  boundaryType: BoundaryType;
  source: SearchProviderId;
  areaSqKm?: number;
};

export type SearchProviderSearchArgs = {
  acceptLanguage?: string;
  limit: number;
  query: string;
};

export type SearchProvider = {
  id: SearchProviderId;
  search(args: SearchProviderSearchArgs): Promise<SearchPlaceSummary[]>;
};

export type SearchResponse = {
  cached: boolean;
  error?: string;
  provider: SearchProviderId;
  query: string;
  results: SearchPlaceSummary[];
};
