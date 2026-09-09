"use client";

import { useCallback, useState } from "react";
import MapView from "@/components/map/MapView";
import CompareView from "@/components/map/CompareView";
import ProfileSelector from "@/components/map/ProfileSelector";
import CategoryDropdown from "@/components/map/CategoryDropdown";
import OverlayToggles from "@/components/map/OverlayToggles";
import Legend from "@/components/map/Legend";
import DetailCard from "@/components/map/DetailCard";
import AddressSearch, { type AddressSearchResult } from "@/components/map/AddressSearch";
import manifest from "@/lib/style/profile-manifest.json";
import type { Manifest } from "@/lib/style/types";
import type { Map as MaplibreMap } from "maplibre-gl";

const { profiles } = manifest as Manifest;

// Manifest order is alphabetical by profile id (scripts/generate-profile-manifest.mjs),
// not MVP build order -- pick `family` explicitly (CLAUDE.md Section 5's
// first MVP profile) as the default landing view instead of whichever
// profile happens to sort first.
const DEFAULT_PROFILE_ID = profiles.some((p) => p.id === "family") ? "family" : profiles[0].id;

interface SelectedCell {
  h3: string;
  lngLat: { lng: number; lat: number };
}

export default function Home() {
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showConfidenceOverlay, setShowConfidenceOverlay] = useState(false);
  const [showPoiOverlay, setShowPoiOverlay] = useState(false);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [lines, setLines] = useState<GeoJSON.FeatureCollection<GeoJSON.LineString> | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState(DEFAULT_PROFILE_ID);
  const [compareRightId, setCompareRightId] = useState(
    profiles.some((p) => p.id === "student") ? "student" : profiles[Math.min(1, profiles.length - 1)].id
  );
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];

  const handleCellClick = useCallback((h3: string, lngLat: { lng: number; lat: number }) => {
    setSelectedCell({ h3, lngLat });
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedCell(null);
    setLines(null);
  }, []);

  const handleProfileChange = useCallback((id: string) => {
    setProfileId(id);
    setCategoryId(null); // new profile's categories differ; drop stale drill-down
    setSelectedCell(null);
    setLines(null);
  }, []);

  const handleAddressSelect = useCallback(
    (result: AddressSearchResult) => {
      mapInstance?.flyTo({ center: [result.lng, result.lat], zoom: 15 });
    },
    [mapInstance]
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {compareMode ? (
        <CompareView
          profiles={profiles}
          leftProfileId={compareLeftId}
          rightProfileId={compareRightId}
          onChangeLeft={setCompareLeftId}
          onChangeRight={setCompareRightId}
        />
      ) : (
        <MapView
          profile={profile}
          categoryId={categoryId}
          showConfidenceOverlay={showConfidenceOverlay}
          showPoiOverlay={showPoiOverlay}
          onCellClick={handleCellClick}
          lines={lines}
          onMapReady={setMapInstance}
        />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
        <div className="pointer-events-auto flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-start gap-2">
            {!compareMode && <ProfileSelector profiles={profiles} selectedId={profileId} onChange={handleProfileChange} />}
            <button
              type="button"
              onClick={() => setCompareMode((v) => !v)}
              className="rounded-md bg-white/95 px-3 py-1.5 text-sm font-medium shadow-md ring-1 ring-black/10 hover:bg-neutral-100 dark:bg-neutral-900/95 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              {compareMode ? "Exit compare" : "Compare"}
            </button>
          </div>
          {!compareMode && <AddressSearch onSelect={handleAddressSelect} />}
        </div>

        {!compareMode && (
          <div className="pointer-events-auto flex items-end justify-between gap-2">
            <div className="flex flex-col gap-2">
              <CategoryDropdown profile={profile} selectedCategoryId={categoryId} onChange={setCategoryId} />
              <OverlayToggles
                showConfidenceOverlay={showConfidenceOverlay}
                onToggleConfidence={setShowConfidenceOverlay}
                showPoiOverlay={showPoiOverlay}
                onTogglePoi={setShowPoiOverlay}
                poiOverlayDisabled={categoryId === null}
              />
            </div>
            <Legend title={categoryId ? `${profile.label} — ${categoryId}` : profile.label} />
          </div>
        )}
      </div>

      {!compareMode && selectedCell && (
        <div className="absolute top-16 right-3">
          <DetailCard
            profile={profile}
            h3={selectedCell.h3}
            clickLngLat={selectedCell.lngLat}
            onClose={closeDetail}
            onLinesChange={setLines}
          />
        </div>
      )}
    </div>
  );
}
