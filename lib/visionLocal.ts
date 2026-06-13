// Local (offline, deterministic) vision backend. Reads the PNG and finds the lit
// andon lamp by brightness. Kept in its own module so the deployed serverless
// bundle never pulls pngjs/fs in unless the local path is actually invoked.
import { readFileSync } from "node:fs";
import { join, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LAMPS } from "./frameGeometry.ts";
import type { MachineState, FrameState } from "./types.ts";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as typeof import("pngjs");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Benign-first: a low-signal / blank frame must NOT default to "stopped" (that would
// fabricate a false alarm — the worst failure mode for a monitor). A lamp must be
// clearly lit (bright AND well clear of the runner-up) or we fall back to "idle".
const ORDER: MachineState[] = ["running", "idle", "stopped"];
const MIN_LIT = 90; // mean (R+G+B) of a lit lamp region; off lamps sit well below
const MIN_MARGIN = 30; // winning lamp must beat the runner-up by this much
// Below this per-channel luminance variance the frame is essentially uniform — a
// covered/blocked/too-dark lens — so we report it as obstructed, not a machine state.
const UNIFORM_VAR = 120;

// Is the whole frame near-uniform (lens blocked, covered, or too dark to read)?
function isObstructed(png: InstanceType<typeof PNG>): boolean {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 0; y < png.height; y += 4) {
    for (let x = 0; x < png.width; x += 4) {
      const i = (png.width * y + x) << 2;
      const lum = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
  }
  if (n === 0) return true;
  const mean = sum / n;
  return sumSq / n - mean * mean < UNIFORM_VAR;
}

// frameRef must resolve inside the repo (never sourced from untrusted/HTTP input).
function resolveFrame(frameRef: string): string {
  const p = normalize(join(repoRoot, frameRef));
  if (p !== repoRoot && !p.startsWith(repoRoot + sep)) {
    throw new Error(`vision: frameRef escapes repo root: ${frameRef}`);
  }
  return p;
}

export function classifyFrameLocal(frameRef: string): FrameState {
  const png = PNG.sync.read(readFileSync(resolveFrame(frameRef)));
  const brightness: Record<MachineState, number> = { running: 0, idle: 0, stopped: 0 };
  for (const state of ORDER) {
    const r = LAMPS[state];
    let sum = 0;
    let n = 0;
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const i = (png.width * y + x) << 2;
        sum += png.data[i] + png.data[i + 1] + png.data[i + 2];
        n++;
      }
    }
    brightness[state] = sum / (n || 1);
  }
  const ranked = ORDER.slice().sort((a, b) => brightness[b] - brightness[a]);
  const [top, second] = ranked;
  if (brightness[top] >= MIN_LIT && brightness[top] - brightness[second] >= MIN_MARGIN) {
    return top; // a lamp is clearly lit
  }
  // No clearly-lit lamp: distinguish a blocked/covered lens from a benign idle frame.
  return isObstructed(png) ? "obstructed" : "idle";
}
