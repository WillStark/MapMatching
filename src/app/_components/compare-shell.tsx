"use client";

import Link from "next/link";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import {
  comparePresets,
  compareShellContent,
  dockControls,
  paneTemplates,
  type ComparePaneTemplate,
  type Metric,
  type PresetComparison,
} from "@/app/_data/compare-shell";
import {
  MapPaneBasemap,
  type MapPaneController,
} from "@/app/_components/map-pane-basemap";
import { CompareSidebar } from "@/app/_components/compare-sidebar";
import { FloatingControls } from "@/app/_components/floating-controls";
import {
  formatScaleDistance,
  getNiceScaleDistanceMeters,
  getSharedTargetMetersPerPixel,
  type CompareViewportSize,
} from "@/lib/compare/scale";
import {
  createScaleMeasurement,
  getScaleMeasurementLabel,
  type GeoPoint,
  type ScaleMeasurement,
  type ScaleReferenceSlot,
} from "@/lib/compare/scale-reference";
import { findDemoPlaceById } from "@/lib/search/demo-data";
import {
  buildComparisonPathname as buildSharedComparisonPathname,
  findPresetBySelections,
  type CompareInitialState,
  type SearchSlot,
} from "@/lib/search/url-state";
import type {
  BoundaryType,
  SearchPlaceSummary,
  SearchProviderId,
  SearchResponse,
} from "@/lib/search/types";

type SearchResultsState = Record<SearchSlot, SearchPlaceSummary[]>;
type SearchErrorState = Record<SearchSlot, string | null>;
type ActiveIndexState = Record<SearchSlot, number>;
type GeometryStatus = "idle" | "loading" | "ready" | "error";
type MapRuntimeStatus = "idle" | "loading" | "ready" | "error";
type SelectedPlace = SearchPlaceSummary | null;

type PlaceGeometry = {
  areaSqKm: number;
  bbox: [number, number, number, number];
  boundarySource: string;
  boundarySourceLabel: string;
  boundaryType: BoundaryType;
  centroid: [number, number];
  country: string;
  countryCode: string;
  geometry: Feature<Polygon | MultiPolygon>;
  id: string;
  name: string;
  searchSource: SearchProviderId;
  sourceAttribution: string;
};

type PlaceGeometryResponse = {
  cached: boolean;
  place: PlaceGeometry;
};

type GeometryState = {
  error: string | null;
  place: PlaceGeometry | null;
  status: GeometryStatus;
};

type GeometryStateRecord = Record<SearchSlot, GeometryState>;
type PaneViewportState = Record<SearchSlot, CompareViewportSize | null>;
type MapStatusState = Record<SearchSlot, MapRuntimeStatus>;
type PaneCenterState = Record<SearchSlot, GeoPoint | null>;

const SCALE_UI_SYNC_THRESHOLD = 0.0008;

type PaneViewModel = ComparePaneTemplate & {
  attributionCopy: string;
  boundaryDetail: string;
  city: string;
  country: string;
  boundaryLabel: string;
  boundarySourceLabel: string;
  geometryStatus: GeometryStatus;
  metrics: Metric[];
};

const boundaryLabels = {
  admin: "Administrative boundary",
  city: "City boundary",
  municipality: "Municipal boundary",
} as const;

const sourceLabels = {
  demo: "Local demo search",
  nominatim: "Nominatim search",
} as const;

const MIN_QUERY_COPY = "Type at least 2 characters to search.";
const NO_RESULTS_COPY = "Try a different city or use a preset.";
const GEOMETRY_FAILURE_COPY = "We couldn't load a reliable boundary for this city.";
const SEARCH_FAILURE_COPY =
  "Live city search is unavailable right now. Use a preset or try again.";
const COMPARISON_SETTINGS_ID = "comparison-settings";

function formatArea(areaSqKm?: number) {
  if (typeof areaSqKm !== "number") {
    return "Pending";
  }

  return `${new Intl.NumberFormat("en-US").format(Math.round(areaSqKm))} km²`;
}

function formatSummary(
  left: Pick<SearchPlaceSummary, "name" | "areaSqKm">,
  right: Pick<SearchPlaceSummary, "name" | "areaSqKm">,
) {
  if (typeof left.areaSqKm === "number" && typeof right.areaSqKm === "number") {
    const ratio = left.areaSqKm / right.areaSqKm;

    if (ratio >= 1) {
      return `${left.name} covers about ${ratio.toFixed(1)} times the area of ${right.name}.`;
    }

    return `${left.name} covers about ${Math.round(ratio * 100)}% of ${right.name}'s area.`;
  }

  return `${left.name} and ${right.name} are staged for side-by-side comparison.`;
}

function formatSummaryDetail({
  hasBasemapError,
  hasError,
  isBasemapLoading,
  isLoading,
  scaleLockEnabled,
  scaleReady,
}: {
  hasBasemapError: boolean;
  hasError: boolean;
  isBasemapLoading: boolean;
  isLoading: boolean;
  scaleLockEnabled: boolean;
  scaleReady: boolean;
}) {
  if (hasBasemapError) {
    return "Live tiles fell back to the boundary preview, but the compare still works.";
  }

  if (hasError) {
    return `${GEOMETRY_FAILURE_COPY} Try another city or use a preset.`;
  }

  if (isBasemapLoading || isLoading) {
    return "Loading normalized boundaries and the shared scale.";
  }

  if (!scaleLockEnabled) {
    return "Scale sync is paused, so the panes can move independently.";
  }

  if (scaleReady) {
    return "Both panes stay locked to the same ground scale.";
  }

  return "Settling the shared ground scale now.";
}

function createLoadingGeometryState(): GeometryStateRecord {
  return {
    left: {
      error: null,
      place: null,
      status: "loading",
    },
    right: {
      error: null,
      place: null,
      status: "loading",
    },
  };
}

function createIdleGeometryState(): GeometryStateRecord {
  return {
    left: {
      error: null,
      place: null,
      status: "idle",
    },
    right: {
      error: null,
      place: null,
      status: "idle",
    },
  };
}

