// Onboarding vision grounding — "set up in plain English". Given a still frame from a
// fixed shop camera and the operator's natural-language description of the machines,
// Claude Opus 4.8 identifies each named machine and locates it in the frame, so the agent
// knows which region of the view is which machine. Returns raw detections; the caller
// normalizes/validates them via lib/machineConfig.normalizeMachines.

export interface DetectedMachine {
  name: string;
  kind: string;
  region: { x: number; y: number; w: number; h: number };
  note?: string;
}

const SYSTEM_PROMPT =
  "You are setting up an autonomous shop-floor monitoring agent. You receive a still " +
  "frame from a FIXED shop camera and the operator's plain-English description of the " +
  "machines in view. Identify EACH machine the operator names and locate it in the image " +
  "using their spatial and visual cues (left / middle / right, 'the blue one', etc.). " +
  "Return ONLY a JSON array, one object per machine, no prose:\n" +
  '[{"name": "<the operator\'s name, e.g. Lathe 1>", "kind": "<short type: lathe|sander|cnc|press|mill|...>", ' +
  '"region": {"x": <0..1>, "y": <0..1>, "w": <0..1>, "h": <0..1>}, "note": "<short visual descriptor you used>"}]\n' +
  "region is a normalized bounding box of that machine within the frame; x,y is the top-left " +
  "corner, w,h the size, all fractions of the image (0..1). Include only machines the operator " +
  "describes. If a described machine is not visible, omit it.";

export async function identifyMachines(
  imageBase64: string,
  description: string,
  mediaType: "image/png" | "image/jpeg" = "image/png",
): Promise<DetectedMachine[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1536,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: `Operator description:\n${description}\n\nReturn the JSON array of machines.` },
        ],
      },
    ],
  });

  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error(`setup: no JSON array in response: ${text.slice(0, 80)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("setup: response was not a JSON array");
  return parsed as DetectedMachine[];
}
