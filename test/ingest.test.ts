import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ingestFrame,
  ingestSequence,
  loadSequence,
} from "../lib/ingest.ts";

test("ingestFrame returns a parsed record with the expected shape", () => {
  const rec = ingestFrame({
    machineId: "M-102",
    machineName: "Lathe",
    ts: "2026-06-13T08:03:00Z",
    frameRef: "fixtures/frames/M-102_03.png",
    step: 3,
  });
  assert.equal(rec.machineId, "M-102");
  assert.equal(rec.machineName, "Lathe");
  assert.equal(rec.frameRef, "fixtures/frames/M-102_03.png");
  assert.equal(rec.timestamp, "2026-06-13T08:03:00.000Z");
  assert.equal(typeof rec.epochMs, "number");
  assert.ok(rec.epochMs > 0);
  assert.equal(rec.step, 3);
});

test("machineName defaults to machineId when absent", () => {
  const rec = ingestFrame({
    machineId: "M-1",
    ts: "2026-06-13T08:00:00Z",
    frameRef: "a.png",
  });
  assert.equal(rec.machineName, "M-1");
});

test("ingestFrame rejects invalid input", () => {
  assert.throws(
    () => ingestFrame({ machineId: "", ts: "2026-01-01T00:00:00Z", frameRef: "a.png" }),
    /machineId/,
  );
  assert.throws(
    () => ingestFrame({ machineId: "M", ts: "not-a-date", frameRef: "a.png" }),
    /timestamp/,
  );
  assert.throws(
    () => ingestFrame({ machineId: "M", ts: "2026-01-01T00:00:00Z", frameRef: "" }),
    /frameRef/,
  );
});

test("loadSequence ingests the committed fixture timeline in order", () => {
  const recs = loadSequence();
  assert.ok(recs.length >= 24, `expected >= 24 frames, got ${recs.length}`);
  for (const r of recs) {
    assert.ok(r.machineId.length > 0);
    assert.ok(r.frameRef.length > 0);
    assert.ok(r.timestamp.endsWith("Z"));
    assert.ok(Number.isFinite(r.epochMs));
  }
  for (let i = 1; i < recs.length; i++) {
    assert.ok(recs[i].epochMs >= recs[i - 1].epochMs, "frames must be in temporal order");
  }
});

test("ingestSequence is pure and sorts a shuffled batch", () => {
  const out = ingestSequence([
    { machineId: "B", ts: "2026-06-13T08:05:00Z", frameRef: "b.png" },
    { machineId: "A", ts: "2026-06-13T08:01:00Z", frameRef: "a.png" },
  ]);
  assert.equal(out[0].machineId, "A");
  assert.equal(out[1].machineId, "B");
});
