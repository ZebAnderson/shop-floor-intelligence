// Milestone 3 — the agent loop (this is the product).
//
// Watches each machine's frame timeline, recovers state via the vision layer
// (never the fixture labels), CATCHES a sustained stoppage, investigates the
// surrounding frames, and DRAFTS an action + a shift-briefing line. Cycle /
// utilization rollups ride along as supporting context. Classification is
// plumbing; this watch -> catch -> draft loop is what the demo leads on.
import { classifyFrame } from "./vision.ts";
import type {
  ParsedRecord,
  Observation,
  MachineState,
  Anomaly,
  MachineSummary,
  AgentReport,
} from "./types.ts";

// A stoppage must persist across at least this many consecutive frames before
// the agent raises it — one blip is noise, a sustained red is a real stop.
const STOPPAGE_MIN_FRAMES = 2;

export type Classifier = (frameRef: string) => Promise<MachineState>;

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

function groupByMachine(obs: Observation[]): Map<string, Observation[]> {
  const map = new Map<string, Observation[]>();
  for (const o of obs) {
    const arr = map.get(o.machineId) ?? [];
    arr.push(o);
    map.set(o.machineId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.epochMs - b.epochMs);
  return map;
}

function hhmm(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

// Scan one machine's timeline for sustained stoppages.
function detectStoppages(timeline: Observation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  let i = 0;
  while (i < timeline.length) {
    if (timeline[i].state !== "stopped") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < timeline.length && timeline[j + 1].state === "stopped") j++;

    const runLength = j - i + 1;
    if (runLength >= STOPPAGE_MIN_FRAMES) {
      const first = timeline[i];
      const last = timeline[j];
      const spanMin = Math.round((last.epochMs - first.epochMs) / 60000);
      const intervalMin =
        i > 0
          ? Math.max(1, Math.round((first.epochMs - timeline[i - 1].epochMs) / 60000))
          : 1;
      const durationMin = spanMin + intervalMin;
      const when = hhmm(first.timestamp);
      // Investigate: the last-known-good frame plus every stopped frame.
      const priorFrame = i > 0 ? [timeline[i - 1].frameRef] : [];
      const frames = [...priorFrame, ...timeline.slice(i, j + 1).map((o) => o.frameRef)];

      anomalies.push({
        machineId: first.machineId,
        machineName: first.machineName,
        event: "stoppage",
        detectedAt: first.timestamp,
        durationMin,
        frames,
        draftedAction: `Dispatch the cell lead to ${first.machineName} (${first.machineId}); it has been stopped ~${durationMin} min since ${when}. Confirm planned tool change vs. fault, clear the stop, and log the downtime reason.`,
        briefing: `${first.machineName} (${first.machineId}) STOPPED ~${durationMin} min from ${when} — action drafted.`,
      });
    }
    i = j + 1;
  }
  return anomalies;
}

function summarize(timeline: Observation[]): MachineSummary {
  const totalFrames = timeline.length;
  const runningFrames = timeline.filter((o) => o.state === "running").length;
  const latest = timeline[timeline.length - 1];
  return {
    machineId: latest.machineId,
    machineName: latest.machineName,
    latestState: latest.state,
    utilization: totalFrames > 0 ? runningFrames / totalFrames : 0,
    runningFrames,
    totalFrames,
  };
}

// Run the full agent over an ingested timeline and produce the report the UI renders.
export async function runAgent(
  records: ParsedRecord[],
  classify: Classifier = defaultClassifier,
): Promise<AgentReport> {
  const observations = await observe(records, classify);
  const machines = groupByMachine(observations);

  const anomalies: Anomaly[] = [];
  const summaries: MachineSummary[] = [];
  for (const machineId of [...machines.keys()].sort()) {
    const timeline = machines.get(machineId)!;
    anomalies.push(...detectStoppages(timeline));
    summaries.push(summarize(timeline));
  }

  // Most-recent anomaly first.
  anomalies.sort(
    (a, b) =>
      b.detectedAt.localeCompare(a.detectedAt) ||
      a.machineId.localeCompare(b.machineId),
  );

  const epochs = observations.map((o) => o.epochMs);
  const briefing = [
    ...anomalies.map((a) => a.briefing),
    ...summaries.map(
      (s) =>
        `${s.machineName} (${s.machineId}): ${s.latestState}, ${(s.utilization * 100).toFixed(0)}% utilization (${s.runningFrames}/${s.totalFrames} frames).`,
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    windowStart: new Date(Math.min(...epochs)).toISOString(),
    windowEnd: new Date(Math.max(...epochs)).toISOString(),
    anomalies,
    machines: summaries,
    briefing,
  };
}
