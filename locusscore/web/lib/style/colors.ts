// CLAUDE.md Section 8 "Colour":
//   - Fixed 0-100 scale, IDENTICAL for every profile and every category.
//     Never quantile (i.e. never derived from the data's own distribution).
//   - 7 discrete classes, ColorBrewer RdYlBu (colourblind-safe).
//   - null (gate failed) = hatched grey. Low confidence = 50% desaturation.
//
// Every color scale in the app must import from here. Do not compute a
// palette inline anywhere else — that's how "never quantile" quietly stops
// being true.

/** Six fixed breakpoints dividing [0, 100] into 7 equal-width classes.
 * Equal-width and computed once, independent of whatever scores this
 * session's fixture (or real) data happens to produce. */
export const SCORE_BREAKS = [14, 29, 43, 57, 71, 86] as const;

/** ColorBrewer RdYlBu, 7-class, red (low/poor) -> blue (high/good). */
export const SCORE_COLORS = [
  "#d73027",
  "#fc8d59",
  "#fee090",
  "#ffffbf",
  "#e0f3f8",
  "#91bfdb",
  "#4575b4",
] as const;

/** Same 7 classes, desaturated ~50% toward mid-grey — used for
 * low-confidence cells per Section 8, never as a substitute for the hatch
 * pattern used on gate failures (those are a different signal). */
export const SCORE_COLORS_DESATURATED = SCORE_COLORS.map((hex) => mix(hex, "#9a9a9a", 0.5));

export function classIndexForScore(score: number): number {
  for (let i = 0; i < SCORE_BREAKS.length; i++) {
    if (score < SCORE_BREAKS[i]) return i;
  }
  return SCORE_COLORS.length - 1;
}

export function legendItems(): { color: string; label: string }[] {
  const bounds = [0, ...SCORE_BREAKS, 100];
  return SCORE_COLORS.map((color, i) => ({
    color,
    label: `${bounds[i]}-${bounds[i + 1]}`,
  }));
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return rgbToHex(r, g, bl);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
