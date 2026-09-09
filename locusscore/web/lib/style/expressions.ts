import type { ExpressionSpecification } from "maplibre-gl";
import { SCORE_BREAKS, SCORE_COLORS, SCORE_COLORS_DESATURATED } from "./colors";

/** Tile attribute name for a profile's composite score or a single
 * category's A_k value (CLAUDE.md Section 7). `category` null means the
 * composite score; otherwise the drill-down value for that category. */
export function scoreProperty(profileId: string, categoryId: string | null): string {
  return categoryId ? `cat_${profileId}_${categoryId}` : `score_${profileId}`;
}

export function gateProperty(profileId: string): string {
  return `gate_${profileId}`;
}

/** step expression over the fixed 0-100 scale (never quantile — see
 * colors.ts). Cells with a null score are handled by a separate gate
 * layer (see MapView), not by this expression, so this only needs to
 * cover the numeric case. */
function stepExpression(property: string, colors: readonly string[]): ExpressionSpecification {
  const stops: (string | number)[] = [colors[0]];
  SCORE_BREAKS.forEach((breakpoint, i) => {
    stops.push(breakpoint, colors[i + 1]);
  });
  return ["step", ["get", property], ...stops] as unknown as ExpressionSpecification;
}

export function buildFillColorExpression(
  profileId: string,
  categoryId: string | null,
  desaturateLowConfidence: boolean
): ExpressionSpecification {
  const property = scoreProperty(profileId, categoryId);
  const normal = stepExpression(property, SCORE_COLORS);
  if (!desaturateLowConfidence) return normal;
  const desaturated = stepExpression(property, SCORE_COLORS_DESATURATED);
  return [
    "case",
    ["==", ["get", "confidence"], "low"],
    desaturated,
    normal,
  ] as unknown as ExpressionSpecification;
}
