// Precomputes the agent report to data/report.json so the deployed page renders it
// statically — no runtime fs, no API key needed for the page to load.
//
//   npm run report          local pixel vision + template action drafting (offline)
//   npm run report:claude   real Claude Opus 4.8 vision + Claude-authored action/briefing
//
// Re-run after changing fixtures/sequence.json.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSequence } from "../lib/ingest.ts";
import { runAgent } from "../lib/agent.ts";
import { currentBackend } from "../lib/vision.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const report = await runAgent(loadSequence());
const backend = currentBackend();
report.vision = backend === "claude" ? "Claude Opus 4.8" : "local pixel classifier";
report.reasoning = "template";

// When a key is present, let Claude Opus 4.8 author the drafted action + briefing so
// the on-screen response is visibly model-made, not a fixed string.
if (process.env.ANTHROPIC_API_KEY && process.env.AGENT_REASONING !== "off") {
  const { draftAnomalyReasoning } = await import("../lib/reason.ts");
  let ok = 0;
  for (const anomaly of report.anomalies) {
    try {
      const drafted = await draftAnomalyReasoning(anomaly, report.machines);
      anomaly.draftedAction = drafted.draftedAction;
      anomaly.briefing = drafted.briefing;
      ok++;
    } catch (err) {
      console.warn(`reasoning failed for ${anomaly.machineId}, keeping template:`, err instanceof Error ? err.message : err);
    }
  }
  if (ok > 0) {
    report.reasoning = "Claude Opus 4.8";
    // Rebuild the briefing list so the Claude-authored lines lead.
    report.briefing = [
      ...report.anomalies.map((a) => a.briefing),
      ...report.machines.map(
        (s) => `${s.machineName} (${s.machineId}): ${s.latestState}, ${(s.utilization * 100).toFixed(0)}% utilization (${s.runningFrames}/${s.totalFrames} frames).`,
      ),
    ];
  }
}

mkdirSync(join(repoRoot, "data"), { recursive: true });
writeFileSync(join(repoRoot, "data", "report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(
  `Wrote data/report.json — vision=${report.vision}, reasoning=${report.reasoning}, ${report.anomalies.length} anomaly(ies), ${report.machines.length} machines.`,
);
