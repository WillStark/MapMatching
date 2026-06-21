const DEFAULT_LIVE_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export type MapStyleConfig = {
  expectsBasemap: boolean;
  styleUrl: string;
};

type StyleSource = {
  [key: string]: unknown;
  type?: string;
};

type StyleLayer = {
  [key: string]: unknown;
  id?: string;
  source?: string;
  type?: string;
};

export type MinimalMapStyle = {
  layers?: StyleLayer[];
  sources?: Record<string, StyleSource>;
  version?: number;
};

type MapStyleEnv = Record<string, string | undefined> & {
  MAPCOMPARE_EXPECT_BASEMAP?: string;
  MAPCOMPARE_MAP_STYLE_URL?: string;
  NEXT_PUBLIC_MAPLIBRE_STYLE_URL?: string;
};

function firstNonEmptyString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function parseBooleanOverride(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return null;
}

function isDeterministicTestStyle(styleUrl: string) {
  return /(^|\/)maplibre-test-style\.json(?:$|[?#])/.test(styleUrl);
}

export function resolveMapStyleConfig(env: MapStyleEnv) {
  const styleUrl =
    firstNonEmptyString(
      env.MAPCOMPARE_MAP_STYLE_URL,
      env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL,
    ) ?? DEFAULT_LIVE_STYLE_URL;
  const explicitBasemapExpectation = parseBooleanOverride(
    env.MAPCOMPARE_EXPECT_BASEMAP,
  );

  return {
    expectsBasemap:
      explicitBasemapExpectation ?? !isDeterministicTestStyle(styleUrl),
    styleUrl,
  } satisfies MapStyleConfig;
}

export function styleHasRenderableBasemap(style: MinimalMapStyle) {
  const sources = style.sources ?? {};
  const sourceIds = new Set(Object.keys(sources));

  return (style.layers ?? []).some((layer) => {
    if (!layer.source || layer.type === "background") {
      return false;
    }

    return sourceIds.has(layer.source);
  });
}
