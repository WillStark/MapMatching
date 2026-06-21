import type { Metadata } from "next";

import {
  buildComparisonRelativeUrl,
  buildInitialCompareState,
  type CompareSearchParams,
  type CompareInitialState,
} from "@/lib/search/url-state";
import type { BoundaryType, SearchPlaceSummary } from "@/lib/search/types";

const boundaryLabels: Record<BoundaryType, string> = {
  admin: "Administrative boundary",
  city: "City boundary",
  municipality: "Municipal boundary",
};

const genericTitle = "MapMatching | Compare cities at the same scale";
const genericDescription =
  "Search and compare two cities at the same real-world scale with shareable URLs, normalized boundaries, and side-by-side MapLibre views.";

function normalizeSiteUrl(rawUrl: string) {
  return rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
    ? rawUrl
    : `https://${rawUrl}`;
}

export function resolveMetadataBase() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    "http://localhost:3000";

  return new URL(normalizeSiteUrl(siteUrl));
}

export function getMetadataBase() {
  return resolveMetadataBase();
}

function formatCompareSummary(
  left: Pick<SearchPlaceSummary, "areaSqKm" | "name">,
  right: Pick<SearchPlaceSummary, "areaSqKm" | "name">,
) {
  if (typeof left.areaSqKm === "number" && typeof right.areaSqKm === "number") {
    const ratio = left.areaSqKm / right.areaSqKm;

    if (ratio >= 1) {
      return `${left.name} covers about ${ratio.toFixed(1)} times the area of ${right.name}.`;
    }

    return `${left.name} covers about ${Math.round(ratio * 100)}% of ${right.name}'s area.`;
  }

  return `${left.name} and ${right.name} are staged for equal-scale comparison.`;
}

function buildComparePath(left: SearchPlaceSummary, right: SearchPlaceSummary) {
  return buildComparisonRelativeUrl(left, right);
}

function buildOgImagePath(left: SearchPlaceSummary, right: SearchPlaceSummary) {
  const comparePath = buildComparePath(left, right);
  const queryIndex = comparePath.indexOf("?");

  return queryIndex >= 0 ? `/api/og${comparePath.slice(queryIndex)}` : "/api/og";
}

function withIndefiniteArticle(phrase: string) {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}

function buildCompareDescription(state: CompareInitialState) {
  const summary = formatCompareSummary(state.left, state.right);

  return `${summary} ${state.left.name} uses ${withIndefiniteArticle(boundaryLabels[state.left.boundaryType].toLowerCase())}; ${state.right.name} uses ${withIndefiniteArticle(boundaryLabels[state.right.boundaryType].toLowerCase())}.`;
}

export function buildComparePageMetadata(
  state: CompareInitialState,
): Metadata {
  if (state.resolution === "default") {
    return {
      title: genericTitle,
      description: genericDescription,
      alternates: {
        canonical: "/",
      },
      openGraph: {
        title: genericTitle,
        description: genericDescription,
        siteName: "MapMatching",
        type: "website",
        url: "/",
        images: [
          {
            url: "/api/og",
            width: 1200,
            height: 630,
            alt: "MapMatching share preview",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: genericTitle,
        description: genericDescription,
        images: ["/api/og"],
      },
    };
  }

  const title = `${state.left.name} vs ${state.right.name} | MapMatching`;
  const description = buildCompareDescription(state);
  const canonical = buildComparePath(state.left, state.right);
  const ogImage = buildOgImagePath(state.left, state.right);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      siteName: "MapMatching",
      type: "website",
      url: canonical,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${state.left.name} versus ${state.right.name} on MapMatching`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export function buildHomeMetadata(searchParams: CompareSearchParams = {}) {
  return buildComparePageMetadata(buildInitialCompareState(searchParams));
}

export function buildShareCardModel(state: CompareInitialState) {
  if (state.resolution === "default") {
    return {
      comparisonLabel: "Search two cities",
      detail:
        "Compare boundaries at the same real-world scale with shareable URLs and clear area-first summaries.",
      footerLeft: "Equal ground scale",
      footerRight: "MapLibre + normalized boundaries",
      summary: "Pick any two cities and the workspace handles the compare.",
      title: "MapMatching",
    };
  }

  return {
    comparisonLabel: `${boundaryLabels[state.left.boundaryType]} / ${boundaryLabels[state.right.boundaryType]}`,
    detail: `${state.left.country} and ${state.right.country}`,
    footerLeft: "Equal ground scale",
    footerRight: state.presetId ? "Preset comparison" : "Custom comparison",
    summary: formatCompareSummary(state.left, state.right),
    title: `${state.left.name} vs ${state.right.name}`,
  };
}
