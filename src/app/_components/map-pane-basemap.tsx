"use client";

import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  metersPerPixelAtLatitude,
  zoomForMetersPerPixel,
  type CompareViewportSize,
} from "@/lib/compare/scale";
import {
  getLineDistanceMeters,
  getLineMidpoint,
  getScaleMeasurementGeometry,
  getScaleMeasurementLabel,
  type GeoPoint,
  type ScaleMeasurement,
  type ScaleReferenceSlot,
} from "@/lib/compare/scale-reference";
import {
  styleHasRenderableBasemap,
  type MapStyleConfig,
} from "@/lib/map/style";
import type { SearchPlaceSummary } from "@/lib/search/types";

declare global {
  interface Window {
    __mapCompareMaps?: Record<string, MapLibreMap>;
  }
}

const DEFAULT_COMPARE_ZOOM = 8.8;
const FIT_PADDING_PX = 56;
const MAX_COMPARE_ZOOM = 16.5;
const DASHED_OUTLINE_DASHARRAY: number[] = [3.5, 2.4];
const WEBGL_UNSUPPORTED_COPY =
  "Live tiles need WebGL, and this browser couldn't create a WebGL context. Open the compare in a WebGL-capable browser with hardware acceleration enabled.";
const BASEMAP_UNAVAILABLE_COPY =
  "The basemap could not start, so this pane is showing a boundary fallback instead of live tiles.";

type RenderableGeometry = {
  bbox: [number, number, number, number];
  centroid: [number, number];
  geometry: Feature<Polygon | MultiPolygon>;
};

type ScaleMeasurementDraft = {
  current: GeoPoint;
  start: GeoPoint;
};

type MeasurementLabelOverlay = {
  label: string;
  x: number;
  y: number;
};

type MapStartupErrorReason = "empty-basemap" | "generic" | "webgl-unsupported";

let mapStyleConfigPromise: Promise<MapStyleConfig> | null = null;

export type MapPaneController = {
  applyLiveTargetMetersPerPixel: (targetMetersPerPixel: number) => void;
};

function browserSupportsWebGL() {
  if (typeof document === "undefined") {
    return true;
  }

  const canvas = document.createElement("canvas");

  return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
}

async function getMapStyleConfig() {
  mapStyleConfigPromise ??= fetch("/api/map-style", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Map style configuration failed.");
    }

    return (await response.json()) as MapStyleConfig;
  });

  return mapStyleConfigPromise;
}

function classifyMapStartupError(error: unknown): MapStartupErrorReason {
  if (!(error instanceof Error)) {
    return "generic";
  }

  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes("webgl")) {
    return "webgl-unsupported";
  }

  try {
    const parsed = JSON.parse(error.message) as {
      message?: string;
      statusMessage?: string;
    };
    const combinedMessage =
      `${parsed.message ?? ""} ${parsed.statusMessage ?? ""}`.toLowerCase();

    return combinedMessage.includes("webgl") ? "webgl-unsupported" : "generic";
  } catch {
    return "generic";
  }
}

function getGeometryRings(geometry: RenderableGeometry["geometry"]) {
  if (geometry.geometry.type === "Polygon") {
    return [geometry.geometry.coordinates];
  }

  return geometry.geometry.coordinates;
}

function buildFallbackPath(geometry: RenderableGeometry | null) {
  if (!geometry) {
    return "";
  }

  const [west, south, east, north] = geometry.bbox;
  const width = Math.max(0.000001, east - west);
  const height = Math.max(0.000001, north - south);
  const scale = 76 / Math.max(width, height);
  const offsetX = 50 - (width * scale) / 2;
  const offsetY = 50 - (height * scale) / 2;

  return getGeometryRings(geometry.geometry)
    .flatMap((polygon) =>
      polygon.map((ring) =>
        ring
          .map(([lng, lat], index) => {
            const x = offsetX + (lng - west) * scale;
            const y = offsetY + (north - lat) * scale;

            return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
          })
          .join(" ") + " Z",
      ),
    )
    .join(" ");
}

