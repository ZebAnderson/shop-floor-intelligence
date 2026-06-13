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
  const totalFramesAll = report.machines.reduce((s, m) => s + m.totalFrames, 0);
  const stoppedAll = report.machines.reduce((s, m) => s + m.stoppedFrames, 0);
  const fleetAvail = totalFramesAll ? Math.round((1 - stoppedAll / totalFramesAll) * 100) : 100;

  const kpis = `
    <div class="kpis" role="group" aria-label="At a glance">
      <div class="kpi"><span class="kpi-num">${report.machines.length}</span><span class="kpi-lab">machines watched</span></div>
      <div class="kpi ${alertCount ? "alarm" : ""}"><span class="kpi-num">${alertCount}</span><span class="kpi-lab">active alert${alertCount === 1 ? "" : "s"}</span></div>
      <div class="kpi"><span class="kpi-num">${avgUtil}%</span><span class="kpi-lab">avg utilization</span></div>
      <div class="kpi"><span class="kpi-num">${fleetAvail}%</span><span class="kpi-lab">availability <span class="hint">obs.</span></span></div>
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
          const film = a.frames
            .map((f) => f.split("/").pop() ?? "")
            .filter((n) => n.length > 0)
            .map(
              (n, idx) =>
                `<img class="frame" src="/frames/${esc(n)}" alt="investigated frame ${idx + 1}" loading="lazy" />`,
            )
            .join("");
          const filmstrip = film
            ? `<div class="filmstrip" aria-label="Frames the agent investigated">${film}<span class="film-cap">last clear view → caught</span></div>`
            : "";
          return `
      <article class="panel alert ${block ? "alert-block" : "alert-stop"} section" data-machine="${esc(a.machineId)}">
        <div class="alert-head">${eventChip(a.event)}${a.ongoing ? `<span class="chip chip-ongoing">Ongoing</span>` : ""}<span class="when"><span class="live-dot ${block ? "obstructed" : "stopped"}" aria-hidden="true"></span>${esc(hhmm(a.detectedAt))} · ${esc(a.machineName)} (${esc(a.machineId)}) · ~${esc(a.durationLabel ?? `${Math.max(1, Math.round(a.durationMin))} min`)} down</span></div>
        <p class="headline">${esc(a.briefing)}</p>
        ${filmstrip}
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
            const total = m.totalFrames || 1;
            const seg = (n: number) => `${(n / total) * 100}%`;
            return `<div class="machine">
            <div class="name"><span class="dot ${esc(state)}" aria-hidden="true"></span>${esc(m.machineName)} <span class="sub">${esc(m.machineId)}</span></div>
            <div class="state ${esc(state)}">${esc(STATE_LABEL[state])}</div>
            ${strip ? `<div class="strip" aria-label="recent states">${strip}</div>` : ""}
            <div class="util">
              <span class="label">${pct}% running · ${Math.round(m.availability * 100)}% available <span class="hint">obs.</span></span>
              <div class="bar stacked" role="img" aria-label="${m.runningFrames} running, ${m.idleFrames} idle, ${m.stoppedFrames} stopped, ${m.obstructedFrames} blocked of ${m.totalFrames} frames">
                <span class="seg running" style="width:${seg(m.runningFrames)}"></span>
                <span class="seg idle" style="width:${seg(m.idleFrames)}"></span>
                <span class="seg stopped" style="width:${seg(m.stoppedFrames)}"></span>
                <span class="seg obstructed" style="width:${seg(m.obstructedFrames)}"></span>
              </div>
              <span class="label">${m.runningFrames}/${m.totalFrames} running${m.stoppedFrames ? ` · ${m.stoppedFrames} stopped` : ""}${m.obstructedFrames ? ` · ${m.obstructedFrames} blocked` : ""}</span>
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
    ${legend}
    ${kpis}
    <section class="section" aria-label="Caught by the agent">
      <p class="eyebrow">Caught by the agent</p>
      ${anomalies}
    </section>
    ${briefing}
    ${machines}
    <footer class="foot">Autonomous monitoring agent — frames classified by Claude Opus 4.8 vision, stoppages and blocked cameras caught, actions drafted automatically. Classification is plumbing; the agent loop is the product.</footer>`;
}
