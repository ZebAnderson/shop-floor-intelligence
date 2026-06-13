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
  "You are setting up an autonomous shop-floor monitoring agent. You receive a still frame " +
  "from a FIXED shop camera and, optionally, the operator's plain-English description of the " +
  "machines. Identify EVERY distinct machine visible in the frame — one entry per machine; do " +
  "not omit any, and do not invent machines that aren't there. SCAN THE WHOLE FRAME left to " +
  "right, including machines near the edges/corners and in brighter or darker areas, and in " +
  "the far background — shops usually have several machines in a row, so do NOT stop after the " +
  "first few and do NOT merge two separate machines into one (each physically separate machine " +
  "is its own entry, even if they are close together or partly overlapping in perspective). " +
  "Name and type each one: if the " +
  "operator's description refers to it (by position, color, or type), use that name; otherwise " +
  "INFER a plausible, specific name and type from its appearance (shape, color, position) — a " +
  "long bed with a chuck is a lathe, an enclosed cabinet is a CNC, a tall frame with a ram is a " +
  'press, etc. Prefer descriptive guesses ("Lathe 1", "CNC Mill", "Hydraulic Press") over ' +
  "generic labels like 'Machine 4'. Ignore non-machine objects (scrap bins, people, walkways, " +
  "walls). Return ONLY a JSON array, no prose:\n" +
  '[{"name": "<name>", "kind": "<short type: lathe|mill|cnc|press|sander|drill|saw|...>", ' +
  '"region": {"x": <0..1>, "y": <0..1>, "w": <0..1>, "h": <0..1>}, "note": "<short visual descriptor>"}]\n' +
  "region is a normalized bounding box of the machine (x,y = top-left corner; w,h = size; all " +
  "fractions of the image, 0..1).";

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
          {
            type: "text",
            text: description.trim()
              ? `Operator description: ${description}\n\nUse it where it applies, but identify and name EVERY machine in the frame (infer names for any the operator didn't mention). Return the JSON array.`
              : "No description provided — identify and name EVERY machine in the frame from its appearance. Return the JSON array.",
          },
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