function buildFallbackFocusPoint(
  geometry: RenderableGeometry | null,
  selection: SearchPlaceSummary,
) {
  if (!geometry) {
    return {
      x: 50,
      y: 50,
    };
  }

  const [west, south, east, north] = geometry.bbox;
  const width = Math.max(0.000001, east - west);
  const height = Math.max(0.000001, north - south);
  const scale = 76 / Math.max(width, height);
  const offsetX = 50 - (width * scale) / 2;
  const offsetY = 50 - (height * scale) / 2;
  const [lng, lat] = geometry.centroid ?? [selection.lng, selection.lat];

  return {
    x: offsetX + (lng - west) * scale,
    y: offsetY + (north - lat) * scale,
  };
}

function buildFocusFeature(lng: number, lat: number): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Point",
          coordinates: [lng, lat] as [number, number],
        },
      },
    ],
  };
}

function buildGeometryFeature(
  geometry: RenderableGeometry | null | undefined,
): FeatureCollection<Polygon | MultiPolygon> {
  return {
    type: "FeatureCollection",
    features: geometry ? [geometry.geometry] : [],
  };
}

function buildLineFeature(start: GeoPoint, end: GeoPoint): LineString {
  return {
    type: "LineString",
    coordinates: [start, end],
  };
}

function getScaleMeasurementLabelOverlay({
  map,
  measurement,
  slot,
}: {
  map: MapLibreMap;
  measurement: ScaleMeasurement | null;
  slot: ScaleReferenceSlot;
}): MeasurementLabelOverlay | null {
  if (!measurement) {
    return null;
  }

  const geometry = getScaleMeasurementGeometry(measurement, slot);

  if (!geometry) {
    return null;
  }

  const midpoint = getLineMidpoint(geometry.start, geometry.end);
  const projected = map.project({
    lat: midpoint[1],
    lng: midpoint[0],
  });

  return {
    label: getScaleMeasurementLabel(measurement),
    x: projected.x,
    y: projected.y,
  };
}

