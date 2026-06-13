// Pure agent reasoning — no fs, no vision imports — so it is safe to reuse in the
// browser (the /live page) as well as on the server (lib/agent.ts, scripts/report.ts).
// Given classified observations, it catches sustained stoppages, investigates the
// surrounding frames, drafts an action + briefing, and rolls up utilization.
import type {
  Observation,
  Anomaly,
  MachineSummary,
  AgentReport,
} from "./types.ts";

// A stoppage must persist across at least this many consecutive frames before the
// agent raises it — one blip is noise, a sustained red is a real stop.
export const STOPPAGE_MIN_FRAMES = 2;

function hhmm(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

function groupByMachine(obs: Observation[]): Map<string, Observation[]> {
  const map = new Map<string, Observation[]>();
  for (const o of obs) {
    const arr = map.get(o.machineId) ?? [];
    arr.push(o);
    map.set(o.machineId, arr);
  }
  // Stable order: time, then step, then frameRef — so equal timestamps are deterministic.
  for (const arr of map.values()) {
    arr.sort(
      (a, b) =>
        a.epochMs - b.epochMs ||
        a.step - b.step ||
        a.frameRef.localeCompare(b.frameRef),
    );
  }
  return map;
}

// Typical sampling cadence (ms) for a machine's feed — the median consecutive gap.
function cadenceMs(timeline: Observation[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const g = timeline[i].epochMs - timeline[i - 1].epochMs;
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return 60000;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return Math.max(500, Math.round(median));
}

// Human duration from real elapsed time, so a 6-second live stop reads "6s" (not "3 min")
// and a multi-minute fixture stop reads "3 min".
function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function detectStoppages(timeline: Observation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const intervalMs = cadenceMs(timeline);
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
      const ongoing = j === timeline.length - 1; // still down at the latest frame
      // Real elapsed downtime from timestamps (+ one sampling interval), not floored to minutes.
      const durationMs = timeline[j].epochMs - first.epochMs + intervalMs;
      const durationMin = durationMs / 60000;
      const durationLabel = formatDuration(durationMs);
      const when = hhmm(first.timestamp);

      // Last-known-good = scan back for the most recent *running* frame.
      let goodIdx = i - 1;
      while (goodIdx >= 0 && timeline[goodIdx].state !== "running") goodIdx--;
      const investigated = (goodIdx >= 0 ? [timeline[goodIdx].frameRef] : [])
        .concat(timeline.slice(i, j + 1).map((o) => o.frameRef))
        .filter((f) => f.length > 0);

      anomalies.push({
        machineId: first.machineId,
        machineName: first.machineName,
        event: "stoppage",
        detectedAt: first.timestamp,
        durationMin,
        durationLabel,
        ongoing,
        frames: investigated,
        draftedAction: `Dispatch the cell lead to ${first.machineName} (${first.machineId}); stopped ~${durationLabel}${ongoing ? " and still down" : ""} since ${when}. Confirm planned tool change vs. fault, clear the stop, and log the downtime reason.`,
        briefing: `${first.machineName} (${first.machineId}) STOPPED ~${durationLabel} from ${when}${ongoing ? " (ongoing)" : ""} — action drafted.`,
      });
    }
    i = j + 1;
  }
  return anomalies;
}

