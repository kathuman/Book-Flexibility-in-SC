export interface OverlayTogglesProps {
  showConfidenceOverlay: boolean;
  onToggleConfidence: (value: boolean) => void;
  showPoiOverlay: boolean;
  onTogglePoi: (value: boolean) => void;
  poiOverlayDisabled: boolean;
}

/** CLAUDE.md Section 8 overlay toggles. Gate-failure hatching is always on
 * (a gated cell must never look like a real score) so it has no toggle
 * here -- only confidence desaturation and the POI-points layer do. */
export default function OverlayToggles({
  showConfidenceOverlay,
  onToggleConfidence,
  showPoiOverlay,
  onTogglePoi,
  poiOverlayDisabled,
}: OverlayTogglesProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-white/95 p-2.5 text-sm shadow-md ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={showConfidenceOverlay}
          onChange={(e) => onToggleConfidence(e.target.checked)}
        />
        Desaturate low-confidence cells
      </label>
      <label className={"flex items-center gap-2" + (poiOverlayDisabled ? " opacity-40" : "")}>
        <input
          type="checkbox"
          checked={showPoiOverlay}
          disabled={poiOverlayDisabled}
          onChange={(e) => onTogglePoi(e.target.checked)}
        />
        Show POIs for selected category
      </label>
    </div>
  );
}
