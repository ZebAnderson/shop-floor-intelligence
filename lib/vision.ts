// Milestone 2 — Vision (plumbing).
//
// classifyFrame() recovers a machine's state from a single frame. Two backends:
//   - local : finds the lit andon lamp by reading the PNG (lib/visionLocal.ts).
//             Deterministic, offline, no API key — used for the eval + report build.
//   - claude: Claude Opus 4.8 vision. The production / live-demo path; works on the
//             synthetic stack-light fixtures AND on real machine / webcam footage.
//
// pngjs/fs only enter the module graph through the dynamically-imported local
// backend, so a serverless route that uses only the Claude path stays lean.
// This is deliberately framed as plumbing: the product is the agent loop that
// reasons over these classifications, not the classifier itself.
import { readFileSync } from "node:fs";
import { join, dirname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { MachineState } from "./types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// frameRef must resolve inside the repo (it is only ever sourced from build-time
// fixtures, never from HTTP input — the route uses the base64 path instead).
function resolveFrame(frameRef: string): string {
  const p = normalize(join(repoRoot, frameRef));
  if (p !== repoRoot && !p.startsWith(repoRoot + sep)) {
    throw new Error(`vision: frameRef escapes repo root: ${frameRef}`);
  }
  return p;
}

export type VisionBackend = "local" | "claude";

// Default to the deterministic offline backend; opt into Claude with VISION_BACKEND=claude.
export function currentBackend(): VisionBackend {
  return (process.env.VISION_BACKEND ?? "").toLowerCase() === "claude"
    ? "claude"
    : "local";
}

// Fail closed: only the model's exact contract (one of the three words) is accepted.
// An empty/refusal/unexpected response throws rather than silently becoming "running".
export function parseState(text: string): MachineState {
  const word = text.trim().toLowerCase().split(/[^a-z]+/).filter(Boolean)[0] ?? "";
  if (word === "running" || word === "idle" || word === "stopped") {
    return word;
  }
  throw new Error(
    `vision: unrecognized classification response: ${JSON.stringify(text.slice(0, 60))}`,
  );
}

const SYSTEM_PROMPT =
  "You monitor a live machine-shop camera for an autonomous floor-monitoring agent. " +
  "Decide the machine's current state from this single frame:\n" +
  "- running: actively cycling or cutting — moving spindle/tool, chips/sparks, visible motion, or a GREEN andon stack light lit.\n" +
  "- idle: powered but not working — no motion, no operator, or an AMBER andon light lit.\n" +
  "- stopped: halted or faulted — machine off, a fault condition, or a RED andon light lit.\n" +
  "If a colored andon stack light is visible it is the most reliable signal (red->stopped, amber->idle, green->running). " +
  "Reply with EXACTLY one lowercase word: running, idle, or stopped.";

// Core Claude path: classify a base64 PNG. No fs, so it is safe in a serverless
// route. No sampling params (Opus 4.8 rejects temperature/top_p/top_k).
export async function classifyImageClaude(
  base64Image: string,
  mediaType: "image/png" | "image/jpeg" = "image/png",
): Promise<MachineState> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
          { type: "text", text: "What is the machine's state? Answer one word: running, idle, or stopped." },
        ],
      },
    ],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return parseState(text);
}

export async function classifyFrameClaude(frameRef: string): Promise<MachineState> {
  return classifyImageClaude(readFileSync(resolveFrame(frameRef)).toString("base64"));
}

export async function classifyFrame(
  frameRef: string,
  opts?: { backend?: VisionBackend },
): Promise<MachineState> {
  const backend = opts?.backend ?? currentBackend();
  if (backend === "claude") return classifyFrameClaude(frameRef);
  const { classifyFrameLocal } = await import("./visionLocal.ts");
  return classifyFrameLocal(frameRef);
}
