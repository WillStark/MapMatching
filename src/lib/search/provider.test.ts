import { afterEach, describe, expect, it, vi } from "vitest";

import { getSearchProviderId, searchProviders } from "./provider";

const originalProvider = process.env.MAPCOMPARE_SEARCH_PROVIDER;

describe("search provider selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();

    if (typeof originalProvider === "string") {
      process.env.MAPCOMPARE_SEARCH_PROVIDER = originalProvider;
      return;
    }

    delete process.env.MAPCOMPARE_SEARCH_PROVIDER;
  });

  it("uses live global search when no provider is configured", () => {
    delete process.env.MAPCOMPARE_SEARCH_PROVIDER;

    expect(getSearchProviderId()).toBe("nominatim");
  });

  it("allows demo search to be selected explicitly", () => {
    process.env.MAPCOMPARE_SEARCH_PROVIDER = "demo";

    expect(getSearchProviderId()).toBe("demo");
  });

  it("keeps live global search for unknown provider config", () => {
    process.env.MAPCOMPARE_SEARCH_PROVIDER = "unknown";

    expect(getSearchProviderId()).toBe("nominatim");
  });

  it("uses stable OSM IDs for live polygon-backed search results", async () => {
    vi.stubGlobal(
      "fetch",
      async (url: string | URL | Request) => {
        const searchUrl = new URL(url.toString());

        expect(searchUrl.searchParams.get("polygon_geojson")).toBe("1");
        expect(searchUrl.searchParams.has("featureType")).toBe(false);

        return new Response(
          JSON.stringify([
            {
              place_id: 45835799,
              osm_type: "relation",
              osm_id: 4479752,
              lat: "25.2647227",
              lon: "55.2924146",
              display_name: "Dubai, Dubai Emirate, United Arab Emirates",
              name: "Dubai",
              type: "administrative",
              addresstype: "administrative",
              address: {
                administrative: "Dubai",
                country: "United Arab Emirates",
                country_code: "ae",
              },
              geojson: {
                type: "MultiPolygon",
                coordinates: [],
              },
            },
          ]),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        );
      },
    );

    const results = await searchProviders.nominatim.search({
      acceptLanguage: "en-US",
      limit: 5,
      query: "Dubai",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      boundaryType: "admin",
      country: "United Arab Emirates",
      countryCode: "AE",
      id: "nominatim:R4479752",
      name: "Dubai",
      source: "nominatim",
    });
  });
});
