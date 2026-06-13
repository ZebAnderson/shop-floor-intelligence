// Milestone 3 — the agent loop (this is the product).
//
// Watches each machine's frame timeline, recovers state via the vision layer
// (never the fixture labels), CATCHES a sustained stoppage, investigates the
// surrounding frames, and DRAFTS an action + a shift-briefing line. The pure
// reasoning lives in lib/reportCore.ts (reused by the live page); this module
// adds the vision step. Classification is plumbing; this watch -> catch -> draft
// loop is what the demo leads on.
import { classifyFrame } from "./vision.ts";
import { buildReport } from "./reportCore.ts";
import type {
  ParsedRecord,
  Observation,
  FrameState,
  AgentReport,
} from "./types.ts";

export { buildReport };

export type Classifier = (frameRef: string) => Promise<FrameState>;

const defaultClassifier: Classifier = (frameRef) => classifyFrame(frameRef);

// Classify every frame into an observation, preserving its parsed metadata.
export async function observe(
  records: ParsedRecord[],
  classify: Classifier = defaultClassifier,
): Promise<Observation[]> {
  const out: Observation[] = [];
  for (const rec of records) {
    out.push({ ...rec, state: await classify(rec.frameRef) });
  }
  return out;
}

// Run the full agent over an ingested timeline and produce the report the UI renders.
export async function runAgent(
  records: ParsedRecord[],
  classify: Classifier = defaultClassifier,
): Promise<AgentReport> {
  return buildReport(await observe(records, classify));
}
