"use client";

import { useEffect, useState } from "react";
import { detailUrl } from "@/lib/tiles";
import type { CellDetail, DetailProfileEntry, ProfileManifest } from "@/lib/style/types";

export interface DetailCardProps {
  profile: ProfileManifest;
  h3: string;
  clickLngLat: { lng: number; lat: number };
  onClose: () => void;
  onLinesChange: (lines: GeoJSON.FeatureCollection<GeoJSON.LineString> | null) => void;
}

/** CLAUDE.md Section 8: "Detail card on click: score, gate status,
 * per-category bars, POI list with distances, lines from location to each
 * POI drawn on the map." Reads a precomputed per-cell detail shard, per
 * Section 3's "zero serverless functions" design rule -- no API route. */
export default function DetailCard({ profile, h3, clickLngLat, onClose, onLinesChange }: DetailCardProps) {
  const [detail, setDetail] = useState<CellDetail | null>(null);
  const [errorState, setErrorState] = useState<{ h3: string; message: string } | null>(null);

  // Never setState synchronously in the effect body -- only from the async
  // fetch callbacks. "Which h3 is this data/error for" is tracked in the
  // state itself (detail.h3, errorState.h3) rather than reset up front, so
  // stale data from a previous cell never gets shown as current (see the
  // `isCurrent`/`error` derivation below) without needing a synchronous
  // clear-on-h3-change effect.
  useEffect(() => {
    let cancelled = false;
    fetch(detailUrl(h3))
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<CellDetail>;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorState({ h3, message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [h3]);

  const isCurrent = detail?.h3 === h3;
  const error = errorState?.h3 === h3 ? errorState.message : null;
  const loading = !isCurrent && !error;

  useEffect(() => {
    if (!isCurrent) return;
    const entry = detail!.profiles[profile.id];
    if (!entry) {
      onLinesChange(null);
      return;
    }
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = Object.values(entry.categories).flatMap((cat) =>
      cat.pois.map((poi) => ({
        type: "Feature" as const,
        properties: { name: poi.name, category: poi.category, distance_m: poi.distance_m },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [clickLngLat.lng, clickLngLat.lat],
            [poi.lon, poi.lat],
          ],
        },
      }))
    );
    onLinesChange({ type: "FeatureCollection", features });
    // Unmount/close clears lines too -- handled by the parent alongside
    // clearing the selected cell, not here.
  }, [isCurrent, detail, profile.id, clickLngLat, onLinesChange]);

  const entry: DetailProfileEntry | undefined = isCurrent ? detail!.profiles[profile.id] : undefined;

  return (
    <div className="w-80 max-w-[90vw] rounded-md bg-white/95 p-3 text-sm shadow-lg ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{profile.label}</div>
          <div className="font-mono text-xs text-neutral-400">{h3}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded px-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          ✕
        </button>
      </div>

      {error && <div className="text-red-600">Failed to load detail: {error}</div>}
      {loading && <div className="text-neutral-500">Loading…</div>}

      {entry && (
        <>
          {entry.gate_failed ? (
            <div className="mb-2 rounded bg-neutral-200 px-2 py-1 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              Unsuitable — failed gate: {entry.gate_failed}
            </div>
          ) : (
            <div className="mb-2 text-2xl font-semibold">{entry.score}</div>
          )}

          <div className="flex flex-col gap-1.5">
            {profile.categories.map((cat) => {
              const catEntry = entry.categories[cat.id];
              if (!catEntry) return null;
              return (
                <div key={cat.id}>
                  <div className="flex items-center justify-between text-xs">
                    <span>
                      {cat.label}
                      {cat.sign === -1 ? " (−)" : ""}
                    </span>
                    <span className="text-neutral-500">{catEntry.value}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
                    <div
                      className={"h-full " + (cat.sign === -1 ? "bg-red-400" : "bg-blue-400")}
                      style={{ width: `${catEntry.value}%` }}
                    />
                  </div>
                  {catEntry.pois.length > 0 && (
                    <ul className="mt-0.5 text-[11px] text-neutral-500">
                      {catEntry.pois.map((poi, i) => (
                        <li key={i}>
                          {poi.name} — {Math.round(poi.distance_m)}m
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