async function fetchPlaceGeometry(placeId: string) {
  const response = await fetch(`/api/place/${encodeURIComponent(placeId)}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(errorPayload?.error ?? GEOMETRY_FAILURE_COPY);
  }

  return (await response.json()) as PlaceGeometryResponse;
}

function buildPaneMetrics(
  geometryState: GeometryState,
  selection: SearchPlaceSummary,
): Metric[] {
  return [
    {
      label: "Area",
      value:
        geometryState.status === "ready"
          ? formatArea(geometryState.place?.areaSqKm)
          : geometryState.status === "loading"
            ? "Loading"
            : typeof selection.areaSqKm === "number"
              ? formatArea(selection.areaSqKm)
              : "Unavailable",
      detail:
        geometryState.status === "ready"
          ? "Derived from normalized boundary"
          : geometryState.status === "loading"
            ? "Computing from place route"
            : "Fallback summary only",
    },
    {
      label: "Boundary",
      value: boundaryLabels[selection.boundaryType],
      detail:
        geometryState.status === "ready"
          ? geometryState.place?.boundarySourceLabel ?? "Boundary ready"
          : geometryState.status === "loading"
            ? "Awaiting normalized geometry"
            : "Reliable boundary unavailable",
    },
  ];
}

function buildPaneViewModel(
  template: ComparePaneTemplate,
  geometryState: GeometryState,
  selection: SearchPlaceSummary,
): PaneViewModel {
  const boundarySourceLabel =
    geometryState.status === "ready"
      ? geometryState.place?.boundarySourceLabel ?? "Boundary ready"
      : geometryState.status === "loading"
        ? "Loading normalized boundary"
        : "Reliable boundary unavailable";

  return {
    ...template,
    attributionCopy:
      geometryState.status === "ready"
        ? geometryState.place?.sourceAttribution ?? "Provider attribution pending."
        : geometryState.status === "loading"
          ? "Waiting for provider attribution from the place route."
          : "No boundary attribution yet because a clean polygon was not available.",
    boundaryDetail:
      geometryState.status === "ready"
        ? "Area, bbox, centroid, and source attribution all come from the place route."
        : geometryState.status === "loading"
          ? "The place route is still normalizing geometry and computing derived metrics."
          : `${GEOMETRY_FAILURE_COPY} Try another city or a preset.`,
    city: selection.name,
    country: selection.country,
    boundaryLabel:
      geometryState.status === "ready"
        ? boundaryLabels[geometryState.place?.boundaryType ?? selection.boundaryType]
        : boundaryLabels[selection.boundaryType],
    boundarySourceLabel,
    geometryStatus: geometryState.status,
    metrics: buildPaneMetrics(geometryState, selection),
  };
}

function createEmptyResultsState(): SearchResultsState {
  return {
    left: [],
    right: [],
  };
}

function createEmptyErrorsState(): SearchErrorState {
  return {
    left: null,
    right: null,
  };
}

function createEmptyActiveIndexState(): ActiveIndexState {
  return {
    left: -1,
    right: -1,
  };
}

function createEmptyViewportState(): PaneViewportState {
  return {
    left: null,
    right: null,
  };
}

function createEmptyMapStatusState(): MapStatusState {
  return {
    left: "idle",
    right: "idle",
  };
}

function createEmptyPaneCenterState(): PaneCenterState {
  return {
    left: null,
    right: null,
  };
}

function getOtherSlot(slot: SearchSlot): SearchSlot {
  return slot === "left" ? "right" : "left";
}

function getSelectionCenter(selection: SearchPlaceSummary | null): GeoPoint | null {
  return selection ? [selection.lng, selection.lat] : null;
}

function getScaleMeasurementSummary(
  measurement: ScaleMeasurement | null,
  measureModeEnabled: boolean,
) {
  if (measurement) {
    return `Measured ${getScaleMeasurementLabel(measurement)}`;
  }

  return measureModeEnabled ? "Drag on either map" : "No measurement";
}

function getDisplayValue(place: SearchPlaceSummary) {
  return `${place.name}, ${place.country}`;
}

function getSerializableSelection(
  selection: SearchPlaceSummary,
  geometryState: GeometryState,
) {
  if (
    geometryState.status !== "ready" ||
    typeof geometryState.place?.areaSqKm !== "number"
  ) {
    return selection;
  }

  return {
    ...selection,
    areaSqKm: geometryState.place.areaSqKm,
  } satisfies SearchPlaceSummary;
}

async function searchPlaces(query: string) {
  const response = await fetch(
    `/api/search?${new URLSearchParams({ limit: "5", q: query }).toString()}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    throw new Error(
      errorPayload?.error ?? "Search failed. Try again in a moment.",
    );
  }

  return (await response.json()) as SearchResponse;
}

