// Filesystem vision path — reads a frame from disk and classifies it. Kept SEPARATE
// from lib/vision.ts so the /api/vision serverless route (which imports only
// classifyImageClaude) never pulls node:fs / pngjs / visionLocal into its bundle.
// Only the eval + report scripts and the agent's default classifier import this.
import { readFileSync } from "node:fs";
import { join, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyImageClaude, currentBackend, type VisionBackend } from "./vision.ts";
import type { FrameState } from "./types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// frameRef must resolve inside the repo (only ever build-time fixtures, never HTTP input).
function resolveFrame(frameRef: string): string {
  const p = normalize(join(repoRoot, frameRef));
  if (p !== repoRoot && !p.startsWith(repoRoot + sep)) {
    throw new Error(`vision: frameRef escapes repo root: ${frameRef}`);
  }
  return p;
}

export async function classifyFrameClaude(frameRef: string): Promise<FrameState> {
  return classifyImageClaude(readFileSync(resolveFrame(frameRef)).toString("base64"));
}

export async function classifyFrame(
  frameRef: string,
  opts?: { backend?: VisionBackend },
): Promise<FrameState> {
  const backend = opts?.backend ?? currentBackend();
  if (backend === "claude") return classifyFrameClaude(frameRef);
  const { classifyFrameLocal } = await import("./visionLocal.ts");
  return classifyFrameLocal(frameRef);
}
