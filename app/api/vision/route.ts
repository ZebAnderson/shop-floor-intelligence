// Live vision endpoint — the demo/prod path that proves real Claude Opus 4.8 vision.
// POST { imageBase64, mediaType? } (base64-encoded PNG/JPEG) -> { state, model }.
// Takes the image in the body (no server-side fs) so it is safe on Vercel.
// Needs ANTHROPIC_API_KEY in the environment.
import { NextResponse } from "next/server";
import { classifyImageClaude } from "@/lib/vision.ts";

export const runtime = "nodejs";
export const maxDuration = 30;

// Hard cap: a ~1024x768 frame is well under this. Bounds memory + paid-call abuse on
// this unauthenticated endpoint.
const MAX_B64 = 8_000_000;

function statusOf(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (s === 429) return 429;
  }
  return 502;
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_B64 + 4096) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: { imageBase64?: string; mediaType?: string };
  try {
    body = (await req.json()) as { imageBase64?: string; mediaType?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "imageBase64 (a base64 image) is required" },
      { status: 400 },
    );
  }
  if (raw.length > MAX_B64) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return NextResponse.json({ error: "imageBase64 is not valid base64" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Vision is not configured on the server" },
      { status: 503 },
    );
  }

  const mediaType = body.mediaType === "image/jpeg" ? "image/jpeg" : "image/png";
  try {
    const state = await classifyImageClaude(raw, mediaType);
    return NextResponse.json({ state, backend: "claude", model: "claude-opus-4-8" });
  } catch (err) {
    // Log details server-side; never reflect provider error text / request ids to clients.
    console.error("vision route error", err);
    return NextResponse.json(
      { error: "Vision classification failed" },
      { status: statusOf(err) },
    );
  }
}
