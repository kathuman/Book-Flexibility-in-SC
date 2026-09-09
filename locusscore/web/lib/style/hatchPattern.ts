// Canvas-drawn diagonal-stripe pattern for gate-failed cells. CLAUDE.md
// Section 8: "null (gate failed) = hatched grey" — a gated cell must never
// be visually confusable with a real (if low) score.
export const HATCH_IMAGE_ID = "locusscore-gate-hatch";

export function createHatchPatternImage(): { width: number; height: number; data: Uint8Array } {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c9c9c9";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#8a8a8a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-4, size);
  ctx.lineTo(size, -4);
  ctx.moveTo(0, size + 4);
  ctx.lineTo(size + 4, 0);
  ctx.stroke();
  const imageData = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(imageData.data.buffer) };
}
