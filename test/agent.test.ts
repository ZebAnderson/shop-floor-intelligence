import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSequence } from "../lib/ingest.ts";
import { runAgent } from "../lib/agent.ts";
import type { AgentReport } from "../lib/types.ts";

// Runs the agent over the committed stoppage fixture sequence using the default
// (offline, pixel-based) vision backend — no API key, deterministic.
async function report(): Promise<AgentReport> {
  return runAgent(loadSequence());
}

test("agent catches the planted M-102 stoppage and drafts an action + briefing", async () => {
  const r = await report();

  // Exactly one sustained stoppage in the fixture timeline, on M-102.
  assert.equal(r.anomalies.length, 1, "expected one caught stoppage");
  const a = r.anomalies[0];
  assert.equal(a.event, "stoppage");
  assert.equal(a.machineId, "M-102");
  assert.equal(a.machineName, "Lathe");
  assert.equal(a.detectedAt, "2026-06-13T08:03:00.000Z");
  assert.ok(a.durationMin > 0, "duration should be positive");
  assert.ok(a.frames.length >= 2, "agent should investigate surrounding frames");
  assert.ok(a.draftedAction.trim().length > 0, "draftedAction must be non-empty");
  assert.ok(/M-102/.test(a.draftedAction), "action should name the machine");
  assert.ok(a.briefing.trim().length > 0, "anomaly briefing must be non-empty");
});

test("agent emits a utilization summary per machine", async () => {
  const r = await report();
  assert.equal(r.machines.length, 3);

  const byId = new Map(r.machines.map((m) => [m.machineId, m]));
  for (const m of r.machines) {
    assert.ok(m.utilization >= 0 && m.utilization <= 1);
    assert.ok(m.totalFrames > 0);
    assert.ok(["running", "idle", "stopped"].includes(m.latestState));
  }
  // M-101 runs the whole window; M-102 stops, so it can't be fully utilized.
  assert.equal(byId.get("M-101")!.utilization, 1);
  assert.ok(byId.get("M-102")!.utilization < 1);
});

test("briefing leads with the anomaly, then the machine rollups", async () => {
  const r = await report();
  assert.ok(Array.isArray(r.briefing) && r.briefing.length > 0);
  assert.ok(/STOPPED/.test(r.briefing[0]), "first briefing line should be the anomaly");
  assert.ok(r.windowStart < r.windowEnd);
});
