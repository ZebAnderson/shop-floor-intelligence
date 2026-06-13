// Milestone 4 — agent report renderer.
//
// One pure function turns an AgentReport into HTML. The page renders exactly this
// output and the smoke test asserts against it, so there is a single source of
// truth. Agent-first: the caught stoppage + the drafted action are the hero; the
// per-machine utilization grid is clearly-secondary supporting context.
import type { AgentReport, MachineState } from "./types.ts";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

function hhmm(iso: string): string {
  return `${iso.slice(11, 16)} UTC`;
}

// Constrain a JSON-sourced state to the known union before it reaches a class attr.
function safeState(s: string): MachineState {
  return s === "running" || s === "idle" || s === "stopped" ? s : "idle";
}

export function renderAgentReport(report: AgentReport): string {
  const visionLabel = report.vision ?? "local pixel classifier";
  const reasoningLabel = report.reasoning && report.reasoning !== "template" ? report.reasoning : null;

  const anomalies = report.anomalies.length
    ? report.anomalies
        .map(
          (a) => `
      <div class="panel alert section" data-machine="${esc(a.machineId)}">
        <p class="label">Caught by the agent · ${esc(a.event)}</p>
        <p class="when"><span class="live-dot stopped"></span>${esc(hhmm(a.detectedAt))} · ${esc(a.machineName)} (${esc(a.machineId)}) · ~${a.durationMin} min down</p>
        <p class="headline">${esc(a.briefing)}</p>
        <div class="action">
          <span class="label">Drafted action${reasoningLabel ? ` · authored by ${esc(reasoningLabel)}` : ""}</span>
          <p>${esc(a.draftedAction)}</p>
        </div>
      </div>`,
        )
        .join("")
    : `<div class="panel section"><p class="headline">No active anomalies — all monitored machines nominal.</p></div>`;

  const briefing = `
    <div class="section">
      <p class="eyebrow">Shift briefing</p>
      <ul class="briefing">
        ${report.briefing.map((line) => `<li>${esc(line)}</li>`).join("")}
      </ul>
    </div>`;

  const machines = `
    <div class="section">
      <p class="eyebrow">Supporting context · machines</p>
      <div class="grid">
        ${report.machines
          .map((m) => {
            const state = safeState(m.latestState);
            const pct = Math.round(m.utilization * 100);
            return `<div class="machine">
            <div class="name"><span class="dot ${esc(state)}"></span>${esc(m.machineName)} <span class="sub">${esc(m.machineId)}</span></div>
            <div class="state ${esc(state)}">${esc(state)}</div>
            <div class="util">
              <span class="label">Utilization ${pct}%</span>
              <div class="bar"><span style="width:${pct}%"></span></div>
              <span class="label">${m.runningFrames}/${m.totalFrames} frames running</span>
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;

  return `
    <div class="topbar">
      <h1>Shop Floor Intelligence</h1>
      <span class="sub"><span class="live-dot running"></span>monitoring · vision: ${esc(visionLabel)} · window ${esc(hhmm(report.windowStart))}–${esc(hhmm(report.windowEnd))}</span>
    </div>
    <div class="cta-row">
      <a class="cta" href="/live">▶ Open live camera feed — Logitech Brio or demo loop</a>
    </div>
    <p class="eyebrow">Caught by the agent</p>
    ${anomalies}
    ${briefing}
    ${machines}`;
}
