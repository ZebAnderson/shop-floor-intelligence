"use client";

// Live camera feed — the watch -> catch -> draft loop running for real.
// Capture happens in the browser (a Logitech Brio via getUserMedia, a screen/window
// share via getDisplayMedia, or the built-in demo floor). If a floor config exists
// (set up at /setup), each sweep crops every labeled region and classifies it
// separately via Claude Opus 4.8, so the agent reports per NAMED machine; otherwise it
// classifies the whole frame as one source. The agent (buildReport) catches a sustained
// stoppage or obstruction per machine and drafts the action live.
import { useCallback, useEffect, useRef, useState } from "react";
import { buildReport } from "@/lib/reportCore.ts";
import { renderAgentReport } from "@/lib/view.ts";
import { drawDemoFloor } from "@/lib/demoFloor.ts";
import { loadConfig, type FloorConfig } from "@/lib/machineConfig.ts";
import type { FrameState, Observation } from "@/lib/types.ts";

const SAMPLE_MS = 2000;
const CAP_W = 640;
const CAP_H = 480;
const RC_W = 320; // per-region crop size sent for classification
const RC_H = 240;
const OBSTRUCT_VAR = 150;

interface Source {
  id: string;
  label: string;
}
interface Target {
  id: string;
  name: string;
  region: { x: number; y: number; w: number; h: number };
}

const SEVERITY: Record<FrameState, number> = { stopped: 3, obstructed: 2, idle: 1, running: 0 };
function worst(states: FrameState[]): FrameState | null {
  return states.length ? states.reduce((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a)) : null;
}

// In-browser obstruction check over a canvas context of the given size.
function isObstructed(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += lum;
    sumSq += lum * lum;
    n++;
  }
  if (n === 0) return true;
  const mean = sum / n;
  return sumSq / n - mean * mean < OBSTRUCT_VAR;
}

