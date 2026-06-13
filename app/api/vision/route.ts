// Live vision endpoint — the demo path that proves real Claude Opus 4.8 vision.
// POST { imageBase64 } (a base64-encoded PNG) -> { state }.
// Takes the image in the body (no server-side fs) so it is safe on Vercel.
// Needs ANTHROPIC_API_KEY in the environment.
import { NextResponse } from "next/server";
import { classifyImageClaude } from "@/lib/vision.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { imageBase64?: string };
    const imageBase64 = body.imageBase64?.replace(/^data:image\/\w+;base64,/, "");
    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 (a base64 PNG) is required" },
        { status: 400 },
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 503 },
      );
    }
    const state = await classifyImageClaude(imageBase64);
    return NextResponse.json({
      state,
      backend: "claude",
      model: "claude-opus-4-8",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