function buildScaleMeasurementFeatureCollection({
  draft,
  measurement,
  slot,
}: {
  draft: ScaleMeasurementDraft | null;
  measurement: ScaleMeasurement | null;
  slot: ScaleReferenceSlot;
}): FeatureCollection<LineString> {
  const features: Array<Feature<LineString>> = [];

  if (measurement) {
    const geometry = getScaleMeasurementGeometry(measurement, slot);

    if (geometry) {
      features.push({
        type: "Feature",
        properties: {
          draft: false,
          label: getScaleMeasurementLabel(measurement),
          translated: measurement.sourceSlot !== slot,
        },
        geometry: buildLineFeature(geometry.start, geometry.end),
      });
    }
  }

  if (draft) {
    features.push({
      type: "Feature",
      properties: {
        draft: true,
        label: "",
        translated: false,
      },
      geometry: buildLineFeature(draft.start, draft.current),
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function getScaleMeasurementLayerIds(paneId: string) {
  return [`${paneId}-scale-measurement-line`];
}

function syncScaleMeasurementSource({
  draft,
  map,
  measurement,
  slot,
  sourceId,
}: {
  draft: ScaleMeasurementDraft | null;
  map: MapLibreMap;
  measurement: ScaleMeasurement | null;
  slot: ScaleReferenceSlot;
  sourceId: string;
}) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;

  source?.setData(
    buildScaleMeasurementFeatureCollection({
      draft,
      measurement,
      slot,
    }),
  );
}

function getOutlineStyle(paneId: string) {
  const isDashed = paneId.includes("city-b");

  return {
    dasharray: isDashed ? DASHED_OUTLINE_DASHARRAY : undefined,
    fallbackDasharray: isDashed ? "3.5 2.4" : undefined,
    strokeOpacity: isDashed ? 0.9 : 0.92,
    strokeWidth: isDashed ? 2.35 : 2.6,
  };
}

function clampZoom(map: MapLibreMap, zoom: number) {
  return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
}

function syncMapSources({
  geometry,
  geometrySourceId,
  map,
  selection,
  focusSourceId,
}: {
  geometry: RenderableGeometry | null;
  geometrySourceId: string;
  map: MapLibreMap;
  selection: SearchPlaceSummary;
  focusSourceId: string;
}) {
  const center = geometry?.centroid ?? [selection.lng, selection.lat];
  const focusSource = map.getSource(focusSourceId) as GeoJSONSource | undefined;
  const geometrySource = map.getSource(geometrySourceId) as GeoJSONSource | undefined;

  if (!focusSource || !geometrySource) {
    return;
  }

  focusSource.setData(buildFocusFeature(center[0], center[1]));
  geometrySource.setData(buildGeometryFeature(geometry));
}

function runProgrammaticViewChange({
  timeoutRef,
  isProgrammaticRef,
  update,
}: {
  timeoutRef: { current: number | null };
  isProgrammaticRef: { current: boolean };
  update: () => void;
}) {
  isProgrammaticRef.current = true;

  if (timeoutRef.current !== null && typeof window !== "undefined") {
    window.clearTimeout(timeoutRef.current);
  }

  update();

  if (typeof window !== "undefined") {
    timeoutRef.current = window.setTimeout(() => {
      isProgrammaticRef.current = false;
      timeoutRef.current = null;
    }, 140);
    return;
  }

  isProgrammaticRef.current = false;
}

function applySelectionView({
  geometry,
  map,
  selection,
  scaleLockEnabled,
  targetMetersPerPixel,
  timeoutRef,
  isProgrammaticRef,
}: {
  geometry: RenderableGeometry | null;
  map: MapLibreMap;
  selection: SearchPlaceSummary;
  scaleLockEnabled: boolean;
  targetMetersPerPixel: number | null;
  timeoutRef: { current: number | null };
  isProgrammaticRef: { current: boolean };
}) {
  const center = geometry?.centroid ?? [selection.lng, selection.lat];

  if (scaleLockEnabled && targetMetersPerPixel !== null) {
    runProgrammaticViewChange({
      timeoutRef,
      isProgrammaticRef,
      update: () => {
        map.jumpTo({
          center,
          zoom: clampZoom(
            map,
            zoomForMetersPerPixel(center[1], targetMetersPerPixel),
          ),
        });
      },
    });
    return;
  }

  if (geometry) {
    runProgrammaticViewChange({
      timeoutRef,
      isProgrammaticRef,
      update: () => {
        map.fitBounds(
          [
            [geometry.bbox[0], geometry.bbox[1]],
            [geometry.bbox[2], geometry.bbox[3]],
          ],
          {
            duration: 0,
            maxZoom: 10.6,
            padding: FIT_PADDING_PX,
          },
        );
      },
    });
    return;
  }

  runProgrammaticViewChange({
    timeoutRef,
    isProgrammaticRef,
    update: () => {
      map.jumpTo({
        center: [selection.lng, selection.lat],
        zoom: DEFAULT_COMPARE_ZOOM,
      });
    },
  });
}

function applyTargetScale({
  map,
  targetMetersPerPixel,
  timeoutRef,
  isProgrammaticRef,
}: {
  map: MapLibreMap;
  targetMetersPerPixel: number;
  timeoutRef: { current: number | null };
  isProgrammaticRef: { current: boolean };
}) {
  const center = map.getCenter();
  const nextZoom = clampZoom(
    map,
    zoomForMetersPerPixel(center.lat, targetMetersPerPixel),
  );
  const currentMetersPerPixel = metersPerPixelAtLatitude(center.lat, map.getZoom());
  const deltaRatio =
    Math.abs(currentMetersPerPixel - targetMetersPerPixel) /
    Math.max(targetMetersPerPixel, 0.000001);

  if (deltaRatio < 0.0015) {
    return;
  }

  runProgrammaticViewChange({
    timeoutRef,
    isProgrammaticRef,
    update: () => {
      map.jumpTo({
        center,
        zoom: nextZoom,
      });
    },
  });
}

export function MapPaneBasemap({
  accent,
  geometry,
  measureModeEnabled,
  measurement,
  onMapCenterChange,
  onMeasurementCreate,
  onMeasurementTranslate,
  onControllerReady,
  onMapStatusChange,
  onTargetMetersPerPixelChange,
  onViewportChange,
  paneId,
  resetNonce,
  scaleLockEnabled,
  selection,
  slot,
  targetMetersPerPixel,
}: {
  accent: string;
  geometry: RenderableGeometry | null;
  measureModeEnabled: boolean;
  measurement: ScaleMeasurement | null;
  onMapCenterChange: (center: GeoPoint) => void;
  onMeasurementCreate: (measurement: {
    end: GeoPoint;
    sourceSlot: ScaleReferenceSlot;
    start: GeoPoint;
  }) => void;
  onMeasurementTranslate: (update: {
    anchor: GeoPoint;
    slot: ScaleReferenceSlot;
  }) => void;
  onControllerReady: (controller: MapPaneController | null) => void;
  onMapStatusChange: (status: "loading" | "ready" | "error") => void;
  onTargetMetersPerPixelChange: (nextTargetMetersPerPixel: number) => void;
  onViewportChange: (viewport: CompareViewportSize) => void;
  paneId: string;
  resetNonce: number;
  scaleLockEnabled: boolean;
  selection: SearchPlaceSummary;
  slot: ScaleReferenceSlot;
  targetMetersPerPixel: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draftMeasurementRef = useRef<ScaleMeasurementDraft | null>(null);
  const isDraggingMirroredMeasurementRef = useRef(false);
  const initialSelectionRef = useRef(selection);
  const latestGeometryRef = useRef(geometry);
  const latestMeasureModeEnabledRef = useRef(measureModeEnabled);
  const latestMeasurementRef = useRef(measurement);
  const latestOnMapCenterChangeRef = useRef(onMapCenterChange);
  const latestOnMeasurementCreateRef = useRef(onMeasurementCreate);
  const latestOnMeasurementTranslateRef = useRef(onMeasurementTranslate);
  const latestOnTargetMetersPerPixelChangeRef =
    useRef(onTargetMetersPerPixelChange);
  const latestOnViewportChangeRef = useRef(onViewportChange);
  const latestScaleLockEnabledRef = useRef(scaleLockEnabled);
  const latestSelectionRef = useRef(selection);
  const latestTargetMetersPerPixelRef = useRef(targetMetersPerPixel);
  const mapRef = useRef<MapLibreMap | null>(null);
  const didLoadRef = useRef(false);
  const isProgrammaticViewChangeRef = useRef(false);
  const programmaticReleaseTimeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorReason, setErrorReason] =
    useState<MapStartupErrorReason>("generic");
  const [measurementLabel, setMeasurementLabel] =
    useState<MeasurementLabelOverlay | null>(null);
  const outlineStyle = useMemo(() => getOutlineStyle(paneId), [paneId]);
  const {
    dasharray: outlineDasharray,
    strokeOpacity: outlineStrokeOpacity,
    strokeWidth: outlineStrokeWidth,
  } = outlineStyle;

  useEffect(() => {
    latestGeometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    latestMeasureModeEnabledRef.current = measureModeEnabled;
  }, [measureModeEnabled]);

  useEffect(() => {
    latestMeasurementRef.current = measurement;
  }, [measurement]);

  useEffect(() => {
    latestOnMapCenterChangeRef.current = onMapCenterChange;
  }, [onMapCenterChange]);

  useEffect(() => {
    latestOnMeasurementCreateRef.current = onMeasurementCreate;
  }, [onMeasurementCreate]);

  useEffect(() => {
    latestOnMeasurementTranslateRef.current = onMeasurementTranslate;
  }, [onMeasurementTranslate]);

  useEffect(() => {
    latestOnTargetMetersPerPixelChangeRef.current = onTargetMetersPerPixelChange;
  }, [onTargetMetersPerPixelChange]);

  useEffect(() => {
    latestOnViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    latestScaleLockEnabledRef.current = scaleLockEnabled;
  }, [scaleLockEnabled]);

  useEffect(() => {
    latestSelectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    latestTargetMetersPerPixelRef.current = targetMetersPerPixel;
  }, [targetMetersPerPixel]);

  useEffect(() => {
    onMapStatusChange(status);
  }, [onMapStatusChange, status]);

  useEffect(() => {
    onControllerReady({
      applyLiveTargetMetersPerPixel(nextTargetMetersPerPixel) {
        const map = mapRef.current;

        if (!map || !didLoadRef.current) {
          return;
        }

        applyTargetScale({
          isProgrammaticRef: isProgrammaticViewChangeRef,
          map,
          targetMetersPerPixel: nextTargetMetersPerPixel,
          timeoutRef: programmaticReleaseTimeoutRef,
        });
      },
    });

    return () => {
      onControllerReady(null);
    };
  }, [onControllerReady]);

  useEffect(() => {
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeoutId: number | null = null;
    let removeKeydownListener: (() => void) | null = null;

    async function mountMap() {
      if (!containerRef.current || mapRef.current) {
        return;
      }

      try {
        if (!browserSupportsWebGL()) {
          setErrorReason("webgl-unsupported");
          setStatus("error");
          return;
        }

        const maplibreglModule = await import("maplibre-gl");
        const mapStyleConfig = await getMapStyleConfig();
        const maplibregl = maplibreglModule.default;
        const focusSourceId = `${paneId}-focus`;
        const geometrySourceId = `${paneId}-geometry`;
        const scaleMeasurementSourceId = `${paneId}-scale-measurement`;
        const initialSelection = initialSelectionRef.current;
        let didInitializeStyle = false;
        const map = new maplibregl.Map({
          attributionControl: {
            compact: true,
          },
          boxZoom: false,
          center: [initialSelection.lng, initialSelection.lat],
          container: containerRef.current,
          doubleClickZoom: false,
          dragRotate: false,
          keyboard: true,
          maxZoom: MAX_COMPARE_ZOOM,
          pitchWithRotate: false,
          renderWorldCopies: false,
          scrollZoom: true,
          style: mapStyleConfig.styleUrl,
          touchZoomRotate: true,
          zoom: DEFAULT_COMPARE_ZOOM,
        });

        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
          window.__mapCompareMaps ??= {};
          window.__mapCompareMaps[paneId] = map;
        }

        const reportViewportSize = () => {
          const container = containerRef.current;

          if (!container) {
            return;
          }

          const width = Math.round(container.clientWidth);
          const height = Math.round(container.clientHeight);

          if (width > 0 && height > 0) {
            latestOnViewportChangeRef.current({
              width,
              height,
            });
          }
        };

        const reportMapCenter = () => {
          const center = map.getCenter();

          latestOnMapCenterChangeRef.current([center.lng, center.lat]);
        };

        const scheduleResize = () => {
          map.resize();
          reportViewportSize();
          reportMapCenter();

          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
              if (!isCancelled) {
                map.resize();
                reportViewportSize();
                reportMapCenter();
              }
            });
          }

          if (typeof window !== "undefined") {
            resizeTimeoutId = window.setTimeout(() => {
              if (!isCancelled) {
                map.resize();
                reportViewportSize();
                reportMapCenter();
              }
            }, 180);
          }
        };

        const updateMeasurementLabel = () => {
          setMeasurementLabel(
            getScaleMeasurementLabelOverlay({
              map,
              measurement: latestMeasurementRef.current,
              slot,
            }),
          );
        };

        const updateScaleMeasurementSource = () => {
          syncScaleMeasurementSource({
            draft: draftMeasurementRef.current,
            map,
            measurement: latestMeasurementRef.current,
            slot,
            sourceId: scaleMeasurementSourceId,
          });
          updateMeasurementLabel();
        };

        const getMeasurementFeatureAtPoint = (event: MapMouseEvent) => {
          const layers = getScaleMeasurementLayerIds(paneId).filter((layerId) =>
            map.getLayer(layerId),
          );

          if (layers.length === 0) {
            return undefined;
          }

          return map.queryRenderedFeatures(event.point, {
            layers,
          })[0];
        };

        const getEventPoint = (event: MapMouseEvent): GeoPoint => [
          event.lngLat.lng,
          event.lngLat.lat,
        ];

        const handleMouseMove = (event: MapMouseEvent) => {
          if (isDraggingMirroredMeasurementRef.current) {
            latestOnMeasurementTranslateRef.current({
              anchor: getEventPoint(event),
              slot,
            });
            return;
          }

          if (!draftMeasurementRef.current) {
            return;
          }

          draftMeasurementRef.current = {
            ...draftMeasurementRef.current,
            current: getEventPoint(event),
          };
          updateScaleMeasurementSource();
        };

        const handleMouseDown = (event: MapMouseEvent) => {
          const clickedFeature = getMeasurementFeatureAtPoint(event);
          const isTranslated = Boolean(clickedFeature?.properties?.translated);

          if (isTranslated && !latestMeasureModeEnabledRef.current) {
            isDraggingMirroredMeasurementRef.current = true;
            map.dragPan.disable();
            event.preventDefault();
            return;
          }

          if (!latestMeasureModeEnabledRef.current) {
            return;
          }

          const point = getEventPoint(event);

          draftMeasurementRef.current = {
            current: point,
            start: point,
          };
          map.dragPan.disable();
          updateScaleMeasurementSource();
          event.preventDefault();
        };

        const handleMouseUp = (event: MapMouseEvent) => {
          if (isDraggingMirroredMeasurementRef.current) {
            isDraggingMirroredMeasurementRef.current = false;
            map.dragPan.enable();
            return;
          }

          const currentDraft = draftMeasurementRef.current;

          if (!currentDraft) {
            return;
          }

          const end = getEventPoint(event);

          if (getLineDistanceMeters(currentDraft.start, end) >= 1) {
            latestOnMeasurementCreateRef.current({
              end,
              sourceSlot: slot,
              start: currentDraft.start,
            });
          }

          draftMeasurementRef.current = null;
          map.dragPan.enable();
          updateScaleMeasurementSource();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key !== "Escape" || !draftMeasurementRef.current) {
            return;
          }

          draftMeasurementRef.current = null;
          map.dragPan.enable();
          updateScaleMeasurementSource();
        };

        const initializeStyle = () => {
          if (didInitializeStyle || isCancelled) {
            return;
          }

          didInitializeStyle = true;
          if (isCancelled) {
            return;
          }

          if (
            mapStyleConfig.expectsBasemap &&
            !styleHasRenderableBasemap(map.getStyle())
          ) {
            setErrorReason("empty-basemap");
            setStatus("error");
            return;
          }

          didLoadRef.current = true;

          if (!map.getSource(focusSourceId)) {
            map.addSource(focusSourceId, {
              type: "geojson",
              data: buildFocusFeature(initialSelection.lng, initialSelection.lat),
            });
          }

          if (!map.getSource(geometrySourceId)) {
            map.addSource(geometrySourceId, {
              type: "geojson",
              data: buildGeometryFeature(null),
            });
          }

          if (!map.getSource(scaleMeasurementSourceId)) {
            map.addSource(scaleMeasurementSourceId, {
              type: "geojson",
              data: buildScaleMeasurementFeatureCollection({
                draft: null,
                measurement: latestMeasurementRef.current,
                slot,
              }),
            });
          }

          map.addLayer({
            id: `${paneId}-boundary-fill`,
            type: "fill",
            source: geometrySourceId,
            paint: {
              "fill-color": accent,
              "fill-opacity": 0.14,
            },
          });
          map.addLayer({
            id: `${paneId}-boundary-line`,
            type: "line",
            source: geometrySourceId,
            paint: {
              "line-color": accent,
              "line-opacity": outlineStrokeOpacity,
              "line-width": outlineStrokeWidth,
              ...(outlineDasharray
                ? {
                    "line-dasharray": outlineDasharray,
                  }
                : {}),
            },
          });

          map.addLayer({
            id: `${paneId}-focus-halo`,
            type: "circle",
            source: focusSourceId,
            paint: {
              "circle-color": accent,
              "circle-opacity": 0.14,
              "circle-radius": 18,
              "circle-stroke-color": accent,
              "circle-stroke-opacity": 0.22,
              "circle-stroke-width": 1.5,
            },
          });
          map.addLayer({
            id: `${paneId}-focus-dot`,
            type: "circle",
            source: focusSourceId,
            paint: {
              "circle-color": accent,
              "circle-radius": 6,
              "circle-stroke-color": "#f5f1e8",
              "circle-stroke-width": 2,
            },
          });
          map.addLayer({
            id: `${paneId}-scale-measurement-line`,
            type: "line",
            source: scaleMeasurementSourceId,
            paint: {
              "line-color": [
                "case",
                ["==", ["get", "translated"], true],
                "#111827",
                accent,
              ],
              "line-dasharray": [
                "case",
                ["==", ["get", "draft"], true],
                ["literal", [1.5, 1.5]],
                ["literal", [1, 0]],
              ],
              "line-opacity": 0.94,
              "line-width": [
                "case",
                ["==", ["get", "translated"], true],
                3.5,
                3,
              ],
            },
          });

          syncMapSources({
            geometry: latestGeometryRef.current,
            geometrySourceId,
            map,
            selection: latestSelectionRef.current,
            focusSourceId,
          });
          applySelectionView({
            geometry: latestGeometryRef.current,
            isProgrammaticRef: isProgrammaticViewChangeRef,
            map,
            scaleLockEnabled: latestScaleLockEnabledRef.current,
            selection: latestSelectionRef.current,
            targetMetersPerPixel: latestTargetMetersPerPixelRef.current,
            timeoutRef: programmaticReleaseTimeoutRef,
          });
          updateScaleMeasurementSource();
          scheduleResize();
          setErrorReason("generic");
          setStatus("ready");
        };

        if (map.isStyleLoaded()) {
          initializeStyle();
        } else {
          map.once("style.load", initializeStyle);
        }

        map.on("error", (event) => {
          if (!isCancelled && !didLoadRef.current) {
            setErrorReason(
              classifyMapStartupError(
                (event as { error?: unknown } | undefined)?.error,
              ),
            );
            setStatus("error");
          }
        });
        map.on("zoom", () => {
          if (
            isCancelled ||
            !latestScaleLockEnabledRef.current ||
            isProgrammaticViewChangeRef.current
          ) {
            return;
          }

          const center = map.getCenter();

          latestOnTargetMetersPerPixelChangeRef.current(
            metersPerPixelAtLatitude(center.lat, map.getZoom()),
          );
        });
        map.on("moveend", reportMapCenter);
        map.on("move", updateMeasurementLabel);
        map.on("zoom", updateMeasurementLabel);
        map.on("mousemove", handleMouseMove);
        map.on("mousedown", handleMouseDown);
        map.on("mouseup", handleMouseUp);
        window.addEventListener("keydown", handleKeyDown);
        removeKeydownListener = () => {
          window.removeEventListener("keydown", handleKeyDown);
        };

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            map.resize();
            reportViewportSize();
          });
          resizeObserver.observe(containerRef.current);
        }

        scheduleResize();
      } catch (error) {
        if (!isCancelled) {
          setErrorReason(classifyMapStartupError(error));
          setStatus("error");
        }
      }
    }

    void mountMap();

    return () => {
      isCancelled = true;
      didLoadRef.current = false;
      removeKeydownListener?.();
      resizeObserver?.disconnect();
      if (resizeTimeoutId !== null && typeof window !== "undefined") {
        window.clearTimeout(resizeTimeoutId);
      }
      if (
        programmaticReleaseTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(programmaticReleaseTimeoutRef.current);
        programmaticReleaseTimeoutRef.current = null;
      }
      isProgrammaticViewChangeRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      if (typeof window !== "undefined" && window.__mapCompareMaps) {
        delete window.__mapCompareMaps[paneId];
      }
    };
  }, [
    accent,
    outlineDasharray,
    outlineStrokeOpacity,
    outlineStrokeWidth,
    paneId,
    slot,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const focusSourceId = `${paneId}-focus`;
    const geometrySourceId = `${paneId}-geometry`;

    if (!map || !didLoadRef.current) {
      return;
    }

    syncMapSources({
      geometry,
      geometrySourceId,
      map,
      selection,
      focusSourceId,
    });
    applySelectionView({
      geometry,
      isProgrammaticRef: isProgrammaticViewChangeRef,
      map,
      scaleLockEnabled,
      selection,
      targetMetersPerPixel: latestTargetMetersPerPixelRef.current,
      timeoutRef: programmaticReleaseTimeoutRef,
    });
  }, [geometry, paneId, resetNonce, scaleLockEnabled, selection]);

  useEffect(() => {
    const map = mapRef.current;

    if (
      !map ||
      !didLoadRef.current ||
      !scaleLockEnabled ||
      targetMetersPerPixel === null
    ) {
      return;
    }

    applyTargetScale({
      isProgrammaticRef: isProgrammaticViewChangeRef,
      map,
      targetMetersPerPixel,
      timeoutRef: programmaticReleaseTimeoutRef,
    });
  }, [scaleLockEnabled, targetMetersPerPixel]);

  useEffect(() => {
    const map = mapRef.current;
    const scaleMeasurementSourceId = `${paneId}-scale-measurement`;

    if (!map || !didLoadRef.current) {
      return;
    }

    syncScaleMeasurementSource({
      draft: draftMeasurementRef.current,
      map,
      measurement,
      slot,
      sourceId: scaleMeasurementSourceId,
    });
    setMeasurementLabel(
      getScaleMeasurementLabelOverlay({
        map,
        measurement,
        slot,
      }),
    );
  }, [measurement, paneId, slot]);

  useEffect(() => {
    const map = mapRef.current;
    const scaleMeasurementSourceId = `${paneId}-scale-measurement`;

    if (measureModeEnabled || !draftMeasurementRef.current) {
      return;
    }

    draftMeasurementRef.current = null;

    if (!map || !didLoadRef.current) {
      return;
    }

    syncScaleMeasurementSource({
      draft: null,
      map,
      measurement,
      slot,
      sourceId: scaleMeasurementSourceId,
    });
  }, [measureModeEnabled, measurement, paneId, slot]);

  return (
    (() => {
      const fallbackFocusPoint = buildFallbackFocusPoint(geometry, selection);

      return (
        <>
      <div
        className="map-pane-canvas h-full min-h-[28rem] overflow-hidden"
        ref={containerRef}
      />

      {measurementLabel ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border border-ink/10 bg-paper/92 px-2.5 py-1 font-mono text-[0.68rem] font-semibold text-ink shadow-[0_8px_20px_rgba(17,24,39,0.12)]"
          data-testid="scale-measurement-map-label"
          style={{
            transform: `translate(${measurementLabel.x}px, ${measurementLabel.y}px) translate(-50%, -50%)`,
          }}
        >
          {measurementLabel.label}
        </div>
      ) : null}

      {status !== "ready" ? (
        <div className="absolute inset-0 overflow-hidden bg-paper/48">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.52),rgba(245,241,232,0.82))]" />
          <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(201,187,170,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(201,187,170,0.14)_1px,transparent_1px)] [background-size:34px_34px]" />
          <svg
            aria-hidden="true"
            className="absolute inset-8 h-[calc(100%-4rem)] w-[calc(100%-4rem)]"
            viewBox="0 0 100 100"
          >
            {geometry ? (
              <path
                d={buildFallbackPath(geometry)}
                fill={accent}
                fillOpacity="0.14"
                stroke={accent}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={outlineStyle.strokeOpacity}
                strokeWidth={outlineStyle.strokeWidth - 0.7}
                strokeDasharray={outlineStyle.fallbackDasharray}
              />
            ) : (
              <path
                d="M20 50 C32 31 47 21 63 19 C77 17 88 27 84 44 C81 60 67 73 52 78 C38 83 24 79 19 67 C15 60 14 56 20 50 Z"
                fill={accent}
                fillOpacity="0.08"
                stroke={accent}
                strokeDasharray={outlineStyle.fallbackDasharray ?? "4 4"}
                strokeOpacity={outlineStyle.strokeOpacity * 0.58}
                strokeWidth={outlineStyle.strokeWidth - 1.1}
              />
            )}
            <circle
              cx={fallbackFocusPoint.x}
              cy={fallbackFocusPoint.y}
              fill={accent}
              fillOpacity="0.2"
              r="4.4"
              stroke={accent}
              strokeOpacity="0.24"
              strokeWidth="1"
            />
            <circle
              cx={fallbackFocusPoint.x}
              cy={fallbackFocusPoint.y}
              fill={accent}
              r="1.8"
            />
          </svg>
          {status === "loading" ? (
            <div className="metric-card absolute bottom-[4.75rem] left-5 right-5 z-10 rounded-[1rem] px-4 py-3 sm:right-auto sm:max-w-[18rem]">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-slate">
                Preparing map preview
              </p>
              <p className="mt-1 text-sm text-ink">
                Centering {selection.name} and loading boundary geometry from the place route.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="metric-card absolute bottom-[4.75rem] left-5 right-5 z-10 rounded-[1rem] px-4 py-3 sm:right-auto sm:max-w-[20rem]">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-slate">
            {errorReason === "webgl-unsupported"
              ? "WebGL unavailable"
              : "Basemap unavailable"}
          </p>
          <p className="mt-1 text-sm text-ink">
            {errorReason === "webgl-unsupported"
              ? WEBGL_UNSUPPORTED_COPY
              : BASEMAP_UNAVAILABLE_COPY}
          </p>
        </div>
      ) : null}
        </>
      );
    })()
  );
}
