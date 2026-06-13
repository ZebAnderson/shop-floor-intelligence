// Generates the synthetic camera feed from the committed timeline
// (fixtures/sequence.json) and writes eval/ground_truth.csv. Run: npm run fixtures.
//
// Each frame renders a machine with an andon stack light (the lit lamp encodes
// the frame's true state) plus a spindle that advances while running, so a
// running machine's consecutive frames genuinely differ.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadRawSequence } from "../lib/ingest.ts";
import {
  FRAME_W,
  FRAME_H,
  LAMPS,
  LAMP_COLORS,
} from "../lib/frameGeometry.ts";
import type { MachineState } from "../lib/types.ts";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as typeof import("pngjs");
type Png = InstanceType<typeof PNG>;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fillRect(
  png: Png,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: readonly [number, number, number],
): void {
  const [r, g, b] = color;
  const X0 = Math.max(0, x0);
  const Y0 = Math.max(0, y0);
  const X1 = Math.min(png.width, x1);
  const Y1 = Math.min(png.height, y1);
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const i = (png.width * y + x) << 2;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
}

function renderFrame(state: MachineState, step: number): Buffer {
  const png = new PNG({ width: FRAME_W, height: FRAME_H });
  fillRect(png, 0, 0, FRAME_W, FRAME_H, [22, 26, 32]); // shop-floor background
  fillRect(png, 28, 86, 214, 204, [58, 64, 72]); // machine body
  fillRect(png, 40, 58, 200, 90, [80, 86, 96]); // machine head
  const partX = 52 + (state === "running" ? (step % 5) * 28 : 0);
  fillRect(png, partX, 104, partX + 26, 142, [150, 160, 172]); // spindle / part
  fillRect(png, 283, 182, 289, 214, [90, 96, 104]); // stack-light pole
  for (const lamp of ["stopped", "idle", "running"] as MachineState[]) {
    const r = LAMPS[lamp];
    const c = LAMP_COLORS[lamp];
    fillRect(png, r.x0, r.y0, r.x1, r.y1, lamp === state ? c.on : c.off);
  }
  return PNG.sync.write(png);
}

const frames = loadRawSequence();
mkdirSync(join(repoRoot, "fixtures", "frames"), { recursive: true });
mkdirSync(join(repoRoot, "eval"), { recursive: true });

const groundTruth: string[] = ["frameRef,label"];
for (const f of frames) {
  const state = (f.trueState ?? "running") as MachineState;
  writeFileSync(join(repoRoot, f.frameRef), renderFrame(state, f.step ?? 0));
  groundTruth.push(`${f.frameRef},${state}`);
}
writeFileSync(
  join(repoRoot, "eval", "ground_truth.csv"),
  groundTruth.join("\n") + "\n",
);

console.log(`Generated ${frames.length} frames -> fixtures/frames/`);
console.log(`Wrote eval/ground_truth.csv (${frames.length} rows)`);