function SearchField({
  accentClassName,
  activeIndex,
  error,
  helper,
  inputRef,
  isOpen,
  label,
  loading,
  onChange,
  onFocus,
  onKeyDown,
  onSelect,
  results,
  slot,
  value,
}: {
  accentClassName: string;
  activeIndex: number;
  error: string | null;
  helper: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  label: string;
  loading: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (place: SearchPlaceSummary) => void;
  results: SearchPlaceSummary[];
  slot: SearchSlot;
  value: string;
}) {
  const listboxId = `${slot}-search-results`;

  return (
    <div className="relative" data-search-ui="true">
      <label
        className={[
          "v2-city-field flex min-h-[5.75rem] flex-col justify-between gap-3 px-4 py-3.5",
          "focus-within:border-transparent",
          accentClassName,
        ].join(" ")}
      >
        <span className="ui-overline flex items-center gap-2.5">
          <span className="inline-flex size-6 items-center justify-center rounded-[0.75rem] border border-current/20 text-[0.72rem] font-semibold sm:size-7 sm:rounded-[0.85rem] sm:text-[0.78rem]">
            {slot === "left" ? "1" : "2"}
          </span>
          {label}
        </span>

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            aria-controls={isOpen ? listboxId : undefined}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-label={label}
            aria-activedescendant={
              isOpen && activeIndex >= 0
                ? `${slot}-option-${activeIndex}`
                : undefined
            }
            className="w-full min-w-0 bg-transparent text-[1rem] font-semibold leading-none text-ink outline-none placeholder:text-slate/65"
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            placeholder={slot === "left" ? "Search first city" : "Search second city"}
            role="combobox"
            type="search"
            value={value}
          />
        </div>

        {loading || error || helper ? (
          <span className="text-[0.78rem] leading-snug text-slate/90 sm:text-[0.84rem]">
            {loading ? "Searching…" : error ?? helper}
          </span>
        ) : null}
      </label>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-xl border border-grid bg-paper p-2 shadow-[0_24px_60px_rgba(17,24,39,0.16)]">
          {results.length > 0 ? (
            <ul
              className="space-y-2"
              id={listboxId}
              role="listbox"
              aria-label={`${label} results`}
            >
              {results.map((result, index) => {
                const isActive = activeIndex === index;

                return (
                  <li key={result.id}>
                    <button
                      aria-selected={isActive}
                      className={[
                        "control-press w-full rounded-[0.9rem] border px-4 py-3 text-left",
                        isActive
                          ? "border-ink/15 bg-white text-ink shadow-[0_14px_32px_rgba(17,24,39,0.08)]"
                          : "border-transparent bg-white/55 text-ink hover:border-slate/20 hover:bg-white/70",
                      ].join(" ")}
                      id={`${slot}-option-${index}`}
                      onClick={() => onSelect(result)}
                      role="option"
                      type="button"
                    >
                      <span className="block text-[0.98rem] font-semibold text-ink">
                        {result.name}
                      </span>
                      <span className="mt-1 block text-sm text-slate">
                        {result.country}
                      </span>
                      <span className="ui-detail mt-2 block text-[0.64rem]">
                        {boundaryLabels[result.boundaryType]} · {sourceLabels[result.source]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-2 py-1 text-sm text-slate">
              {loading ? "Searching…" : error ?? NO_RESULTS_COPY}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DockButton({
  active = false,
  detail,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  detail: string;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-disabled={disabled}
      aria-pressed={active}
      className={[
        "v2-control-row control-press flex w-full items-center justify-between gap-3 px-1 py-3 text-left",
        disabled
          ? "cursor-not-allowed text-slate/45"
          : active
            ? "text-ink"
            : "text-slate hover:text-ink",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span className="text-[0.92rem] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="flex items-center gap-2 text-[0.64rem] font-semibold uppercase tracking-[0.12em] opacity-75">
        {active ? <span className="size-1.5 rounded-full bg-success" /> : null}
        {detail}
      </span>
    </button>
  );
}

function PresetButton({
  active = false,
  detail,
  label,
  onClick,
}: {
  active?: boolean;
  detail: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "v2-rule-row control-press text-left",
        active
          ? "text-ink"
          : "text-slate hover:text-ink",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      <span className="block text-[0.9rem] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="block text-right text-[0.58rem] font-semibold uppercase tracking-[0.1em] opacity-70">
        {detail}
      </span>
    </button>
  );
}

function MobileScaleDivider({
  label,
}: {
  label: string;
}) {
  return (
    <div className="border-y border-grid bg-paper px-5 py-3 lg:hidden">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-grid" />
        <p className="ui-overline text-[0.64rem] tracking-[0.16em]">{label}</p>
        <span className="h-px flex-1 bg-grid" />
      </div>
    </div>
  );
}

function EmptySelectionCard({
  accent,
  children,
  description,
  isReady,
  label,
  testId,
  title,
}: {
  accent: string;
  children: ReactNode;
  description: string;
  isReady: boolean;
  label: string;
  testId: string;
  title: string;
}) {
  return (
    <section
      aria-label={`${label} search`}
      className="v2-map-pane v2-empty-pane relative flex min-h-[56svh] flex-col justify-center gap-6 overflow-visible bg-paper p-6 pt-20 lg:min-h-screen lg:p-8"
      data-testid={testId}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: isReady ? accent : "rgba(148, 163, 184, 0.22)" }}
      />
      <div className="max-w-[30rem]">
        <p className="ui-overline text-[0.64rem] tracking-[0.16em]">{label}</p>
        <p className="mt-4 type-display text-[2rem] leading-tight text-ink">{title}</p>
        <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-slate">
          {description}
        </p>
      </div>
      <div className="w-full max-w-[30rem]">{children}</div>
    </section>
  );
}

function MapPane({
  geometryState,
  measureModeEnabled,
  measurement,
  onMapCenterChange,
  onControllerReady,
  onMapStatusChange,
  onMeasurementCreate,
  onMeasurementTranslate,
  onTargetMetersPerPixelChange,
  onViewportChange,
  pane,
  resetNonce,
  scaleLockEnabled,
  selection,
  slot,
  targetMetersPerPixel,
}: {
  geometryState: GeometryState;
  measureModeEnabled: boolean;
  measurement: ScaleMeasurement | null;
  onMapCenterChange: (center: GeoPoint) => void;
  onControllerReady: (controller: MapPaneController | null) => void;
  onMapStatusChange: (status: MapRuntimeStatus) => void;
  onMeasurementCreate: (measurement: {
    end: GeoPoint;
    sourceSlot: ScaleReferenceSlot;
    start: GeoPoint;
  }) => void;
  onMeasurementTranslate: (update: {
    anchor: GeoPoint;
    slot: ScaleReferenceSlot;
  }) => void;
  onTargetMetersPerPixelChange: (nextTargetMetersPerPixel: number) => void;
  onViewportChange: (viewport: CompareViewportSize) => void;
  pane: PaneViewModel;
  resetNonce: number;
  scaleLockEnabled: boolean;
  selection: SearchPlaceSummary;
  slot: SearchSlot;
  targetMetersPerPixel: number | null;
}) {
  const style = {
    "--pane-accent": pane.accent,
    "--pane-accent-soft": pane.accentSoft,
  } as CSSProperties;

  return (
    <article
      aria-labelledby={`${pane.id}-title`}
      className="v2-map-pane group relative min-h-0 overflow-hidden"
      data-geometry-status={geometryState.status}
      data-testid={`map-pane-${pane.id}`}
      style={style}
    >
      <MapPaneBasemap
        accent={pane.accent}
        geometry={geometryState.status === "ready" ? geometryState.place : null}
        measureModeEnabled={measureModeEnabled}
        measurement={measurement}
        onMapCenterChange={onMapCenterChange}
        onControllerReady={onControllerReady}
        onMapStatusChange={onMapStatusChange}
        onMeasurementCreate={onMeasurementCreate}
        onMeasurementTranslate={onMeasurementTranslate}
        onTargetMetersPerPixelChange={onTargetMetersPerPixelChange}
        onViewportChange={onViewportChange}
        paneId={pane.id}
        resetNonce={resetNonce}
        scaleLockEnabled={scaleLockEnabled}
        selection={selection}
        slot={slot}
        targetMetersPerPixel={targetMetersPerPixel}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-paper via-paper/95 via-70% to-transparent px-5 pb-24 pt-[4.75rem] sm:px-6 lg:pb-20 lg:pt-[5.5rem]">
        <div className="v2-pane-ready flex items-start justify-between gap-4">
          <div className="max-w-[24rem]">
            <p
              className="flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em]"
              style={{ color: pane.accent }}
            >
              <span className="inline-flex size-6 items-center justify-center rounded-full border border-current/35 bg-paper/90">
                {pane.slotShort}
              </span>
              {pane.slot}
            </p>
            <h2
              className="type-display mt-3 text-[2rem] leading-none tracking-[-0.05em] text-ink sm:text-[2.6rem]"
              id={`${pane.id}-title`}
            >
              {pane.city}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate">{pane.country}</p>
          </div>
        </div>
      </div>

      <dl className="v2-map-facts v2-pane-ready absolute inset-x-0 bottom-0 z-10 grid grid-cols-2 border-t border-grid/80 bg-paper/92 backdrop-blur-md">
        {pane.metrics.map((metric) => (
          <div className="min-w-0 px-3 py-3 sm:px-4" key={metric.label}>
            <dt className="text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-slate">
              {metric.label}
            </dt>
            <dd className="mt-1 truncate font-mono text-[0.72rem] font-medium text-ink sm:text-[0.8rem]">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function CompareShell({
  initialState,
}: {
  initialState: CompareInitialState;
}) {
  const startsEmpty =
    initialState.resolution === "default" && !initialState.urlHadParams;
  const leftInputRef = useRef<HTMLInputElement>(null);
  const rightInputRef = useRef<HTMLInputElement>(null);
  const searchUiRef = useRef<HTMLDivElement>(null);
  const searchRequestRef = useRef<Record<SearchSlot, number>>({
    left: 0,
    right: 0,
  });
  const searchDebounceRef = useRef<Record<SearchSlot, number | null>>({
    left: null,
    right: null,
  });
  const geometryRequestRef = useRef<Record<SearchSlot, number>>({
    left: 0,
    right: 0,
  });
  const lastComputedScaleFitVersionRef = useRef<number | null>(null);
  const paneControllersRef = useRef<Record<SearchSlot, MapPaneController | null>>({
    left: null,
    right: null,
  });
  const pendingUiTargetMetersPerPixelRef = useRef<number | null>(null);
  const scaleUiAnimationFrameRef = useRef<number | null>(null);
  const shouldSyncUrlRef = useRef(initialState.urlHadParams);
  const comparisonSettingsRef = useRef<HTMLElement>(null);

  const [leftSelection, setLeftSelection] = useState<SelectedPlace>(
    startsEmpty ? null : initialState.left,
  );
  const [rightSelection, setRightSelection] = useState<SelectedPlace>(
    startsEmpty ? null : initialState.right,
  );
  const [leftQuery, setLeftQuery] = useState(
    startsEmpty ? "" : getDisplayValue(initialState.left),
  );
  const [rightQuery, setRightQuery] = useState(
    startsEmpty ? "" : getDisplayValue(initialState.right),
  );
  const [searchResults, setSearchResults] = useState<SearchResultsState>(
    createEmptyResultsState,
  );
  const [searchErrors, setSearchErrors] = useState<SearchErrorState>(
    createEmptyErrorsState,
  );
  const [activeIndexes, setActiveIndexes] = useState<ActiveIndexState>(
    createEmptyActiveIndexState,
  );
  const [openResultsSlot, setOpenResultsSlot] = useState<SearchSlot | null>(null);
  const [loadingSlot, setLoadingSlot] = useState<SearchSlot | null>(null);
  const [geometryStates, setGeometryStates] = useState<GeometryStateRecord>(() =>
    startsEmpty ? createIdleGeometryState() : createLoadingGeometryState(),
  );
  const [shareStatus, setShareStatus] = useState("");
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [showBoundaryInfo, setShowBoundaryInfo] = useState(false);
  const [viewResetNonce, setViewResetNonce] = useState(0);
  const [paneViewports, setPaneViewports] = useState<PaneViewportState>(
    createEmptyViewportState,
  );
  const [scaleLockEnabled, setScaleLockEnabled] = useState(true);
  const [scaleFitVersion, setScaleFitVersion] = useState(0);
  const [targetMetersPerPixel, setTargetMetersPerPixel] = useState<number | null>(
    null,
  );
  const [mapStatuses, setMapStatuses] = useState<MapStatusState>(() =>
    createEmptyMapStatusState(),
  );
  const [paneCenters, setPaneCenters] = useState<PaneCenterState>(
    createEmptyPaneCenterState,
  );
  const [measurement, setMeasurement] = useState<ScaleMeasurement | null>(null);
  const [measureModeEnabled, setMeasureModeEnabled] = useState(false);

  const effectiveGeometryStates = useMemo<GeometryStateRecord>(
    () => ({
      left:
        !leftSelection
          ? {
              error: null,
              place: null,
              status: "idle",
            }
          : geometryStates.left.place && geometryStates.left.place.id !== leftSelection.id
          ? {
              error: null,
              place: null,
              status: "loading",
            }
          : geometryStates.left,
      right:
        !rightSelection
          ? {
              error: null,
              place: null,
              status: "idle",
            }
          : geometryStates.right.place && geometryStates.right.place.id !== rightSelection.id
          ? {
              error: null,
              place: null,
              status: "loading",
            }
          : geometryStates.right,
    }),
    [geometryStates.left, geometryStates.right, leftSelection, rightSelection],
  );

  const hasLeftSelection = leftSelection !== null;
  const hasRightSelection = rightSelection !== null;
  const hasBothSelections = hasLeftSelection && hasRightSelection;

  const hasGeometryError =
    hasBothSelections &&
    (effectiveGeometryStates.left.status === "error" ||
      effectiveGeometryStates.right.status === "error");
  const hasBasemapError =
    hasBothSelections &&
    (mapStatuses.left === "error" || mapStatuses.right === "error");
  const isBasemapLoading =
    hasBothSelections &&
    (mapStatuses.left === "loading" || mapStatuses.right === "loading");
  const isGeometryLoading =
    hasBothSelections &&
    (effectiveGeometryStates.left.status === "loading" ||
      effectiveGeometryStates.right.status === "loading");
  const isScaleReady =
    hasBothSelections &&
    scaleLockEnabled &&
    targetMetersPerPixel !== null &&
    !hasBasemapError &&
    !isBasemapLoading &&
    !hasGeometryError &&
    !isGeometryLoading;
  const scaleStatusLabel = !hasBothSelections
    ? "Choose two cities"
    : hasBasemapError
    ? "Basemap fallback active"
    : !scaleLockEnabled
    ? "Equal scale paused"
    : hasGeometryError
      ? "Equal scale unavailable"
      : isBasemapLoading || isGeometryLoading || targetMetersPerPixel === null
        ? "Preparing equal scale"
        : "Equal ground scale locked";
  const activePreset = useMemo(
    () =>
      leftSelection && rightSelection
        ? findPresetBySelections(leftSelection, rightSelection)
        : null,
    [leftSelection, rightSelection],
  );
  const leftPane = useMemo(
    () =>
      leftSelection
        ? buildPaneViewModel(
            paneTemplates.left,
            effectiveGeometryStates.left,
            leftSelection,
          )
        : null,
    [effectiveGeometryStates.left, leftSelection],
  );
  const rightPane = useMemo(
    () =>
      rightSelection
        ? buildPaneViewModel(
            paneTemplates.right,
            effectiveGeometryStates.right,
            rightSelection,
          )
        : null,
    [effectiveGeometryStates.right, rightSelection],
  );
  const shareableLeftSelection = useMemo(
    () =>
      leftSelection
        ? getSerializableSelection(leftSelection, effectiveGeometryStates.left)
        : null,
    [effectiveGeometryStates.left, leftSelection],
  );
  const shareableRightSelection = useMemo(
    () =>
      rightSelection
        ? getSerializableSelection(rightSelection, effectiveGeometryStates.right)
        : null,
    [effectiveGeometryStates.right, rightSelection],
  );
  const summary = useMemo(
    () => {
      if (leftSelection && rightSelection) {
        return (
          activePreset?.summary ??
          formatSummary(
            {
              areaSqKm:
                effectiveGeometryStates.left.status === "ready"
                  ? effectiveGeometryStates.left.place?.areaSqKm
                  : leftSelection.areaSqKm,
              name: leftSelection.name,
            },
            {
              areaSqKm:
                effectiveGeometryStates.right.status === "ready"
                  ? effectiveGeometryStates.right.place?.areaSqKm
                  : rightSelection.areaSqKm,
              name: rightSelection.name,
            },
          )
        );
      }

      if (leftSelection || rightSelection) {
        return `${(leftSelection ?? rightSelection)?.name} is ready. Add one more city to compare.`;
      }

      return "Search two cities to start the compare.";
    },
    [
      activePreset,
      effectiveGeometryStates.left,
      effectiveGeometryStates.right,
      leftSelection,
      rightSelection,
    ],
  );
  const summaryDetail = useMemo(
    () => {
      if (!hasBothSelections) {
        if (leftSelection || rightSelection) {
          return "Pick the second city and the workspace will lock both panes to the same ground scale.";
        }

        return "Start with two searches or jump in with a preset. The workspace will take care of the compare.";
      }

      return formatSummaryDetail({
        hasBasemapError,
        hasError: hasGeometryError,
        isBasemapLoading,
        isLoading: isGeometryLoading,
        scaleLockEnabled,
        scaleReady: isScaleReady,
      });
    },
    [
      hasBothSelections,
      hasBasemapError,
      hasGeometryError,
      isBasemapLoading,
      isGeometryLoading,
      isScaleReady,
      leftSelection,
      rightSelection,
      scaleLockEnabled,
    ],
  );
  const scaleCue = useMemo(() => {
    if (!targetMetersPerPixel) {
      return null;
    }

    const distanceMeters = getNiceScaleDistanceMeters(targetMetersPerPixel, 116);

    return {
      distanceLabel: formatScaleDistance(distanceMeters),
    };
  }, [targetMetersPerPixel]);
  const scaleMeasurementSummary = getScaleMeasurementSummary(
    measurement,
    measureModeEnabled,
  );
  function requestCanonicalScaleFit() {
    lastComputedScaleFitVersionRef.current = null;
    setTargetMetersPerPixel(null);
    setScaleFitVersion((current) => current + 1);
  }

  function handlePaneViewportChange(
    slot: SearchSlot,
    viewport: CompareViewportSize,
  ) {
    setPaneViewports((current) => {
      const previous = current[slot];

      if (
        previous &&
        previous.width === viewport.width &&
        previous.height === viewport.height
      ) {
        return current;
      }

      return {
        ...current,
        [slot]: viewport,
      };
    });
  }

  function handleTargetMetersPerPixelChange(nextTargetMetersPerPixel: number) {
    if (!scaleLockEnabled || !Number.isFinite(nextTargetMetersPerPixel)) {
      return;
    }

    pendingUiTargetMetersPerPixelRef.current = nextTargetMetersPerPixel;

    if (
      scaleUiAnimationFrameRef.current !== null ||
      typeof window === "undefined"
    ) {
      return;
    }

    scaleUiAnimationFrameRef.current = window.requestAnimationFrame(() => {
      scaleUiAnimationFrameRef.current = null;

      const pendingTargetMetersPerPixel =
        pendingUiTargetMetersPerPixelRef.current;

      if (pendingTargetMetersPerPixel === null) {
        return;
      }

      startTransition(() => {
        setTargetMetersPerPixel((current) => {
          if (current === null) {
            return pendingTargetMetersPerPixel;
          }

          const deltaRatio =
            Math.abs(current - pendingTargetMetersPerPixel) /
            Math.max(current, 0.000001);

          return deltaRatio < SCALE_UI_SYNC_THRESHOLD
            ? current
            : pendingTargetMetersPerPixel;
        });
      });
    });
  }

  function handleLiveScaleInteraction(
    slot: SearchSlot,
    nextTargetMetersPerPixel: number,
  ) {
    if (!scaleLockEnabled || !Number.isFinite(nextTargetMetersPerPixel)) {
      return;
    }

    paneControllersRef.current[getOtherSlot(slot)]?.applyLiveTargetMetersPerPixel(
      nextTargetMetersPerPixel,
    );
    handleTargetMetersPerPixelChange(nextTargetMetersPerPixel);
  }

  function handleMapStatusChange(slot: SearchSlot, status: MapRuntimeStatus) {
    setMapStatuses((current) =>
      current[slot] === status
        ? current
        : {
            ...current,
            [slot]: status,
          },
    );
  }

  function clearMeasurementState() {
    setMeasurement(null);
    setMeasureModeEnabled(false);
  }

  function handleMapCenterChange(slot: SearchSlot, center: GeoPoint) {
    setPaneCenters((current) => {
      const previous = current[slot];

      if (
        previous &&
        Math.abs(previous[0] - center[0]) < 0.000001 &&
        Math.abs(previous[1] - center[1]) < 0.000001
      ) {
        return current;
      }

      return {
        ...current,
        [slot]: center,
      };
    });
  }

  function handleMeasurementCreate({
    end,
    sourceSlot,
    start,
  }: {
    end: GeoPoint;
    sourceSlot: ScaleReferenceSlot;
    start: GeoPoint;
  }) {
    const nextMeasurement = createScaleMeasurement({
      end,
      sourceSlot,
      start,
      translatedAnchor:
        paneCenters[getOtherSlot(sourceSlot)] ??
        getSelectionCenter(
          getOtherSlot(sourceSlot) === "left" ? leftSelection : rightSelection,
        ) ??
        end,
    });

    if (
      !Number.isFinite(nextMeasurement.distanceMeters) ||
      nextMeasurement.distanceMeters < 1
    ) {
      return;
    }

    setMeasurement(nextMeasurement);
    setMeasureModeEnabled(false);
  }

  function handleMeasurementTranslate({
    anchor,
    slot,
  }: {
    anchor: GeoPoint;
    slot: ScaleReferenceSlot;
  }) {
    setMeasurement((current) =>
      current && current.sourceSlot !== slot
        ? {
            ...current,
            translatedAnchor: anchor,
          }
        : current,
    );
  }

  useEffect(() => {
    async function loadGeometry(
      slot: SearchSlot,
      selection: SearchPlaceSummary | null,
    ) {
      const requestId = geometryRequestRef.current[slot] + 1;

      geometryRequestRef.current[slot] = requestId;

      if (!selection) {
        setGeometryStates((current) => ({
          ...current,
          [slot]: {
            error: null,
            place: null,
            status: "idle",
          },
        }));
        return;
      }

      setGeometryStates((current) => ({
        ...current,
        [slot]: {
          error: null,
          place: null,
          status: "loading",
        },
      }));

      try {
        const payload = await fetchPlaceGeometry(selection.id);

        if (geometryRequestRef.current[slot] !== requestId) {
          return;
        }

        setGeometryStates((current) => ({
          ...current,
          [slot]: {
            error: null,
            place: payload.place,
            status: "ready",
          },
        }));
      } catch (error) {
        if (geometryRequestRef.current[slot] !== requestId) {
          return;
        }

        setGeometryStates((current) => ({
          ...current,
          [slot]: {
            error:
              error instanceof Error && error.message
                ? error.message
                : GEOMETRY_FAILURE_COPY,
            place: null,
            status: "error",
          },
        }));
      }
    }

    void loadGeometry("left", leftSelection);
  }, [leftSelection]);

  useEffect(() => {
    async function loadGeometry(
      slot: SearchSlot,
      selection: SearchPlaceSummary | null,
    ) {
      const requestId = geometryRequestRef.current[slot] + 1;

      geometryRequestRef.current[slot] = requestId;

      if (!selection) {
        setGeometryStates((current) => ({
          ...current,
          [slot]: {
            error: null,
            place: null,
            status: "idle",
          },
        }));
        return;
      }

      setGeometryStates((current) => ({
        ...current,
        [slot]: {
          error: null,
          place: null,
          status: "loading",
        },
      }));

      try {
        const payload = await fetchPlaceGeometry(selection.id);

        if (geometryRequestRef.current[slot] !== requestId) {
          return;
        }

        setGeometryStates((current) => ({
          ...current,
          [slot]: {
            error: null,
            place: payload.place,
            status: "ready",
          },
        }));
      } catch (error) {
        if (geometryRequestRef.current[slot] !== requestId) {
          return;
        }

        setGeometryStates((current) => ({
          ...current,
          [slot]: {
            error:
              error instanceof Error && error.message
                ? error.message
                : GEOMETRY_FAILURE_COPY,
            place: null,
            status: "error",
          },
        }));
      }
    }

    void loadGeometry("right", rightSelection);
  }, [rightSelection]);

  useEffect(() => {
    if (!hasBothSelections) {
      lastComputedScaleFitVersionRef.current = null;
      setTargetMetersPerPixel(null);
      return;
    }

    if (!scaleLockEnabled) {
      return;
    }

    if (lastComputedScaleFitVersionRef.current === scaleFitVersion) {
      return;
    }

    const leftGeometry =
      effectiveGeometryStates.left.status === "ready"
        ? effectiveGeometryStates.left.place
        : null;
    const rightGeometry =
      effectiveGeometryStates.right.status === "ready"
        ? effectiveGeometryStates.right.place
        : null;
    const leftViewport = paneViewports.left;
    const rightViewport = paneViewports.right;

    if (!leftGeometry || !rightGeometry || !leftViewport || !rightViewport) {
      return;
    }

    setTargetMetersPerPixel(
      getSharedTargetMetersPerPixel({
        leftGeometry,
        leftViewport,
        rightGeometry,
        rightViewport,
      }),
    );
    lastComputedScaleFitVersionRef.current = scaleFitVersion;
  }, [
    effectiveGeometryStates.left.place,
    effectiveGeometryStates.left.status,
    effectiveGeometryStates.right.place,
    effectiveGeometryStates.right.status,
    paneViewports.left,
    paneViewports.right,
    scaleFitVersion,
    scaleLockEnabled,
    hasBothSelections,
  ]);

  useEffect(() => {
    if (!openResultsSlot) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;

      if (
        searchUiRef.current?.contains(event.target as Node) ||
        target?.closest("[data-search-ui='true']")
      ) {
        return;
      }

      setOpenResultsSlot(null);
    }

    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [openResultsSlot]);

  useEffect(() => {
    if (!shouldSyncUrlRef.current) {
      return;
    }

    if (!shareableLeftSelection || !shareableRightSelection) {
      return;
    }

    const nextPathname = buildSharedComparisonPathname({
      currentSearch: window.location.search,
      hash: window.location.hash,
      left: shareableLeftSelection,
      pathname: window.location.pathname,
      right: shareableRightSelection,
    });

    if (
      nextPathname !==
      `${window.location.pathname}${window.location.search}`
    ) {
      window.history.replaceState({}, "", nextPathname);
    }
  }, [shareableLeftSelection, shareableRightSelection]);

  useEffect(() => {
    if (!shareStatus) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShareStatus("");
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [shareStatus]);

  useEffect(() => {
    return () => {
      if (
        scaleUiAnimationFrameRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.cancelAnimationFrame(scaleUiAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const pendingDebounces = searchDebounceRef.current;

    return () => {
      (["left", "right"] satisfies SearchSlot[]).forEach((slot) => {
        const debounceId = pendingDebounces[slot];

        if (debounceId !== null && typeof window !== "undefined") {
          window.clearTimeout(debounceId);
        }
      });
    };
  }, []);

  function clearSearchDebounce(slot: SearchSlot) {
    const debounceId = searchDebounceRef.current[slot];

    if (debounceId !== null && typeof window !== "undefined") {
      window.clearTimeout(debounceId);
    }

    searchDebounceRef.current[slot] = null;
  }

  function resetSearchUi() {
    clearSearchDebounce("left");
    clearSearchDebounce("right");
    searchRequestRef.current.left += 1;
    searchRequestRef.current.right += 1;
    setSearchResults(createEmptyResultsState());
    setSearchErrors(createEmptyErrorsState());
    setActiveIndexes(createEmptyActiveIndexState());
    setOpenResultsSlot(null);
    setLoadingSlot(null);
  }

  function handleQueryChange(slot: SearchSlot, value: string) {
    clearSearchDebounce(slot);
    searchRequestRef.current[slot] += 1;
    const query = value.trim();

    if (slot === "left") {
      setLeftQuery(value);
    } else {
      setRightQuery(value);
    }

    setSearchErrors((current) => ({
      ...current,
      [slot]: null,
    }));
    setSearchResults((current) => ({
      ...current,
      [slot]: [],
    }));
    setActiveIndexes((current) => ({
      ...current,
      [slot]: -1,
    }));

    if (openResultsSlot === slot) {
      setOpenResultsSlot(null);
    }

    if (query.length < 2) {
      setLoadingSlot((current) => (current === slot ? null : current));
      return;
    }

    setLoadingSlot(slot);
    setOpenResultsSlot(slot);

    if (typeof window === "undefined") {
      return;
    }

    searchDebounceRef.current[slot] = window.setTimeout(() => {
      searchDebounceRef.current[slot] = null;
      void handleSearch(slot, query);
    }, 220);
  }

  function applyPreset(preset: PresetComparison) {
    const nextLeft = findDemoPlaceById(preset.leftId);
    const nextRight = findDemoPlaceById(preset.rightId);

    if (!nextLeft || !nextRight) {
      return;
    }

    setLeftSelection(nextLeft);
    setRightSelection(nextRight);
    setLeftQuery(getDisplayValue(nextLeft));
    setRightQuery(getDisplayValue(nextRight));
    setGeometryStates(createLoadingGeometryState());
    setMapStatuses(createEmptyMapStatusState());
    setShowBoundaryInfo(false);
    clearMeasurementState();
    shouldSyncUrlRef.current = true;
    requestCanonicalScaleFit();
    resetSearchUi();
  }

  async function handleSearch(slot: SearchSlot, queryOverride?: string) {
    clearSearchDebounce(slot);
    const query = (queryOverride ?? (slot === "left" ? leftQuery : rightQuery)).trim();
    const requestId = searchRequestRef.current[slot] + 1;

    searchRequestRef.current[slot] = requestId;

    if (query.length < 2) {
      setLoadingSlot((current) => (current === slot ? null : current));
      setSearchErrors((current) => ({
        ...current,
        [slot]: MIN_QUERY_COPY,
      }));
      setSearchResults((current) => ({
        ...current,
        [slot]: [],
      }));
      setActiveIndexes((current) => ({
        ...current,
        [slot]: -1,
      }));
      setOpenResultsSlot(null);
      return;
    }

    setLoadingSlot(slot);
    setSearchErrors((current) => ({
      ...current,
      [slot]: null,
    }));

    try {
      const payload = await searchPlaces(query);
      const nextResults = payload.results;

      if (searchRequestRef.current[slot] !== requestId) {
        return;
      }

      setSearchResults((current) => ({
        ...current,
        [slot]: nextResults,
      }));
      setActiveIndexes((current) => ({
        ...current,
        [slot]: nextResults.length > 0 ? 0 : -1,
      }));
      setOpenResultsSlot(slot);

      if (nextResults.length === 0) {
        setSearchErrors((current) => ({
          ...current,
          [slot]: NO_RESULTS_COPY,
        }));
      }
    } catch {
      if (searchRequestRef.current[slot] !== requestId) {
        return;
      }

      setSearchResults((current) => ({
        ...current,
        [slot]: [],
      }));
      setActiveIndexes((current) => ({
        ...current,
        [slot]: -1,
      }));
      setOpenResultsSlot(slot);
      setSearchErrors((current) => ({
        ...current,
        [slot]: SEARCH_FAILURE_COPY,
      }));
    } finally {
      if (searchRequestRef.current[slot] === requestId) {
        setLoadingSlot(null);
      }
    }
  }

  function selectResult(slot: SearchSlot, place: SearchPlaceSummary) {
    clearSearchDebounce(slot);
    searchRequestRef.current[slot] += 1;
    shouldSyncUrlRef.current =
      slot === "left" ? rightSelection !== null : leftSelection !== null;

    if (slot === "left") {
      setLeftSelection(place);
      setLeftQuery(getDisplayValue(place));
      rightInputRef.current?.focus();
    } else {
      setRightSelection(place);
      setRightQuery(getDisplayValue(place));
    }

    setGeometryStates((current) => ({
      ...current,
      [slot]: {
        error: null,
        place: null,
        status: "loading",
      },
    }));
    setMapStatuses((current) => ({
      ...current,
      [slot]: "idle",
    }));
    setSearchErrors((current) => ({
      ...current,
      [slot]: null,
    }));
    setSearchResults((current) => ({
      ...current,
      [slot]: [],
    }));
    setActiveIndexes((current) => ({
      ...current,
      [slot]: -1,
    }));
    setLoadingSlot((current) => (current === slot ? null : current));
    setOpenResultsSlot(null);
    clearMeasurementState();
    requestCanonicalScaleFit();
  }

  function updateActiveIndex(slot: SearchSlot, nextIndex: number) {
    const resultCount = searchResults[slot].length;

    if (resultCount === 0) {
      return;
    }

    const wrappedIndex = (nextIndex + resultCount) % resultCount;

    setActiveIndexes((current) => ({
      ...current,
      [slot]: wrappedIndex,
    }));
    setOpenResultsSlot(slot);
  }

  function handleInputKeyDown(
    slot: SearchSlot,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    const results = searchResults[slot];

    if (event.key === "Escape") {
      setOpenResultsSlot(null);
      return;
    }

    if (event.key === "ArrowDown") {
      if (results.length === 0) {
        return;
      }

      event.preventDefault();
      updateActiveIndex(slot, activeIndexes[slot] + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      if (results.length === 0) {
        return;
      }

      event.preventDefault();
      updateActiveIndex(slot, activeIndexes[slot] - 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (openResultsSlot === slot) {
        const activeResult = results[activeIndexes[slot]];

        if (activeResult) {
          selectResult(slot, activeResult);
          return;
        }
      }

      void handleSearch(slot);
    }
  }

  function handleSwap() {
    if (!leftSelection || !rightSelection) {
      return;
    }

    shouldSyncUrlRef.current = true;
    setGeometryStates((current) => ({
      left: current.right,
      right: current.left,
    }));
    setLeftSelection(rightSelection);
    setRightSelection(leftSelection);
    setLeftQuery(getDisplayValue(rightSelection));
    setRightQuery(getDisplayValue(leftSelection));
    clearMeasurementState();
    resetSearchUi();
  }

  function handleResetView() {
    if (!leftSelection || !rightSelection) {
      return;
    }

    setLeftQuery(getDisplayValue(leftSelection));
    setRightQuery(getDisplayValue(rightSelection));
    setShowBoundaryInfo(false);
    setViewResetNonce((current) => current + 1);
    requestCanonicalScaleFit();
    resetSearchUi();
  }

  function handleScaleSyncToggle() {
    if (scaleLockEnabled) {
      setScaleLockEnabled(false);
      return;
    }

    setScaleLockEnabled(true);
    requestCanonicalScaleFit();
  }

  function closeMobileControls() {
    setMobileControlsOpen(false);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(".v2-utilities-mobile")
          ?.focus();
      });
    }
  }

  function handleControlsToggle() {
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(max-width: 1023px)").matches
    ) {
      const settings = comparisonSettingsRef.current;

      if (!settings) {
        return;
      }

      settings.scrollIntoView({
        block: "center",
      });
      window.requestAnimationFrame(() => {
        settings.focus({
          preventScroll: true,
        });
      });
      return;
    }

    if (mobileControlsOpen) {
      closeMobileControls();
      return;
    }

    setMobileControlsOpen(true);
  }

  function renderSearchField(slot: SearchSlot) {
    const isLeft = slot === "left";

    return (
      <SearchField
        accentClassName={
          isLeft
            ? "focus-within:border-city-a/40 focus-within:text-city-a focus-within:shadow-[0_0_0_4px_rgba(228,87,46,0.12)]"
            : "focus-within:border-city-b/40 focus-within:text-city-b focus-within:shadow-[0_0_0_4px_rgba(42,127,98,0.14)]"
        }
        activeIndex={activeIndexes[slot]}
        error={searchErrors[slot]}
        helper=""
        inputRef={isLeft ? leftInputRef : rightInputRef}
        isOpen={openResultsSlot === slot}
        label={isLeft ? "First city" : "Second city"}
        loading={loadingSlot === slot}
        onChange={(value) => handleQueryChange(slot, value)}
        onFocus={() => {
          if (searchResults[slot].length > 0) {
            setOpenResultsSlot(slot);
          }
        }}
        onKeyDown={(event) => handleInputKeyDown(slot, event)}
        onSelect={(place) => selectResult(slot, place)}
        results={searchResults[slot]}
        slot={slot}
        value={isLeft ? leftQuery : rightQuery}
      />
    );
  }

  async function handleShare() {
    if (!shareableLeftSelection || !shareableRightSelection) {
      return;
    }

    const nextPathname = buildSharedComparisonPathname({
      currentSearch: window.location.search,
      hash: window.location.hash,
      left: shareableLeftSelection,
      pathname: window.location.pathname,
      right: shareableRightSelection,
    });
    const shareUrl = new URL(nextPathname, window.location.origin).toString();

    shouldSyncUrlRef.current = true;
    window.history.replaceState({}, "", nextPathname);

    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: "GeoSync",
            text: summary,
            url: shareUrl,
          });
          setShareStatus("Shared");
          return;
        } catch {
          return;
        }
      }

      await navigator.clipboard.writeText(shareUrl);
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Copy failed");
    }
  }

  return (
    <main
      className="v2-workspace"
      data-open={mobileControlsOpen}
      data-testid="compare-workspace"
    >
      <a
        className="sr-only rounded-full bg-ink px-4 py-2 text-paper focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30"
        href="#compare-canvas"
      >
        Skip to compare canvas
      </a>

      <CompareSidebar
        id="comparison-setup-sheet"
        mobileOpen={mobileControlsOpen}
        onRequestClose={closeMobileControls}
      >
        <div className="flex min-h-full flex-col">
          <div className="border-b border-grid/80 pb-5">
            <h1 className="type-display text-[2.15rem] leading-[0.92] tracking-[-0.06em] text-ink sm:text-[2.75rem]">
              GeoSync
            </h1>
            <p className="mt-3 max-w-[17rem] text-balance text-[0.9rem] leading-relaxed text-slate">
              {compareShellContent.title}
            </p>
          </div>

          <div className="mt-5 space-y-5" ref={searchUiRef}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate">
                <span className="inline-flex size-2.5 rounded-full bg-success" />
                {scaleStatusLabel}
              </div>

              <div className="flex gap-2">
                <button
                  className={[
                    "control-press min-h-11 rounded-lg border border-grid/80 px-3 text-sm font-semibold text-ink",
                    hasBothSelections
                      ? ""
                      : "cursor-not-allowed opacity-45 pointer-events-none",
                  ].join(" ")}
                  disabled={!hasBothSelections}
                  onClick={() => void handleShare()}
                  type="button"
                >
                  Copy link
                </button>
                <button
                  className={[
                    "control-press min-h-11 rounded-lg border border-grid/80 px-3 text-sm font-semibold text-ink",
                    hasBothSelections
                      ? ""
                      : "cursor-not-allowed opacity-45 pointer-events-none",
                  ].join(" ")}
                  disabled={!hasBothSelections}
                  onClick={handleSwap}
                  type="button"
                >
                  Swap cities
                </button>
              </div>
            </div>

            {hasBothSelections ? (
              <div className="grid gap-3">
                {renderSearchField("left")}
                {renderSearchField("right")}
              </div>
            ) : null}

            <div
              aria-live="polite"
              className="sr-only"
              role="status"
            >
              <div>
                {shareStatus ||
                  (hasBasemapError
                    ? "Live tiles are unavailable, so both panes are using boundary previews."
                    : !scaleLockEnabled
                    ? "Scale sync is paused."
                    : hasGeometryError
                      ? "One or both boundaries could not be normalized cleanly."
                      : targetMetersPerPixel === null
                        ? "Search or pick a preset to load both panes."
                        : "Zoom either pane and the other one matches its ground resolution automatically.")}
              </div>
            </div>

            <details className="group" open={!hasBothSelections}>
              <summary className="v2-rule-row control-press list-none text-left">
                <span className="ui-overline text-[0.64rem] tracking-[0.18em]">
                  Quick comparisons
                </span>
                <span className="text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-slate">
                  {hasBothSelections ? "Show" : "Open"}
                </span>
              </summary>
              <div className="v2-rule-section">
                {comparePresets.map((preset) => (
                  <PresetButton
                    active={activePreset?.id === preset.id}
                    detail={preset.detail}
                    key={preset.id}
                    label={preset.label}
                    onClick={() => applyPreset(preset)}
                  />
                ))}
              </div>
            </details>
          </div>

          {hasLeftSelection || hasRightSelection ? (
            <div className="mt-6 border-t border-grid/80 pt-5">
              <p className="ui-overline text-[0.64rem] tracking-[0.18em]">
                Active comparison
              </p>
              <h2 className="type-display mt-3 text-[1.65rem] leading-[0.98] tracking-[-0.05em] text-ink">
                {summary}
              </h2>
              {!isScaleReady || hasBasemapError || hasGeometryError ? (
                <p className="mt-3 text-[0.82rem] leading-relaxed text-slate">
                  {summaryDetail}
                </p>
              ) : null}
            </div>
          ) : null}

          <nav
            aria-label="Comparison settings"
            className="v2-settings-nav mt-6 border-t border-grid/80 pt-2"
            id={COMPARISON_SETTINGS_ID}
            ref={comparisonSettingsRef}
            tabIndex={-1}
          >
            {dockControls.map((control) => (
              <DockButton
                active={
                  control.label === "Scale Sync"
                    ? scaleLockEnabled
                    : control.label === "About This Boundary"
                        ? showBoundaryInfo
                        : false
                }
                detail={
                  control.label === "Scale Sync"
                    ? scaleLockEnabled
                      ? "On"
                      : "Off"
                    : control.label === "About This Boundary"
                        ? showBoundaryInfo
                          ? "Open"
                          : "Closed"
                        : control.detail
                }
                key={control.label}
                label={control.label}
                onClick={
                  control.label === "Scale Sync"
                    ? handleScaleSyncToggle
                    : control.label === "Reset View"
                        ? handleResetView
                        : control.label === "About This Boundary"
                          ? () => setShowBoundaryInfo((current) => !current)
                          : undefined
                }
              />
            ))}
          </nav>

          <section
            aria-label="Measurement"
            className="mt-5 border-t border-grid/80 pt-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="ui-overline text-[0.64rem] tracking-[0.18em]">
                  Measure
                </p>
                <p
                  className="mt-2 text-[0.78rem] leading-relaxed text-slate"
                  data-testid="scale-measurement-summary"
                >
                  {scaleMeasurementSummary}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                aria-pressed={measureModeEnabled}
                className={[
                  "control-press min-h-11 rounded-lg border border-grid/80 px-3 text-sm font-semibold text-ink",
                  measureModeEnabled ? "bg-white/72" : "",
                  hasBothSelections ? "" : "cursor-not-allowed opacity-45",
                ].join(" ")}
                disabled={!hasBothSelections}
                onClick={() => setMeasureModeEnabled((current) => !current)}
                type="button"
              >
                Measure
              </button>
              <button
                className={[
                  "control-press min-h-11 rounded-lg border border-grid/80 px-3 text-sm font-semibold text-ink",
                  measurement ? "" : "cursor-not-allowed opacity-45",
                ].join(" ")}
                disabled={!measurement}
                onClick={clearMeasurementState}
                type="button"
              >
                Clear ruler
              </button>
            </div>
          </section>

          {showBoundaryInfo && leftSelection && rightSelection ? (
            <div className="mt-5 border-t border-grid/80 pt-4">
              {[
                { geometryState: effectiveGeometryStates.left, selection: leftSelection },
                { geometryState: effectiveGeometryStates.right, selection: rightSelection },
              ].map(({ geometryState, selection }, index) => (
                <div
                  className="border-b border-grid/70 py-3"
                  data-testid="boundary-info-card"
                  key={`${selection.id}-${index}`}
                >
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-slate">
                    {index === 0 ? "City A boundary" : "City B boundary"}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {selection.name} · {boundaryLabels[selection.boundaryType]}
                  </p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-slate">
                    {geometryState.status === "ready"
                      ? `${geometryState.place?.boundarySourceLabel ?? "Boundary ready"}. ${formatArea(geometryState.place?.areaSqKm)}.`
                      : geometryState.status === "loading"
                        ? "Boundary geometry is still loading."
                        : geometryState.error ?? GEOMETRY_FAILURE_COPY}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-auto border-t border-grid/80 pt-5 text-[0.74rem] leading-relaxed text-slate">
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-grid underline-offset-4"
              href="/attribution"
            >
              View full attribution
            </Link>
          </div>
        </div>
      </CompareSidebar>

      <section
        className="v2-stage"
        data-compare-ready={
          !hasBothSelections
            ? "staging"
            : hasBasemapError
            ? "fallback"
            : hasGeometryError
              ? "error"
              : isScaleReady
                ? "ready"
                : "loading"
        }
        data-testid="compare-surface"
        id="compare-canvas"
      >
        <div className="v2-mobile-brandbar" data-testid="mobile-comparison-bar">
          <Link aria-label="GeoSync home" className="type-display" href="/">
            GeoSync
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-grid" />
          <span className="truncate text-xs font-semibold text-slate">
            {leftSelection?.name ?? "City A"} / {rightSelection?.name ?? "City B"}
          </span>
          <button
            aria-controls="comparison-setup-sheet"
            aria-expanded={mobileControlsOpen}
            aria-label="Cities & controls"
            className="v2-utilities-mobile ml-auto min-h-10 rounded-lg border border-grid/80 px-3 text-xs font-semibold text-ink"
            onClick={handleControlsToggle}
            type="button"
          >
            Cities
          </button>
        </div>

        {hasBothSelections && leftPane && rightPane && leftSelection && rightSelection ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 hidden justify-center lg:flex">
              {!hasBasemapError && scaleLockEnabled && scaleCue ? (
                <div
                  className="v2-scale-ruler"
                  data-scale-state="locked"
                  data-testid="scale-status"
                >
                  <span>{scaleCue.distanceLabel} · Equal ground scale</span>
                </div>
              ) : (
                <div
                  className="v2-scale-ruler"
                  data-scale-state={
                    hasBasemapError
                      ? "fallback"
                      : !scaleLockEnabled
                        ? "paused"
                        : isBasemapLoading || targetMetersPerPixel === null
                          ? "loading"
                          : "idle"
                  }
                  data-testid="scale-status"
                >
                  <span>
                    {hasBasemapError
                      ? "boundary fallback active"
                      : !scaleLockEnabled
                        ? "scale sync paused"
                        : isBasemapLoading || targetMetersPerPixel === null
                          ? "preparing equal ground scale"
                          : compareShellContent.scaleLabel}
                  </span>
                </div>
              )}
            </div>

            <div className="v2-map-grid">
              <div className="contents">
                <MapPane
                  geometryState={effectiveGeometryStates.left}
                  measureModeEnabled={measureModeEnabled}
                  measurement={measurement}
                  onMapCenterChange={(center) =>
                    handleMapCenterChange("left", center)
                  }
                  onControllerReady={(controller) => {
                    paneControllersRef.current.left = controller;
                  }}
                  onMapStatusChange={(status) =>
                    handleMapStatusChange("left", status)
                  }
                  onMeasurementCreate={handleMeasurementCreate}
                  onMeasurementTranslate={handleMeasurementTranslate}
                  onTargetMetersPerPixelChange={(nextTargetMetersPerPixel) =>
                    handleLiveScaleInteraction("left", nextTargetMetersPerPixel)
                  }
                  onViewportChange={(viewport) =>
                    handlePaneViewportChange("left", viewport)
                  }
                  pane={leftPane}
                  resetNonce={viewResetNonce}
                  scaleLockEnabled={scaleLockEnabled}
                  selection={leftSelection}
                  slot="left"
                  targetMetersPerPixel={targetMetersPerPixel}
                />

                <MobileScaleDivider
                  label={
                    hasBasemapError
                      ? "Boundary fallback"
                      : !scaleLockEnabled
                        ? "Scale paused"
                        : "Same scale"
                  }
                />

                <MapPane
                  geometryState={effectiveGeometryStates.right}
                  measureModeEnabled={measureModeEnabled}
                  measurement={measurement}
                  onMapCenterChange={(center) =>
                    handleMapCenterChange("right", center)
                  }
                  onControllerReady={(controller) => {
                    paneControllersRef.current.right = controller;
                  }}
                  onMapStatusChange={(status) =>
                    handleMapStatusChange("right", status)
                  }
                  onMeasurementCreate={handleMeasurementCreate}
                  onMeasurementTranslate={handleMeasurementTranslate}
                  onTargetMetersPerPixelChange={(nextTargetMetersPerPixel) =>
                    handleLiveScaleInteraction("right", nextTargetMetersPerPixel)
                  }
                  onViewportChange={(viewport) =>
                    handlePaneViewportChange("right", viewport)
                  }
                  pane={rightPane}
                  resetNonce={viewResetNonce}
                  scaleLockEnabled={scaleLockEnabled}
                  selection={rightSelection}
                  slot="right"
                  targetMetersPerPixel={targetMetersPerPixel}
                />
              </div>
            </div>

          </>
        ) : (
          <>
            <div className="v2-map-grid">
              <EmptySelectionCard
                accent={paneTemplates.left.accent}
                description={
                  leftSelection
                    ? `${leftSelection.country} is staged and ready. Add the second city to unlock the live compare surface.`
                    : "Search here, or use a preset from Quick comparisons to fill both panes."
                }
                isReady={hasLeftSelection}
                label="City A"
                testId="empty-pane-city-a"
                title={leftSelection ? leftSelection.name : "Choose City A"}
              >
                {renderSearchField("left")}
              </EmptySelectionCard>
              <EmptySelectionCard
                accent={paneTemplates.right.accent}
                description={
                  rightSelection
                    ? `${rightSelection.country} is staged and ready. Add the second city to unlock the live compare surface.`
                    : "Search here, or use a preset from Quick comparisons to fill both panes."
                }
                isReady={hasRightSelection}
                label="City B"
                testId="empty-pane-city-b"
                title={rightSelection ? rightSelection.name : "Choose City B"}
              >
                {renderSearchField("right")}
              </EmptySelectionCard>
            </div>

          </>
        )}
      </section>

      <FloatingControls
        disabled={!hasBothSelections}
        onControlsToggle={handleControlsToggle}
        onReset={handleResetView}
        onShare={() => void handleShare()}
        settingsId={COMPARISON_SETTINGS_ID}
        shareStatus={shareStatus}
      />

    </main>
  );
}
