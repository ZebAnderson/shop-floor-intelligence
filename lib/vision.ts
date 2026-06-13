// Milestone 2 — Vision (plumbing).
//
// classifyFrame() recovers a machine's state from a single frame. Two backends:
//   - local : finds the lit andon lamp by reading the PNG (lib/visionLocal.ts).
//             Deterministic, offline, no API key — used for the eval + report build.
//   - claude: Claude Opus 4.8 vision. The production / live-demo path.
//
// pngjs/fs only enter the module graph through the dynamically-imported local
// backend, so a serverless route that uses only the Claude path stays lean.
// This is deliberately framed as plumbing: the product is the agent loop that
// reasons over these classifications, not the classifier itself.
import { readFileSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { MachineState } from "./types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function resolveFrame(frameRef: string): string {
  return isAbsolute(frameRef) ? frameRef : join(repoRoot, frameRef);
}

export type VisionBackend = "local" | "claude";

// Default to the deterministic offline backend; opt into Claude with VISION_BACKEND=claude.
export function currentBackend(): VisionBackend {
  return (process.env.VISION_BACKEND ?? "").toLowerCase() === "claude"
    ? "claude"
    : "local";
}

function parseState(text: string): MachineState {
  const t = text.toLowerCase();
  if (t.includes("stop")) return "stopped";
  if (t.includes("idle")) return "idle";
  return "running";
}

// Core Claude path: classify a base64 PNG. No fs, so it is safe in a serverless
// route. No sampling params (Opus 4.8 rejects temperature/top_p/top_k).
export async function classifyImageClaude(base64Png: string): Promise<MachineState> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16,
    system:
      "You monitor a machine-shop camera. Each frame shows a machine with an andon stack light: a red lamp (top), an amber lamp (middle), and a green lamp (bottom). Exactly one lamp is lit. Map the lit lamp to the machine state and reply with ONE lowercase word only — red→stopped, amber→idle, green→running.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: base64Png },
          },
          {
            type: "text",
            text: "Which lamp is lit? Answer one word: running, idle, or stopped.",
          },
        ],
      },
    ],
  });
  const text = msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  return parseState(text);
}

export async function classifyFrameClaude(frameRef: string): Promise<MachineState> {
  const base64 = readFileSync(resolveFrame(frameRef)).toString("base64");
  return classifyImageClaude(base64);
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
