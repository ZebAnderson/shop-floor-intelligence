// Onboarding endpoint — grounds an operator's plain-English machine description into
// labeled frame regions. POST { imageBase64, description, mediaType? } -> { machines }.
// Image in the body (no server fs), size-capped, generic errors — same posture as /api/vision.
import { NextResponse } from "next/server";
import { identifyMachines } from "@/lib/setup.ts";
import { normalizeMachines } from "@/lib/machineConfig.ts";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_B64 = 8_000_000;
const MAX_DESC = 2000;

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_B64 + 8192) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: { imageBase64?: string; description?: string; mediaType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = (body.imageBase64 ?? "").replace(/^data:image\/\w+;base64,/, "").trim();
  const description = (body.description ?? "").trim().slice(0, MAX_DESC);
  if (!raw) return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
  if (raw.length > MAX_B64) return NextResponse.json({ error: "Image too large" }, { status: 413 });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return NextResponse.json({ error: "imageBase64 is not valid base64" }, { status: 400 });
  }
  // description is OPTIONAL — when omitted, the agent detects + names every machine itself.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Vision is not configured on the server" }, { status: 503 });
  }

  const mediaType = body.mediaType === "image/jpeg" ? "image/jpeg" : "image/png";
  try {
    const detected = await identifyMachines(raw, description, mediaType);
    const machines = normalizeMachines(detected);
    return NextResponse.json({ machines, model: "claude-opus-4-8" });
  } catch (err) {
    console.error("setup route error", err);
    return NextResponse.json({ error: "Machine identification failed" }, { status: 502 });
  }
}
