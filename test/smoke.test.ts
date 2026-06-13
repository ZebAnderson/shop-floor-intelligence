import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSequence } from "../lib/ingest.ts";
import { runAgent } from "../lib/agent.ts";
import { renderAgentReport } from "../lib/view.ts";
import type { AgentReport } from "../lib/types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("dashboard renders the briefing + per-machine state, anomaly first", async () => {
  const report = await runAgent(loadSequence());
  const html = renderAgentReport(report);

  // Every machine's name + live state is surfaced.
  for (const m of report.machines) {
    assert.ok(html.includes(m.machineName), `machine ${m.machineName} should render`);
    assert.ok(
      html.includes(`state ${m.latestState}`),
      `live state for ${m.machineName} should render`,
    );
  }

  // The caught anomaly and its drafted action are surfaced.
  assert.ok(report.anomalies.length > 0, "fixture has a planted stoppage");
  assert.ok(html.includes("STOPPED"), "anomaly headline rendered");
  assert.ok(html.includes("Drafted action"), "drafted action rendered");

  // Utilization summary rendered.
  assert.ok(/Utilization \d+%/.test(html), "utilization summary rendered");

  // Most-recent anomaly appears BEFORE the machine grid.
  const anomalyIdx = html.indexOf("STOPPED");
  const gridIdx = html.indexOf('class="grid"');
  assert.ok(anomalyIdx >= 0 && gridIdx >= 0, "both sections present");
  assert.ok(anomalyIdx < gridIdx, "anomaly should lead the machine grid");
});

test("the committed data/report.json the page imports renders cleanly", () => {
  const file = join(repoRoot, "data", "report.json");
  assert.ok(existsSync(file), "data/report.json must exist (run `npm run report`)");
  const report = JSON.parse(readFileSync(file, "utf8")) as AgentReport;
  const html = renderAgentReport(report);
  assert.ok(report.machines.length === 3, "report covers all 3 machines");
  assert.ok(report.anomalies.length >= 1, "report contains the caught stoppage");
  assert.ok(html.includes(report.machines[0].machineName));
  assert.ok(html.includes("Shop Floor Intelligence"));
});
