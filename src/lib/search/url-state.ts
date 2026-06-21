import {
  comparePresets,
  defaultPresetId,
  type PresetComparison,
} from "@/app/_data/compare-shell";

import { findDemoPlaceById } from "./demo-data";
import type { SearchPlaceSummary } from "./types";

export type SearchSlot = "left" | "right";

export type CompareSearchParamValue = string | string[] | undefined;

export type CompareSearchParams = Record<string, CompareSearchParamValue>;

export type CompareInitialState = {
  left: SearchPlaceSummary;
  right: SearchPlaceSummary;
  presetId: string | null;
  resolution: "default" | "pair" | "preset";
  urlHadParams: boolean;
};

export const compareParamKeys = [
  "preset",
  "leftId",
  "leftName",
  "leftCountry",
  "leftCountryCode",
  "leftSource",
  "leftBoundaryType",
  "leftLat",
  "leftLng",
  "leftAreaSqKm",
  "rightId",
  "rightName",
  "rightCountry",
  "rightCountryCode",
  "rightSource",
  "rightBoundaryType",
  "rightLat",
  "rightLng",
  "rightAreaSqKm",
] as const;

function firstValue(value: CompareSearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getDefaultSelections() {
  const defaultPreset =
    comparePresets.find((preset) => preset.id === defaultPresetId) ??
    comparePresets[0];

  const left = findDemoPlaceById(defaultPreset.leftId);
  const right = findDemoPlaceById(defaultPreset.rightId);

  if (!left || !right) {
    throw new Error("Default Phase 2 shell places are missing from the demo catalog.");
  }

  return {
    left,
    presetId: defaultPreset.id,
    resolution: "default" as const,
    right,
    urlHadParams: false,
  };
}

function createUrlSearchParams(searchParams: CompareSearchParams) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }

      continue;
    }

    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return params;
}

export function findPresetById(id: string | null) {
  return comparePresets.find((preset) => preset.id === id) ?? null;
}

export function findPresetBySelections(
  left: SearchPlaceSummary,
  right: SearchPlaceSummary,
) {
  return (
    comparePresets.find(
      (preset) => preset.leftId === left.id && preset.rightId === right.id,
    ) ?? null
  );
}

function buildComparisonSearchParamsFromSource(
  sourceParams: URLSearchParams,
  left: SearchPlaceSummary,
  right: SearchPlaceSummary,
) {
  const params = new URLSearchParams(sourceParams.toString());
  const matchingPreset = findPresetBySelections(left, right);

  for (const key of compareParamKeys) {
    params.delete(key);
  }

  if (matchingPreset) {
    params.set("preset", matchingPreset.id);
    return params;
  }

  serializePlace(params, "left", left);
  serializePlace(params, "right", right);

  return params;
}

export function buildComparisonPathname({
  currentSearch = "",
  hash = "",
  left,
  pathname = "/",
  right,
}: {
  currentSearch?: string;
  hash?: string;
  left: SearchPlaceSummary;
  pathname?: string;
  right: SearchPlaceSummary;
}) {
  const params = buildComparisonSearchParamsFromSource(
    new URLSearchParams(currentSearch),
    left,
    right,
  );
  const query = params.toString();

  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export function buildComparisonSearchParams(
  left: SearchPlaceSummary,
  right: SearchPlaceSummary,
) {
  const params = new URLSearchParams();
  const matchingPreset = findPresetBySelections(left, right);

  if (matchingPreset) {
    params.set("preset", matchingPreset.id);
    return params;
  }

  serializePlace(params, "left", left);
  serializePlace(params, "right", right);

  return params;
}

export function buildComparisonRelativeUrl(
  left: SearchPlaceSummary,
  right: SearchPlaceSummary,
) {
  return buildComparisonPathname({
    left,
    pathname: "/",
    right,
  });
}

export function serializePlace(
  params: URLSearchParams,
  prefix: SearchSlot,
  place: SearchPlaceSummary,
) {
  params.set(`${prefix}Id`, place.id);
  params.set(`${prefix}Name`, place.name);
  params.set(`${prefix}Country`, place.country);
  params.set(`${prefix}CountryCode`, place.countryCode);
  params.set(`${prefix}Source`, place.source);
  params.set(`${prefix}BoundaryType`, place.boundaryType);
  params.set(`${prefix}Lat`, String(place.lat));
  params.set(`${prefix}Lng`, String(place.lng));

  if (typeof place.areaSqKm === "number") {
    params.set(`${prefix}AreaSqKm`, String(place.areaSqKm));
  } else {
    params.delete(`${prefix}AreaSqKm`);
  }
}

export function deserializePlace(params: URLSearchParams, prefix: SearchSlot) {
  const id = params.get(`${prefix}Id`);
  const name = params.get(`${prefix}Name`);
  const country = params.get(`${prefix}Country`);
  const source = params.get(`${prefix}Source`);
  const boundaryType = params.get(`${prefix}BoundaryType`);
  const lat = params.get(`${prefix}Lat`);
  const lng = params.get(`${prefix}Lng`);

  if (
    !id ||
    !name ||
    !country ||
    !source ||
    !boundaryType ||
    !lat ||
    !lng
  ) {
    return null;
  }

  const demoPlace = findDemoPlaceById(id);

  if (demoPlace) {
    return demoPlace;
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  const areaSqKm = params.get(`${prefix}AreaSqKm`)
    ? Number(params.get(`${prefix}AreaSqKm`))
    : undefined;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    (typeof areaSqKm === "number" && !Number.isFinite(areaSqKm))
  ) {
    return null;
  }

  return {
    id,
    name,
    displayName: `${name}, ${country}`,
    country,
    countryCode: params.get(`${prefix}CountryCode`) ?? "",
    lat: latitude,
    lng: longitude,
    boundaryType:
      boundaryType === "city" ||
      boundaryType === "municipality" ||
      boundaryType === "admin"
        ? boundaryType
        : "admin",
    source: source === "nominatim" ? "nominatim" : "demo",
    areaSqKm,
  } satisfies SearchPlaceSummary;
}

function getPresetSelections(preset: PresetComparison | null) {
  if (!preset) {
    return null;
  }

  const left = findDemoPlaceById(preset.leftId);
  const right = findDemoPlaceById(preset.rightId);

  if (!left || !right) {
    return null;
  }

  return {
    left,
    presetId: preset.id,
    right,
  };
}

export function buildInitialCompareState(searchParams: CompareSearchParams = {}) {
  const params = createUrlSearchParams(searchParams);
  const urlHadParams = params.toString().length > 0;
  const restoredLeft = deserializePlace(params, "left");
  const restoredRight = deserializePlace(params, "right");
  const restoredPreset = findPresetById(firstValue(searchParams.preset));

  if (restoredLeft && restoredRight) {
    return {
      left: restoredLeft,
      presetId:
        findPresetBySelections(restoredLeft, restoredRight)?.id ??
        restoredPreset?.id ??
        null,
      resolution: "pair",
      right: restoredRight,
      urlHadParams,
    } satisfies CompareInitialState;
  }

  const presetSelections = getPresetSelections(restoredPreset);

  if (presetSelections) {
    return {
      ...presetSelections,
      resolution: "preset",
      urlHadParams,
    } satisfies CompareInitialState;
  }

  const defaultSelections = getDefaultSelections();

  return {
    ...defaultSelections,
    urlHadParams,
  } satisfies CompareInitialState;
}
