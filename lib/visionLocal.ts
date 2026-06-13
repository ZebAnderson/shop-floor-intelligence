// Local (offline, deterministic) vision backend. Reads the PNG and finds the lit
// andon lamp by brightness. Kept in its own module so the deployed serverless
// bundle never pulls pngjs/fs in unless the local path is actually invoked.
import { readFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LAMPS } from "./frameGeometry.ts";
import type { MachineState } from "./types.ts";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as typeof import("pngjs");

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORDER: MachineState[] = ["stopped", "idle", "running"];

function resolveFrame(frameRef: string): string {
  return isAbsolute(frameRef) ? frameRef : join(repoRoot, frameRef);
}

export function classifyFrameLocal(frameRef: string): MachineState {
  const png = PNG.sync.read(readFileSync(resolveFrame(frameRef)));
  let best: MachineState = "idle";
  let bestBrightness = -1;
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
    const brightness = sum / (n || 1);
    if (brightness > bestBrightness) {
      bestBrightness = brightness;
      best = state;
    }
  }
  return best;
}
