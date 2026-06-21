import { NextRequest, NextResponse } from "next/server";

import { getSearchProvider, getSearchProviderById } from "@/lib/search/provider";
import type {
  SearchPlaceSummary,
  SearchProviderId,
  SearchResponse,
} from "@/lib/search/types";

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const SEARCH_UNAVAILABLE_COPY =
  "Live city search is unavailable right now. Use a preset or try again.";

const searchCache = new Map<
  string,
  {
    expiresAt: number;
    results: SearchPlaceSummary[];
  }
>();

function clampLimit(limitParam: string | null) {
  const parsed = Number(limitParam ?? "5");

  if (!Number.isFinite(parsed)) {
    return 5;
  }

  return Math.max(1, Math.min(Math.round(parsed), 6));
}

function buildCacheKey({
  acceptLanguage,
  limit,
  providerId,
  query,
}: {
  acceptLanguage?: string;
  limit: number;
  providerId: string;
  query: string;
}) {
  return JSON.stringify({
    acceptLanguage: acceptLanguage ?? "",
    limit,
    providerId,
    query: query.toLowerCase(),
  });
}

function cacheResponse({
  acceptLanguage,
  limit,
  providerId,
  query,
  results,
}: {
  acceptLanguage?: string;
  limit: number;
  providerId: SearchProviderId;
  query: string;
  results: SearchPlaceSummary[];
}) {
  searchCache.set(
    buildCacheKey({
      acceptLanguage,
      limit,
      providerId,
      query,
    }),
    {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      results,
    },
  );
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));

  if (query.length < 2) {
    return NextResponse.json(
      { error: "Search terms need at least 2 characters." },
      { status: 400 },
    );
  }

  const provider = getSearchProvider();
  const acceptLanguage = request.headers.get("accept-language") ?? undefined;
  const cacheKey = buildCacheKey({
    acceptLanguage,
    limit,
    providerId: provider.id,
    query,
  });
  const cached = searchCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      cached: true,
      provider: provider.id,
      query,
      results: cached.results,
    } satisfies SearchResponse);
  }

  try {
    const results = await provider.search({ acceptLanguage, limit, query });

    cacheResponse({
      acceptLanguage,
      limit,
      providerId: provider.id,
      query,
      results,
    });

    return NextResponse.json({
      cached: false,
      provider: provider.id,
      query,
      results,
    } satisfies SearchResponse);
  } catch (error) {
    console.error("Search provider failed", error);

    if (provider.id !== "demo") {
      const fallbackProvider = getSearchProviderById("demo");
      const fallbackResults = await fallbackProvider.search({
        acceptLanguage,
        limit,
        query,
      });

      cacheResponse({
        acceptLanguage,
        limit,
        providerId: "demo",
        query,
        results: fallbackResults,
      });

      return NextResponse.json({
        cached: false,
        provider: "demo",
        query,
        results: fallbackResults,
      } satisfies SearchResponse);
    }

    return NextResponse.json(
      {
        error: SEARCH_UNAVAILABLE_COPY,
        cached: false,
        provider: provider.id,
        query,
        results: [],
      } satisfies SearchResponse,
      { status: 503 },
    );
  }
}