// A sustained obstruction (lens blocked/covered/dark) — reported as a CAMERA problem,
// never as a machine stoppage. The "investigated" frames bracket the last clear view.
function detectObstructions(timeline: Observation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const intervalMs = cadenceMs(timeline);
  let i = 0;
  while (i < timeline.length) {
    if (timeline[i].state !== "obstructed") {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < timeline.length && timeline[j + 1].state === "obstructed") j++;

    const runLength = j - i + 1;
    if (runLength >= STOPPAGE_MIN_FRAMES) {
      const first = timeline[i];
      const ongoing = j === timeline.length - 1;
      const durationMs = timeline[j].epochMs - first.epochMs + intervalMs;
      const durationMin = durationMs / 60000;
      const durationLabel = formatDuration(durationMs);
      const when = hhmm(first.timestamp);
      let clearIdx = i - 1;
      while (clearIdx >= 0 && timeline[clearIdx].state === "obstructed") clearIdx--;
      const investigated = (clearIdx >= 0 ? [timeline[clearIdx].frameRef] : [])
        .concat(timeline.slice(i, j + 1).map((o) => o.frameRef))
        .filter((f) => f.length > 0);

      anomalies.push({
        machineId: first.machineId,
        machineName: first.machineName,
        event: "feed_obstructed",
        detectedAt: first.timestamp,
        durationMin,
        durationLabel,
        ongoing,
        frames: investigated,
        draftedAction: `Check the camera on ${first.machineName} (${first.machineId}); its view has been obstructed ~${durationLabel}${ongoing ? " and is still blocked" : ""} since ${when} (lens blocked or covered, knocked out of position, or too dark to read). Clear the obstruction or reposition the camera — machine state is unknown while the feed is blocked.`,
        briefing: `${first.machineName} (${first.machineId}) CAMERA BLOCKED ~${durationLabel} from ${when}${ongoing ? " (ongoing)" : ""} — feed obstructed, check the camera.`,
      });
    }
    i = j + 1;
  }
  return anomalies;
}

function summarize(timeline: Observation[]): MachineSummary {
  const totalFrames = timeline.length;
  const count = (s: string) => timeline.filter((o) => o.state === s).length;
  const runningFrames = count("running");
  const idleFrames = count("idle");
  const stoppedFrames = count("stopped");
  const obstructedFrames = count("obstructed");
  const latest = timeline[timeline.length - 1];
  return {
    machineId: latest.machineId,
    machineName: latest.machineName,
    latestState: latest.state,
    utilization: totalFrames > 0 ? runningFrames / totalFrames : 0,
    // Observed-window availability: share of observed time NOT stopped. Honest proxy,
    // not OEE-grade (no scheduled-production calendar to separate planned-off time).
    availability: totalFrames > 0 ? 1 - stoppedFrames / totalFrames : 1,
    runningFrames,
    idleFrames,
    stoppedFrames,
    obstructedFrames,
    totalFrames,
    timeline: timeline.map((o) => o.state),
  };
}

// Build the full agent report from already-classified observations. Pure.
export function buildReport(observations: Observation[]): AgentReport {
  const machines = groupByMachine(observations);

  const anomalies: Anomaly[] = [];
  const summaries: MachineSummary[] = [];
  for (const machineId of [...machines.keys()].sort()) {
    const timeline = machines.get(machineId)!;
    anomalies.push(...detectStoppages(timeline), ...detectObstructions(timeline));
    summaries.push(summarize(timeline));
  }

  // Rank by consequence, not just recency (ISA-18.2 alarm prioritization):
  // still-ongoing first, then longer downtime, with obstruction (machine state
  // unknown) nudged up; most-recent detection breaks ties.
  const score = (a: Anomaly) =>
    (a.ongoing ? 1000 : 0) + a.durationMin + (a.event === "feed_obstructed" ? 50 : 0);
  anomalies.sort(
    (a, b) => score(b) - score(a) || b.detectedAt.localeCompare(a.detectedAt),
  );

  const briefing = [
    ...anomalies.map((a) => a.briefing),
    ...summaries.map(
      (s) =>
        `${s.machineName} (${s.machineId}): ${s.latestState}, ${(s.utilization * 100).toFixed(0)}% utilization (${s.runningFrames}/${s.totalFrames} frames).`,
    ),
  ];

  const epochs = observations.map((o) => o.epochMs);
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    windowStart: epochs.length ? new Date(Math.min(...epochs)).toISOString() : now,
    windowEnd: epochs.length ? new Date(Math.max(...epochs)).toISOString() : now,
    anomalies,
    machines: summaries,
    briefing,
  };
}
