// Lets Claude Opus 4.8 author the agent's response to a caught stoppage — a cause
// hypothesis + the supervisor's next action + a shift-briefing line — instead of a
// fixed template. This is the visibly model-authored "intelligence" in the demo.
// Throws on any failure so callers can fall back to the deterministic template.
import type { Anomaly, MachineSummary } from "./types.ts";

export interface DraftedReasoning {
  draftedAction: string;
  briefing: string;
}

export async function draftAnomalyReasoning(
  anomaly: Anomaly,
  machines: MachineSummary[],
): Promise<DraftedReasoning> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  const context = machines
    .map((m) => `${m.machineName} (${m.machineId}): ${m.latestState}, ${(m.utilization * 100).toFixed(0)}% util`)
    .join("; ");

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 400,
    system:
      "You are an autonomous shop-floor monitoring agent for a high-mix job shop. Camera vision has caught a machine stopped for a sustained period. Draft the supervisor's response: a brief cause hypothesis (e.g. planned tool change vs. jam/crash vs. operator stepped away vs. fault) and the concrete next step, plus a single-line shift-briefing entry. Be specific and operational; no fluff. Respond ONLY as minified JSON: {\"draftedAction\": string, \"briefing\": string}.",
    messages: [
      {
        role: "user",
        content: `Caught stoppage: ${anomaly.machineName} (${anomaly.machineId}) stopped ~${anomaly.durationMin} min, first detected at ${anomaly.detectedAt}. The agent investigated ${anomaly.frames.length} surrounding frames. Floor context: ${context}. Draft the action + briefing.`,
      },
    ],
  });

  const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error(`reason: no JSON in response: ${text.slice(0, 80)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<DraftedReasoning>;
  if (typeof parsed.draftedAction !== "string" || typeof parsed.briefing !== "string") {
    throw new Error("reason: response missing draftedAction/briefing");
  }
  return { draftedAction: parsed.draftedAction, briefing: parsed.briefing };
}
