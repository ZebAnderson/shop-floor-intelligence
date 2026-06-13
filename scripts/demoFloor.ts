// Renders a still of the demo floor (3 distinct machines: green lathe left, gray sander
// middle, blue CNC right) to public/demo-floor.png — used to test /api/setup and as a
// static preview/fallback. Run: node scripts/demoFloor.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as typeof import("pngjs");

const W = 640;
const H = 480;
const png = new PNG({ width: W, height: H });

function fill(x0: number, y0: number, x1: number, y1: number, c: readonly [number, number, number]): void {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(H, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(W, Math.round(x1)); x++) {
      const i = (W * y + x) << 2;
      png.data[i] = c[0];
      png.data[i + 1] = c[1];
      png.data[i + 2] = c[2];
      png.data[i + 3] = 255;
    }
  }
}
const lighter = (c: readonly [number, number, number]): [number, number, number] => [
  Math.min(255, Math.round(c[0] * 1.25)),
  Math.min(255, Math.round(c[1] * 1.25)),
  Math.min(255, Math.round(c[2] * 1.25)),
];

fill(0, 0, W, H, [14, 17, 22]); // background
fill(0, H * 0.74, W, H, [17, 21, 27]); // floor

const machines: { cx: number; color: readonly [number, number, number] }[] = [
  { cx: 0.18, color: [90, 125, 90] }, // lathe (greenish), left
  { cx: 0.5, color: [91, 98, 107] }, // sander (gray), middle
  { cx: 0.82, color: [63, 111, 174] }, // CNC (blue), right
];

for (const m of machines) {
  const cx = m.cx * W;
  const bw = W * 0.2;
  const bh = H * 0.32;
  const x = cx - bw / 2;
  const baseY = H * 0.72;
  const y = baseY - bh;
  fill(x, y, x + bw, baseY, m.color);
  fill(x + bw * 0.1, y - bh * 0.16, x + bw * 0.9, y, lighter(m.color));
  // green ("running") lamp lit, top-right
  const lw = W * 0.022;
  const lh = H * 0.045;
  const lx = x + bw - lw * 1.4;
  const ly = y - bh * 0.5;
  fill(lx, ly + 2 * (lh + 2), lx + lw, ly + 2 * (lh + 2) + lh, [55, 210, 90]);
}

mkdirSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public"), { recursive: true });
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "demo-floor.png"), PNG.sync.write(png));
console.log("Wrote public/demo-floor.png");
