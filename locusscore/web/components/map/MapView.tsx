"use client";

import { useEffect, useRef } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  AttributionControl,
  type MapMouseEvent,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ensurePmtilesProtocol, scoresPmtilesUrl, anchorsGeojsonUrl, DEV_BASEMAP_STYLE } from "@/lib/tiles";
import { buildFillColorExpression, gateProperty } from "@/lib/style/expressions";
import { HATCH_IMAGE_ID, createHatchPatternImage } from "@/lib/style/hatchPattern";
import type { ProfileManifest } from "@/lib/style/types";

const SOURCE_ID = "cells";
const SOURCE_LAYER = "cells";
const FILL_LAYER = "cells-fill";
const GATE_LAYER = "cells-gate";
const OUTLINE_LAYER = "cells-outline";
const POI_SOURCE_ID = "anchors";
const POI_LAYER = "poi-overlay";
const LINES_SOURCE_ID = "detail-lines";
const LINES_LAYER = "detail-lines-layer";

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export interface MapViewProps {
  profile: ProfileManifest;
  categoryId: string | null;
  showConfidenceOverlay: boolean;
  showPoiOverlay: boolean;
  onCellClick: (h3: string, lngLat: { lng: number; lat: number }) => void;
  /** Lines from the clicked cell to each POI in the open detail card
   * (CLAUDE.md Section 8: "lines from location to each POI drawn on the
   * map"). Null clears them. */
  lines?: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
  className?: string;
  /** Called once the map + layers are ready; used by CompareView to sync cameras. */
  onMapReady?: (map: MaplibreMap) => void;
}

export default function MapView({
  profile,
  categoryId,
  showConfidenceOverlay,
  showPoiOverlay,
  onCellClick,
  lines,
  className,
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const readyRef = useRef(false);
  // Keep latest callbacks/props reachable from event handlers registered once.
  const latest = useRef({ profile, categoryId, onCellClick });
  useEffect(() => {
    latest.current = { profile, categoryId, onCellClick };
  });

  useEffect(() => {
    ensurePmtilesProtocol();
    if (!containerRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: DEV_BASEMAP_STYLE,
      center: [12.5683, 55.6761],
      zoom: 12.5,
      attributionControl: false,
    });
    mapRef.current = map;

    map.addControl(
      new AttributionControl({
        compact: false,
        customAttribution: "© OpenStreetMap contributors",
      })
    );
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (e) => console.error("[MapView] maplibre error:", e.error));

    map.on("load", () => {
      const hatch = createHatchPatternImage();
      map.addImage(HATCH_IMAGE_ID, hatch, { pixelRatio: 2 });

      map.addSource(SOURCE_ID, { type: "vector", url: scoresPmtilesUrl() });
      map.addSource(POI_SOURCE_ID, { type: "geojson", data: anchorsGeojsonUrl() });

      const { profile: p, categoryId: c } = latest.current;

      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        "source-layer": SOURCE_LAYER,
        filter: ["==", ["get", gateProperty(p.id)], null],
        paint: {
          "fill-color": buildFillColorExpression(p.id, c, showConfidenceOverlay),
          "fill-opacity": 0.75,
        },
      });

      map.addLayer({
        id: GATE_LAYER,
        type: "fill",
        source: SOURCE_ID,
        "source-layer": SOURCE_LAYER,
        filter: ["!=", ["get", gateProperty(p.id)], null],
        paint: { "fill-pattern": HATCH_IMAGE_ID, "fill-opacity": 0.9 },
      });

      map.addLayer({
        id: OUTLINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        "source-layer": SOURCE_LAYER,
        paint: { "line-color": "#ffffff", "line-width": 0.4, "line-opacity": 0.5 },
      });

      map.addLayer({
        id: POI_LAYER,
        type: "circle",
        source: POI_SOURCE_ID,
        filter: ["==", ["get", "category"], "__none__"],
        paint: {
          "circle-radius": 4,
          "circle-color": "#1f2937",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
        layout: { visibility: "none" },
      });

      map.addSource(LINES_SOURCE_ID, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      map.addLayer({
        id: LINES_LAYER,
        type: "line",
        source: LINES_SOURCE_ID,
        paint: { "line-color": "#1f2937", "line-width": 1.5, "line-dasharray": [2, 1.5] },
      });

      const handleClick = (e: MapMouseEvent) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER, GATE_LAYER] });
        const h3 = features[0]?.properties?.h3;
        if (typeof h3 === "string") latest.current.onCellClick(h3, e.lngLat);
      };
      map.on("click", FILL_LAYER, handleClick);
      map.on("click", GATE_LAYER, handleClick);
      for (const layer of [FILL_LAYER, GATE_LAYER]) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }

      readyRef.current = true;
      onMapReady?.(map);
    });

    return () => {
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is created once; updates below are style-only
  }, []);

  // Profile / category switch: style-only, no source reload (Section 8).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setPaintProperty(
      FILL_LAYER,
      "fill-color",
      buildFillColorExpression(profile.id, categoryId, showConfidenceOverlay)
    );
    map.setFilter(FILL_LAYER, ["==", ["get", gateProperty(profile.id)], null]);
    map.setFilter(GATE_LAYER, ["!=", ["get", gateProperty(profile.id)], null]);
  }, [profile, categoryId, showConfidenceOverlay]);

  // POI overlay: visible only when toggled on AND a category is selected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const visible = showPoiOverlay && categoryId !== null;
    map.setLayoutProperty(POI_LAYER, "visibility", visible ? "visible" : "none");
    if (categoryId) {
      map.setFilter(POI_LAYER, ["==", ["get", "category"], categoryId]);
    }
  }, [showPoiOverlay, categoryId]);

  // Detail-card POI lines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource(LINES_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(lines ?? EMPTY_FEATURE_COLLECTION);
  }, [lines]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
