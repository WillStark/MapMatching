import { afterEach, describe, expect, it, vi } from "vitest";

import { getNominatimPlaceGeometry } from "./nominatim";

describe("Nominatim place geometry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves stable OSM relation IDs through details lookup", async () => {
    vi.stubGlobal(
      "fetch",
      async (url: string | URL | Request) => {
        const detailsUrl = new URL(url.toString());

        expect(detailsUrl.pathname).toBe("/details");
        expect(detailsUrl.searchParams.get("osmtype")).toBe("R");
        expect(detailsUrl.searchParams.get("osmid")).toBe("4479752");
        expect(detailsUrl.searchParams.has("place_id")).toBe(false);

        return new Response(
          JSON.stringify({
            address: [
              {
                localname: "Dubai",
                type: "administrative",
              },
              {
                localname: "United Arab Emirates",
                type: "country",
              },
            ],
            category: "boundary",
            country_code: "ae",
            geometry: {
              coordinates: [
                [
                  [55, 25],
                  [55.2, 25],
                  [55.2, 25.2],
                  [55, 25.2],
                  [55, 25],
                ],
              ],
              type: "Polygon",
            },
            localname: "Dubai",
            names: {
              name: "دبي",
              "name:en": "Dubai",
            },
            type: "administrative",
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        );
      },
    );

    const place = await getNominatimPlaceGeometry({
      acceptLanguage: "en-US",
      placeId: "nominatim:R4479752",
    });

    expect(place).toMatchObject({
      boundaryType: "admin",
      country: "United Arab Emirates",
      countryCode: "AE",
      id: "nominatim:R4479752",
      name: "Dubai",
      searchSource: "nominatim",
    });
    expect(place.areaSqKm).toBeGreaterThan(0);
  });
});
