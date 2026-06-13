// Milestone 1 — Data ingest.
//
// Turns a raw camera frame ({ machineId, ts, frameRef }) into a normalized
// ParsedRecord the rest of the pipeline consumes. Pure and synchronous; the
// only side effect is in loadSequence(), which reads the fixture timeline.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { RawFrame, ParsedRecord } from "./types.ts";

export function ingestFrame(raw: RawFrame, index = 0): ParsedRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("ingest: frame must be an object");
  }
  const machineId = String(raw.machineId ?? "").trim();
  if (!machineId) throw new Error("ingest: missing machineId");
  if (machineId.length > 64) {
    throw new Error(`ingest: machineId too long (${machineId.length} > 64 chars)`);
  }

  const frameRef = String(raw.frameRef ?? "").trim();
  if (!frameRef) throw new Error(`ingest: missing frameRef for ${machineId}`);

  const date = new Date(raw.ts);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`ingest: invalid timestamp "${raw.ts}" for ${machineId}`);
  }

  return {
    machineId,
    machineName: String(raw.machineName ?? machineId).trim(),
    timestamp: date.toISOString(),
    epochMs: date.getTime(),
    frameRef,
    step: Number.isInteger(raw.step) && (raw.step as number) >= 0 ? (raw.step as number) : index,
  };
}

// Ingest a batch and return it in temporal order (ties broken by machine id),
// so a single machine's timeline reads chronologically downstream.
export function ingestSequence(frames: RawFrame[]): ParsedRecord[] {
  return frames
    .map((f, i) => ingestFrame(f, i))
    .sort(
      (a, b) => a.epochMs - b.epochMs || a.machineId.localeCompare(b.machineId),
    );
}

function fixturesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
}

// Load + ingest the committed demo timeline (fixtures/sequence.json).
export function loadSequence(path?: string): ParsedRecord[] {
  const file = path ?? join(fixturesDir(), "sequence.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as RawFrame[];
  return ingestSequence(raw);
}

// Load the raw timeline (keeps trueState) for fixture generation + eval ground truth.
export function loadRawSequence(path?: string): RawFrame[] {
  const file = path ?? join(fixturesDir(), "sequence.json");
  return JSON.parse(readFileSync(file, "utf8")) as RawFrame[];
}
