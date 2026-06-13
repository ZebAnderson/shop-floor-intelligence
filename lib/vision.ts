// Milestone 2 — Vision (plumbing).
//
// classifyFrame() recovers a machine's state from a single frame. Two backends:
//   - local : finds the lit andon lamp by reading the PNG (lib/visionLocal.ts).
//             Deterministic, offline, no API key — used for the eval + report build.
//   - claude: Claude Opus 4.8 vision. The production / live-demo path; works on the
//             synthetic stack-light fixtures AND on real machine / webcam footage.
//
// This module is the LEAN, fs-free vision path: only the Claude base64 classifier +
// helpers. The filesystem path (reads a frameRef, dynamic-imports the pngjs local
// backend) lives in lib/visionFs.ts, so the /api/vision serverless bundle — which
// imports only classifyImageClaude — never pulls node:fs / pngjs in.
// Classification is plumbing: the product is the agent loop that reasons over it.
import type { FrameState } from "./types.ts";

export type VisionBackend = "local" | "claude";

// Default to the deterministic offline backend; opt into Claude with VISION_BACKEND=claude.
export function currentBackend(): VisionBackend {
  return (process.env.VISION_BACKEND ?? "").toLowerCase() === "claude"
    ? "claude"
    : "local";
}

// Fail closed: only the model's exact contract (one of the four words) is accepted.
// An empty/refusal/unexpected response throws rather than silently becoming "running".
export function parseState(text: string): FrameState {
  const word = text.trim().toLowerCase().split(/[^a-z]+/).filter(Boolean)[0] ?? "";
  if (word === "running" || word === "idle" || word === "stopped" || word === "obstructed") {
    return word;
  }
  throw new Error(
    `vision: unrecognized classification response: ${JSON.stringify(text.slice(0, 60))}`,
  );
}

const SYSTEM_PROMPT =
  "You monitor a live machine-shop camera for an autonomous floor-monitoring agent. " +
  "Decide the state from this single frame:\n" +
  "- running: actively cycling or cutting — moving spindle/tool, chips/sparks, visible motion, or a GREEN andon stack light lit.\n" +
  "- idle: powered but not working — no motion, no operator, or an AMBER andon light lit.\n" +
  "- stopped: halted or faulted — machine off, a fault condition, or a RED andon light lit.\n" +
  "- obstructed: choose this ONLY when the view is genuinely UNUSABLE — the lens is physically blocked or covered, a hand/object is pressed against it, or the frame is near-black, a near-uniform solid color, or so dark/blurred that essentially nothing is discernible. A normal scene is NOT obstructed: a dark shop, a wide or angled or grainy view, an unfamiliar machine, or SEVERAL machines in frame all still count as usable — classify the state you can see. Do not use obstructed just because the scene is busy, dim, or ambiguous.\n" +
  "If several machines are visible, report the state of the most prominent one (largest / nearest / clearest). " +
  "If a colored andon stack light is visible it is the most reliable signal (red->stopped, amber->idle, green->running). " +
  "Reply with EXACTLY one lowercase word: running, idle, stopped, or obstructed.";

// Core Claude path: classify a base64 PNG. No fs, so it is safe in a serverless
// route. No sampling params (Opus 4.8 rejects temperature/top_p/top_k).
export async function classifyImageClaude(
  base64Image: string,
  mediaType: "image/png" | "image/jpeg" = "image/png",
): Promise<FrameState> {
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
          { type: "text", text: "What is the machine's state? Reply one word — running, idle, stopped, or obstructed (use obstructed only if the view is genuinely unusable)." },
        ],
      },
    ],
  });
  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  return parseState(text);
}
