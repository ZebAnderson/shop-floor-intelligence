import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRegion, normalizeMachines } from "../lib/machineConfig.ts";

test("clampRegion keeps boxes inside the frame with positive size", () => {
  const r = clampRegion({ x: -0.2, y: 0.5, w: 2, h: 0.9 });
  assert.equal(r.x, 0);
  assert.ok(r.y >= 0 && r.y <= 1);
  assert.ok(r.w > 0 && r.x + r.w <= 1.0001);
  assert.ok(r.h > 0 && r.y + r.h <= 1.0001);

  const tiny = clampRegion({ x: 0.5, y: 0.5, w: 0, h: 0 });
  assert.ok(tiny.w >= 0.02 && tiny.h >= 0.02, "degenerate boxes get a minimum size");
});

test("normalizeMachines validates, clamps, and de-duplicates ids", () => {
  const out = normalizeMachines([
    { name: "Lathe 1", kind: "lathe", region: { x: 0.05, y: 0.3, w: 0.25, h: 0.5 }, note: "left" },
    { name: "Lathe 1", kind: "lathe", region: { x: 9, y: 9, w: 9, h: 9 } }, // dup name, bad region
    { name: "", region: {} }, // missing fields
    "garbage",
  ]);
  assert.equal(out.length, 3, "non-object entries are dropped");
  const ids = out.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const m of out) {
    assert.ok(m.name.length > 0 && m.kind.length > 0);
    assert.ok(m.region.x >= 0 && m.region.x <= 1);
    assert.ok(m.region.w > 0 && m.region.x + m.region.w <= 1.0001);
  }
});

test("normalizeMachines tolerates non-array input", () => {
  assert.deepEqual(normalizeMachines(null), []);
  assert.deepEqual(normalizeMachines({}), []);
});
