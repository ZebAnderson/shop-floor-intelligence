import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../lib/reportCore.ts";
import type { Observation, FrameState } from "../lib/types.ts";

const T0 = Date.parse("2026-06-13T09:00:00Z");

function tl(machineId: string, states: FrameState[]): Observation[] {
  return states.map((state, step) => {
    const epochMs = T0 + step * 60000;
    return {
      machineId,
      machineName: machineId,
      timestamp: new Date(epochMs).toISOString(),
      epochMs,
      frameRef: `f/${machineId}_${step}.png`,
      step,
      state,
    };
  });
}

test("sustained obstruction is a feed_obstructed anomaly, never a stoppage", () => {
  const r = buildReport(
    tl("CAM-1", ["running", "running", "obstructed", "obstructed", "obstructed", "running"]),
  );
  assert.equal(r.anomalies.length, 1);
  assert.equal(r.anomalies[0].event, "feed_obstructed");
  assert.equal(r.anomalies[0].machineId, "CAM-1");
  assert.ok(/camera|obstruct|block/i.test(r.anomalies[0].draftedAction));
  assert.ok(!r.anomalies.some((a) => a.event === "stoppage"), "obstruction must not be a stoppage");

  const m = r.machines[0];
  assert.equal(m.obstructedFrames, 3);
  assert.ok(m.timeline.includes("obstructed"));
  assert.equal(m.latestState, "running");
});

test("a single obstructed blip raises no anomaly (debounced)", () => {
  const r = buildReport(tl("CAM-2", ["running", "obstructed", "running", "running"]));
  assert.equal(r.anomalies.length, 0);
});

test("a stoppage and an obstruction surface as distinct events", () => {
  const r = buildReport([
    ...tl("M-1", ["running", "stopped", "stopped", "running"]),
    ...tl("CAM-9", ["running", "obstructed", "obstructed", "running"]),
  ]);
  const kinds = r.anomalies.map((a) => a.event).sort();
  assert.deepEqual(kinds, ["feed_obstructed", "stoppage"]);
});
