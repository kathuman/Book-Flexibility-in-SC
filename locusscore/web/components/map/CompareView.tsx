"use client";

import { useCallback, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import MapView from "./MapView";
import type { ProfileManifest } from "@/lib/style/types";

export interface CompareViewProps {
  profiles: ProfileManifest[];
  leftProfileId: string;
  rightProfileId: string;
  onChangeLeft: (id: string) => void;
  onChangeRight: (id: string) => void;
}

const noop = () => {};

/** CLAUDE.md Section 8: "Compare mode: side-by-side or swipe between two
 * profiles for the same viewport." Swipe is the accepted default (ADR
 * 0001 item 14). Two independent MapLibre maps, camera-synced via `move`
 * event forwarding; the right map is clipped to a draggable divider. */
export default function CompareView({
  profiles,
  leftProfileId,
  rightProfileId,
  onChangeLeft,
  onChangeRight,
}: CompareViewProps) {
  const [dividerPct, setDividerPct] = useState(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapLeftRef = useRef<MaplibreMap | null>(null);
  const mapRightRef = useRef<MaplibreMap | null>(null);
  const syncingRef = useRef<"left" | "right" | null>(null);

  const leftProfile = profiles.find((p) => p.id === leftProfileId) ?? profiles[0];
  const rightProfile = profiles.find((p) => p.id === rightProfileId) ?? profiles[0];

  const wireSync = useCallback((side: "left" | "right") => (map: MaplibreMap) => {
    if (side === "left") mapLeftRef.current = map;
    else mapRightRef.current = map;

    map.on("move", () => {
      if (syncingRef.current === side) return;
      const other = side === "left" ? mapRightRef.current : mapLeftRef.current;
      if (!other) return;
      syncingRef.current = side === "left" ? "right" : "left";
      other.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
      syncingRef.current = null;
    });
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const container = containerRef.current;
    if (!container) return;
    (e.target as Element).setPointerCapture(e.pointerId);

    function handleMove(ev: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setDividerPct(Math.min(96, Math.max(4, pct)));
    }
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden">
      <div className="absolute inset-0">
        <MapView
          profile={leftProfile}
          categoryId={null}
          showConfidenceOverlay={false}
          showPoiOverlay={false}
          onCellClick={noop}
          onMapReady={wireSync("left")}
        />
      </div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${dividerPct}%)` }}>
        <MapView
          profile={rightProfile}
          categoryId={null}
          showConfidenceOverlay={false}
          showPoiOverlay={false}
          onCellClick={noop}
          onMapReady={wireSync("right")}
        />
      </div>

      <div
        className="absolute top-0 bottom-0 z-10 w-1 cursor-ew-resize bg-white shadow"
        style={{ left: `${dividerPct}%` }}
        onPointerDown={handlePointerDown}
      >
        <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs shadow ring-1 ring-black/10">
          ↔
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-between px-2">
        <select
          className="pointer-events-auto rounded-md bg-white/95 px-2 py-1 text-xs shadow ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100"
          value={leftProfileId}
          onChange={(e) => onChangeLeft(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          className="pointer-events-auto rounded-md bg-white/95 px-2 py-1 text-xs shadow ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100"
          value={rightProfileId}
          onChange={(e) => onChangeRight(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
