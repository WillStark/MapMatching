import { describe, expect, it } from "vitest";

import { buildHomeMetadata } from "@/lib/share/compare-metadata";

function getFirstOpenGraphImage(metadata: ReturnType<typeof buildHomeMetadata>) {
  const images = metadata.openGraph?.images;

  return Array.isArray(images) ? images[0] : images;
}

describe("compare metadata", () => {
  it("returns generic metadata for the landing route", () => {
    const metadata = buildHomeMetadata();

    expect(metadata.title).toBe("MapMatching | Compare cities at the same scale");
    expect(metadata.alternates?.canonical).toBe("/");
    expect(getFirstOpenGraphImage(metadata)).toMatchObject({
      url: "/api/og",
    });
  });

  it("returns compare-specific metadata for preset urls", () => {
    const metadata = buildHomeMetadata({
      preset: "tokyo-paris",
    });

    expect(metadata.title).toBe("Tokyo vs Paris | MapMatching");
    expect(metadata.alternates?.canonical).toBe("/?preset=tokyo-paris");
    expect(metadata.description).toContain(
      "Tokyo covers about 20.9 times the area of Paris.",
    );
    expect(metadata.description).toContain("an administrative boundary");
    expect(getFirstOpenGraphImage(metadata)).toMatchObject({
      url: "/api/og?preset=tokyo-paris",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
    });
  });
});
