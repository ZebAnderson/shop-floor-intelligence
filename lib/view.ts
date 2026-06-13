// Milestone 4 — agent report renderer.
//
// One pure function turns an AgentReport into HTML. The page renders exactly this
// output and the smoke test asserts against it, so there is a single source of
// truth. Layout follows Nielsen/NN-g heuristics: status visibility (KPI strip +
// monitoring pulse), recognition-not-recall (a status legend; never color alone),
// and a clear hierarchy — the caught event + drafted action are the hero; the
// per-machine grid is clearly-secondary supporting context.
import type { AgentReport, FrameState } from "./types.ts";

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

function safeState(s: string): FrameState {
  return s === "running" || s === "idle" || s === "stopped" || s === "obstructed"
    ? s
    : "obstructed";
}

const STATE_LABEL: Record<FrameState, string> = {
  running: "Running",
  idle: "Idle",
  stopped: "Stopped",
  obstructed: "Camera blocked",
};

function eventChip(event: string): string {
  return event === "feed_obstructed"
    ? `<span class="chip chip-block">Camera blocked</span>`
    : `<span class="chip chip-stop">Stoppage</span>`;
}

export function renderAgentReport(report: AgentReport): string {
  const visionLabel = report.vision ?? "local pixel classifier";
  const reasoningLabel =
    report.reasoning && report.reasoning !== "template" ? report.reasoning : null;

  const alertCount = report.anomalies.length;
  const avgUtil = report.machines.length
    ? Math.round(
        (report.machines.reduce((s, m) => s + m.utilization, 0) / report.machines.length) * 100,
      )
    : 0;

  const kpis = `
    <div class="kpis" role="group" aria-label="At a glance">
      <div class="kpi"><span class="kpi-num">${report.machines.length}</span><span class="kpi-lab">machines watched</span></div>
      <div class="kpi ${alertCount ? "alarm" : ""}"><span class="kpi-num">${alertCount}</span><span class="kpi-lab">active alert${alertCount === 1 ? "" : "s"}</span></div>
      <div class="kpi"><span class="kpi-num">${avgUtil}%</span><span class="kpi-lab">avg utilization</span></div>
      <a class="cta" href="/live">▶ Live camera feed</a>
    </div>`;

  const legend = `
    <div class="legend" aria-label="Status legend">
      ${(["running", "idle", "stopped", "obstructed"] as FrameState[])
        .map((s) => `<span class="legend-item"><span class="dot ${s}" aria-hidden="true"></span>${STATE_LABEL[s]}</span>`)
        .join("")}
    </div>`;

  const anomalies = report.anomalies.length
    ? report.anomalies
        .map((a) => {
          const block = a.event === "feed_obstructed";
          return `
      <article class="panel alert ${block ? "alert-block" : "alert-stop"} section" data-machine="${esc(a.machineId)}">
        <div class="alert-head">${eventChip(a.event)}<span class="when"><span class="live-dot ${block ? "obstructed" : "stopped"}" aria-hidden="true"></span>${esc(hhmm(a.detectedAt))} · ${esc(a.machineName)} (${esc(a.machineId)}) · ~${a.durationMin} min</span></div>
        <p class="headline">${esc(a.briefing)}</p>
        <div class="action">
          <span class="label">Drafted action${reasoningLabel ? ` · authored by ${esc(reasoningLabel)}` : ""}</span>
          <p class="prose">${esc(a.draftedAction)}</p>
        </div>
      </article>`;
        })
        .join("")
    : `<div class="panel section"><p class="headline">No active alerts — all monitored machines nominal.</p></div>`;

  const briefing = `
    <section class="section" aria-label="Shift briefing">
      <p class="eyebrow">Shift briefing</p>
      <ul class="briefing">
        ${report.briefing.map((line) => `<li class="prose">${esc(line)}</li>`).join("")}
      </ul>
    </section>`;

  const machines = `
    <section class="section" aria-label="Machines (supporting context)">
      <p class="eyebrow">Supporting context · machines</p>
      <div class="grid">
        ${report.machines
          .map((m) => {
            const state = safeState(m.latestState);
            const pct = Math.round(m.utilization * 100);
            const strip = (m.timeline ?? [])
              .map((t) => `<span class="tick ${safeState(t)}" title="${STATE_LABEL[safeState(t)]}"></span>`)
              .join("");
            return `<div class="machine">
            <div class="name"><span class="dot ${esc(state)}" aria-hidden="true"></span>${esc(m.machineName)} <span class="sub">${esc(m.machineId)}</span></div>
            <div class="state ${esc(state)}">${esc(STATE_LABEL[state])}</div>
            ${strip ? `<div class="strip" aria-label="recent states">${strip}</div>` : ""}
            <div class="util">
              <span class="label">Utilization ${pct}%</span>
              <div class="bar"><span style="width:${pct}%"></span></div>
              <span class="label">${m.runningFrames}/${m.totalFrames} frames running${m.obstructedFrames ? ` · ${m.obstructedFrames} blocked` : ""}</span>
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </section>`;

  return `
    <header class="topbar">
      <h1>Shop Floor Intelligence</h1>
      <span class="sub" role="status" aria-live="polite"><span class="live-dot running" aria-hidden="true"></span>monitoring · vision: ${esc(visionLabel)} · window ${esc(hhmm(report.windowStart))}–${esc(hhmm(report.windowEnd))}</span>
    </header>
    ${kpis}
    ${legend}
    <section class="section" aria-label="Caught by the agent">
      <p class="eyebrow">Caught by the agent</p>
      ${anomalies}
    </section>
    ${briefing}
    ${machines}
    <footer class="foot">Autonomous monitoring agent — frames classified by Claude Opus 4.8 vision, stoppages and blocked cameras caught, actions drafted automatically. Classification is plumbing; the agent loop is the product.</footer>`;
}
