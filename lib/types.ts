// Shared domain types for Shop Floor Intelligence.
//
// MachineState is the andon-style signal the agent reasons over:
//   running  -> machine actively cycling (green stack light)
//   idle     -> powered but not cycling (amber stack light)
//   stopped  -> faulted / halted (red stack light) — what the agent must catch
export type MachineState = "running" | "idle" | "stopped";

export const MACHINE_STATES: readonly MachineState[] = [
  "running",
  "idle",
  "stopped",
];

// What a single frame can resolve to. "obstructed" means the vision layer cannot
// tell what it is looking at — the lens is blocked/covered/too dark — which must be
// reported as a camera problem, NEVER misread as a machine stoppage.
export type FrameState = MachineState | "obstructed";

export const FRAME_STATES: readonly FrameState[] = [
  ...MACHINE_STATES,
  "obstructed",
];

// A raw frame as it arrives off a camera feed (the ingest input).
export interface RawFrame {
  machineId: string;
  machineName?: string;
  ts: string; // timestamp, parseable by Date
  frameRef: string; // path to the captured image, relative to repo root
  step?: number; // optional ordinal within the feed
  // trueState exists only in fixtures for rendering + ground truth. The agent
  // never reads it — state is recovered from the image by the vision layer.
  trueState?: MachineState;
}

// A normalized record the rest of the pipeline consumes (the ingest output).
export interface ParsedRecord {
  machineId: string;
  machineName: string;
  timestamp: string; // normalized ISO-8601
  epochMs: number;
  frameRef: string;
  step: number;
}

// One classified observation in a machine's timeline.
export interface Observation extends ParsedRecord {
  state: FrameState;
}

export type AnomalyKind = "stoppage" | "feed_obstructed";

// An anomaly the agent caught, with the action + briefing it drafted.
export interface Anomaly {
  machineId: string;
  machineName: string;
  event: AnomalyKind;
  detectedAt: string; // ISO timestamp of the first frame in the run
  durationMin: number; // sustained duration in minutes
  frames: string[]; // frameRefs the agent inspected
  draftedAction: string; // the next step the agent proposes
  briefing: string; // one-line shift-briefing entry
}

// Per-machine supporting context (cycle/utilization rollup).
export interface MachineSummary {
  machineId: string;
  machineName: string;
  latestState: FrameState;
  utilization: number; // fraction of observed window spent running (0..1)
  runningFrames: number;
  totalFrames: number;
  obstructedFrames: number;
  timeline: FrameState[]; // ordered per-frame states, for the sparkline strip
}

// The full agent output the UI renders.
export interface AgentReport {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  anomalies: Anomaly[]; // most-recent first
  machines: MachineSummary[];
  briefing: string[]; // headline briefing lines, anomalies first
  vision?: string; // label of the vision backend that produced this report
  reasoning?: string; // label of who authored the drafted actions (e.g. Claude Opus 4.8)
}