export default function LivePage() {
  const [cameras, setCameras] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("demo");
  const [running, setRunning] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [current, setCurrent] = useState<FrameState | null>(null);
  const [caught, setCaught] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string>("");
  const [logs, setLogs] = useState<{ t: string; summary: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<FloorConfig | null>(null);
  const [, setNowTick] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const demoRef = useRef<HTMLCanvasElement | null>(null);
  const capRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const obsRef = useRef<Observation[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hbRef = useRef<number | null>(null);
  const sweepRef = useRef(0);
  const sourceRef = useRef("demo");
  const configRef = useRef<FloorConfig | null>(null);
  const lastSweepRef = useRef(0);
  const prevAnomRef = useRef(0);
  const caughtTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  const usingVideo = sourceId !== "demo";

  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    configRef.current = cfg;
    if (cfg?.sourceLabel === "Demo floor") setSourceId("demo");
  }, []);

  const labelFor = useCallback(
    (id: string) =>
      id === "demo" ? "Demo floor" : id === "screen" ? "Screen share" : cameras.find((c) => c.id === id)?.label ?? "Camera",
    [cameras],
  );

  const drawDemo = useCallback(() => {
    const cv = demoRef.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) drawDemoFloor(ctx, CAP_W, CAP_H, performance.now() / 1000);
    rafRef.current = requestAnimationFrame(drawDemo);
  }, []);

  // Classify one region: crop it from the full frame, obstruction pre-check, else Claude.
  async function classifyRegion(cap: HTMLCanvasElement, t: Target): Promise<{ state: FrameState; viaClaude: boolean } | null> {
    const rc = document.createElement("canvas");
    rc.width = RC_W;
    rc.height = RC_H;
    const rctx = rc.getContext("2d");
    if (!rctx) return null;
    rctx.drawImage(cap, t.region.x * CAP_W, t.region.y * CAP_H, t.region.w * CAP_W, t.region.h * CAP_H, 0, 0, RC_W, RC_H);
    if (isObstructed(rctx, RC_W, RC_H)) return { state: "obstructed", viaClaude: false };
    const imageBase64 = rc.toDataURL("image/jpeg", 0.6).split(",")[1];
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`Vision error: ${j.error ?? res.status}`);
        return null;
      }
      const { state } = (await res.json()) as { state: FrameState };
      return { state, viaClaude: true };
    } catch {
      setError("Network error contacting /api/vision.");
      return null;
    }
  }

  const sweep = useCallback(async () => {
    if (inFlightRef.current) return; // don't overlap slow sweeps
    const cap = capRef.current;
    const ctx = cap?.getContext("2d");
    if (!cap || !ctx) return;
    if (usingVideo) {
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, CAP_W, CAP_H);
    } else {
      const d = demoRef.current;
      if (!d) return;
      ctx.drawImage(d, 0, 0, CAP_W, CAP_H);
    }

    const cfg = configRef.current;
    const targets: Target[] = cfg
      ? cfg.machines.map((m) => ({ id: m.id, name: m.name, region: m.region }))
      : [{ id: labelFor(sourceRef.current), name: labelFor(sourceRef.current), region: { x: 0, y: 0, w: 1, h: 1 } }];

    inFlightRef.current = true;
    setClassifying(true);
    try {
      const results = await Promise.all(targets.map((t) => classifyRegion(cap, t).then((r) => ({ t, r }))));
      const now = new Date();
      const step = sweepRef.current++;
      const states: FrameState[] = [];
      const parts: string[] = [];
      for (const { t, r } of results) {
        if (!r) continue;
        states.push(r.state);
        parts.push(`${t.name}:${r.state}`);
        obsRef.current.push({
          machineId: t.id,
          machineName: t.name,
          timestamp: now.toISOString(),
          epochMs: now.getTime(),
          frameRef: "",
          step,
          state: r.state,
        });
      }
      if (states.length === 0) return;

      lastSweepRef.current = now.getTime();
      setError(null);
      setCurrent(worst(states));
      setLogs((l) => [{ t: now.toLocaleTimeString(), summary: parts.join(" · ") }, ...l].slice(0, 30));

      const rep = buildReport(obsRef.current);
      rep.vision = "Claude Opus 4.8";
      setReportHtml(renderAgentReport(rep));

      if (rep.anomalies.length > prevAnomRef.current) {
        const a = rep.anomalies[0];
        const kind = a.event === "feed_obstructed" ? "Camera obstructed" : "Stoppage caught";
        setCaught(`${kind} on ${a.machineName}`);
        if (caughtTimerRef.current !== null) clearTimeout(caughtTimerRef.current);
        caughtTimerRef.current = window.setTimeout(() => setCaught(null), 6000);
      }
      prevAnomRef.current = rep.anomalies.length;
    } finally {
      inFlightRef.current = false;
      setClassifying(false);
    }
  }, [usingVideo, labelFor]);

  async function enableCameras() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCameras(devs.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
    } catch {
      setError("Camera permission denied or no camera available.");
    }
  }

  const stop = useCallback(() => {
    setRunning(false);
    setClassifying(false);
    inFlightRef.current = false;
    for (const ref of [timerRef, hbRef]) {
      if (ref.current !== null) {
        clearInterval(ref.current);
        ref.current = null;
      }
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  async function start() {
    setError(null);
    obsRef.current = [];
    sweepRef.current = 0;
    prevAnomRef.current = 0;
    lastSweepRef.current = 0;
    inFlightRef.current = false;
    setLogs([]);
    setCurrent(null);
    setCaught(null);
    setReportHtml("");
    sourceRef.current = sourceId;
    try {
      if (sourceId === "demo") {
        rafRef.current = requestAnimationFrame(drawDemo);
      } else {
        const stream =
          sourceId === "screen"
            ? await navigator.mediaDevices.getDisplayMedia({ video: true })
            : await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: sourceId } } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      }
      setRunning(true);
      timerRef.current = window.setInterval(sweep, SAMPLE_MS);
      hbRef.current = window.setInterval(() => setNowTick((t) => t + 1), 500);
      window.setTimeout(sweep, 700);
    } catch {
      setError("Could not start the selected source (permission denied or cancelled).");
    }
  }

  useEffect(() => stop, [stop]);

  let heartbeat = "";
  if (running && lastSweepRef.current) {
    const since = Date.now() - lastSweepRef.current;
    heartbeat = `last sweep ${Math.max(0, Math.round(since / 1000))}s ago · next in ${Math.max(0, Math.ceil((SAMPLE_MS - since) / 1000))}s · ${sweepRef.current} sweeps`;
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <h1>Live Feed</h1>
        <span className="sub" role="status" aria-live="polite">
          <span className="live-dot running" aria-hidden="true" /> browser capture → Claude Opus 4.8 → agent
        </span>
      </div>
      <div className="cta-row">
        <a className="cta secondary" href="/">← Back to report</a>{" "}
        <a className="cta secondary" href="/setup">⚙ Set up machines</a>
      </div>

      {config ? (
        <p className="note">
          Monitoring <b>{config.machines.length}</b> labeled machine{config.machines.length === 1 ? "" : "s"}:{" "}
          {config.machines.map((m) => m.name).join(", ")}. <a href="/setup">Re-configure →</a>
        </p>
      ) : (
        <p className="note">
          No machines set up — the agent will watch the whole frame as one source.{" "}
          <a href="/setup"><b>Set up your floor →</b></a> to label each machine and monitor them by name.
        </p>
      )}

      <div className="controls">
        <select aria-label={running ? "Source (locked while monitoring)" : "Camera source"} value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={running}>
          <option value="demo">Demo floor (3 machines)</option>
          <option value="screen">Screen / window share</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        {cameras.length === 0 && (
          <button onClick={enableCameras} disabled={running} aria-label="Enable cameras">Enable cameras</button>
        )}
        {running ? (
          <button onClick={stop} aria-label="Stop monitoring">Stop</button>
        ) : (
          <button className="primary" onClick={start} aria-label="Start monitoring">▶ Start monitoring</button>
        )}
        {classifying && <span className="sub" role="status">classifying…</span>}
        {current && <span className={`state ${current}`} aria-label={`worst state ${current}`}>worst: {current}</span>}
      </div>
      {heartbeat && <p className="sub" role="status" aria-live="polite">{heartbeat}</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <div aria-live="assertive">{caught && <p className="caught-banner">⚠ {caught} — action drafted</p>}</div>

      <div className="live-layout">
        <div>
          <div className="feed">
            <video ref={videoRef} muted playsInline style={{ display: usingVideo ? "block" : "none" }} />
            <canvas ref={demoRef} width={CAP_W} height={CAP_H} style={{ display: usingVideo ? "none" : "block" }} />
            {current && <div className={`verdict state ${current}`} aria-label={`worst state ${current}`}>{current}</div>}
          </div>
          <p className="note">
            Capture is in your browser; only the sampled frame(s) go to <code>/api/vision</code>{" "}
            (Claude Opus 4.8). Set up the floor at <a href="/setup">/setup</a> to track each machine
            by name. Try the demo floor, a 3D shop feed at{" "}
            <a href="/loop3d.html" target="_blank" rel="noreferrer">/loop3d.html</a>, or a{" "}
            <b>Logitech Brio</b>. <b>Cover the lens</b> and the agent flags the feed obstructed.
          </p>
          <ul className="classlog" aria-label="Sweep log">
            {logs.map((l, i) => (
              <li key={i}>{l.t} — <span className="sub">{l.summary}</span></li>
            ))}
          </ul>
        </div>
        <div>
          {reportHtml ? (
            <div dangerouslySetInnerHTML={{ __html: reportHtml }} />
          ) : (
            <div className="panel">
              <p className="eyebrow">Agent</p>
              <p className="note">
                Start monitoring to watch the agent classify each machine, catch a sustained
                stoppage or a blocked camera, and draft the next action — live.
              </p>
            </div>
          )}
        </div>
      </div>

      <canvas ref={capRef} width={CAP_W} height={CAP_H} style={{ display: "none" }} />
    </main>
  );
}
