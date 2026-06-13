// The agent report. Server component, statically prerendered at build time from the
// precomputed report (data/report.json) — so the deployed URL responds with the
// watch -> catch -> draft result with no runtime fs and no API key. The live camera
// feed (real Claude Opus 4.8 vision) lives at /live.
import report from "@/data/report.json";
import { renderAgentReport } from "@/lib/view.ts";
import type { AgentReport } from "@/lib/types.ts";

export default function Page() {
  const html = renderAgentReport(report as unknown as AgentReport);
  return <main className="wrap" dangerouslySetInnerHTML={{ __html: html }} />;
}
