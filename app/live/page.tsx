"use client";

// Live camera feed — the watch -> catch -> draft loop running for real.
// Capture happens in the browser (a Logitech Brio via getUserMedia, or the built-in
// demo machine loop); each sampled frame is classified by Claude Opus 4.8 through
// /api/vision; the reused agent (buildReport) catches a sustained stoppage and drafts
// the action live. Identical code runs locally and on Vercel (getUserMedia works on
// https and on http://localhost).
import { useCallback, useEffect, useRef, useState } from "react";
import { buildReport } from "@/lib/reportCore.ts";
import { renderAgentReport } from "@/lib/view.ts";
import type { MachineState, FrameState, Observation } from "@/lib/types.ts";

const SAMPLE_MS = 2000;
const CAP_W = 480;
const CAP_H = 360;
// Below this luminance variance the frame is near-uniform — lens blocked/covered/dark.
const OBSTRUCT_VAR = 150;

interface Source {
  id: string;
  label: string;
}

const LAMP_ON: Record<MachineState, string> = {
  stopped: "#e62d28",
  idle: "#f0b91e",
  running: "#37d25a",
};
const LAMP_OFF: Record<MachineState, string> = {
  stopped: "#461614",
  idle: "#463c12",
  running: "#144120",
};

// In-browser obstruction check: sample the captured frame's luminance variance.
function isObstructed(ctx: CanvasRenderingContext2D): boolean {
  const { data } = ctx.getImageData(0, 0, CAP_W, CAP_H);
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
  const [sourceId, setSourceId] = useState<string>("demo");
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<FrameState | null>(null);
  const [reportHtml, setReportHtml] = useState<string>("");
  const [logs, setLogs] = useState<{ t: string; state: FrameState; viaClaude: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const demoRef = useRef<HTMLCanvasElement | null>(null);
  const capRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const obsRef = useRef<Observation[]>([]);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const countRef = useRef(0);
  const sourceRef = useRef<string>("demo");

  const usingCamera = sourceId !== "demo";

  const labelFor = useCallback(
    (id: string): string =>
      id === "demo" ? "Demo machine" : cameras.find((c) => c.id === id)?.label ?? "Camera",
    [cameras],
  );

  // ---- demo machine animation (running -> idle -> stopped -> running, 24s loop) ----
  const drawDemo = useCallback(() => {
    const cv = demoRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const t = performance.now() / 1000;
    const s = t % 24;
    const state: MachineState = s < 9 ? "running" : s < 13 ? "idle" : s < 19 ? "stopped" : "running";

    ctx.fillStyle = "#0e1116";
    ctx.fillRect(0, 0, CAP_W, CAP_H);
    ctx.fillStyle = "#11151b";
    ctx.fillRect(0, CAP_H * 0.72, CAP_W, CAP_H * 0.28);

    ctx.fillStyle = "#3a4048";
    ctx.fillRect(150, 150, 230, 150);
    ctx.fillStyle = "#50565f";
    ctx.fillRect(168, 92, 200, 58);

    const moving = state === "running";
    const off = moving ? Math.sin(t * 6) * 54 : 0;
    ctx.fillStyle = "#9aa4b0";
    ctx.fillRect(232 + off, 96, 34, 120);
    if (moving) {
      for (let i = 0; i < 6; i++) {
        const a = (t * 9 + i * 1.7) % 6.28;
        ctx.fillStyle = i % 2 ? "#ffd27a" : "#ff9d3c";
        const r = 8 + i * 5;
        ctx.beginPath();
        ctx.arc(249 + off + Math.cos(a) * r, 210 + Math.abs(Math.sin(a)) * 16, 2.4, 0, 6.28);
        ctx.fill();
      }
    }

    // andon stack light: red (top), amber, green (bottom)
    const lamps: MachineState[] = ["stopped", "idle", "running"];
    lamps.forEach((lamp, i) => {
      const lit = lamp === state;
      ctx.fillStyle = lit ? LAMP_ON[lamp] : LAMP_OFF[lamp];
      ctx.shadowColor = lit ? LAMP_ON[lamp] : "transparent";
      ctx.shadowBlur = lit ? 22 : 0;
      ctx.fillRect(392, 86 + i * 46, 40, 38);
      ctx.shadowBlur = 0;
    });

    ctx.fillStyle = "#8b97a3";
    ctx.font = "600 16px ui-monospace, Menlo, monospace";
    ctx.fillText("DEMO FEED · simulated machine", 16, 28);

    rafRef.current = requestAnimationFrame(drawDemo);
  }, []);

  const record = useCallback(
    (state: FrameState, viaClaude: boolean) => {
      const now = new Date();
      const label = labelFor(sourceRef.current);
      const obs: Observation = {
        machineId: label,
        machineName: label,
        timestamp: now.toISOString(),
        epochMs: now.getTime(),
        frameRef: "",
        step: countRef.current++,
        state,
      };
      obsRef.current = [...obsRef.current, obs];
      setCurrent(state);
      setLogs((l) =>
        [{ t: now.toLocaleTimeString(), state, viaClaude }, ...l].slice(0, 40),
      );
      const rep = buildReport(obsRef.current);
      rep.vision = "Claude Opus 4.8";
      setReportHtml(renderAgentReport(rep));
    },
    [labelFor],
  );

  const sample = useCallback(async () => {
    const cap = capRef.current;
    const ctx = cap?.getContext("2d");
    if (!cap || !ctx) return;

    const camera = sourceRef.current !== "demo";
    if (camera) {
      const v = videoRef.current;
      if (!v || v.readyState < 2) return;
      ctx.drawImage(v, 0, 0, CAP_W, CAP_H);
    } else {
      const d = demoRef.current;
      if (!d) return;
      ctx.drawImage(d, 0, 0, CAP_W, CAP_H);
    }

    // Instant in-browser obstruction check: a near-uniform frame means the lens is
    // blocked, covered, or too dark. Flag it immediately and skip the paid call.
    if (isObstructed(ctx)) {
      setError(null);
      record("obstructed", false);
      return;
    }

    const imageBase64 = cap.toDataURL("image/jpeg", 0.6).split(",")[1];
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: "image/jpeg" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(`Vision error: ${j.error ?? res.status}`);
        return;
      }
      const { state } = (await res.json()) as { state: FrameState };
      setError(null);
      record(state, true);
    } catch {
      setError("Network error contacting /api/vision.");
    }
  }, [record]);

  async function enableCameras() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      setCameras(cams);
      if (cams[0]) setSourceId(cams[0].id);
    } catch {
      setError("Camera permission denied or no camera available.");
    }
  }

  const stop = useCallback(() => {
    setRunning(false);
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
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
    countRef.current = 0;
    setLogs([]);
    setCurrent(null);
    setReportHtml("");
    sourceRef.current = sourceId;
    try {
      if (usingCamera) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: sourceId } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } else {
        rafRef.current = requestAnimationFrame(drawDemo);
      }
      setRunning(true);
      timerRef.current = window.setInterval(sample, SAMPLE_MS);
      window.setTimeout(sample, 700);
    } catch {
      setError("Could not start the selected source.");
    }
  }

  useEffect(() => stop, [stop]);

  return (
    <main className="wrap">
      <div className="topbar">
        <h1>Live Feed</h1>
        <span className="sub">
          <span className="live-dot running" /> browser capture → Claude Opus 4.8 → agent
        </span>
      </div>
      <div className="cta-row">
        <a className="cta secondary" href="/">
          ← Back to agent report
        </a>
      </div>

      <div className="controls">
        <select
          aria-label="Camera source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          disabled={running}
        >
          <option value="demo">Demo machine loop (simulated)</option>
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {cameras.length === 0 && (
          <button onClick={enableCameras} disabled={running}>
            Enable cameras
          </button>
        )}
        {running ? (
          <button onClick={stop}>Stop</button>
        ) : (
          <button className="primary" onClick={start}>
            ▶ Start monitoring
          </button>
        )}
        {current && (
          <span className={`state ${current}`}>
            now: {current}
          </span>
        )}
      </div>
      {error && <p className="err">{error}</p>}

      <div className="live-layout">
        <div>
          <div className="feed">
            <video ref={videoRef} muted playsInline style={{ display: usingCamera ? "block" : "none" }} />
            <canvas
              ref={demoRef}
              width={CAP_W}
              height={CAP_H}
              style={{ display: usingCamera ? "none" : "block" }}
            />
            {current && <div className={`verdict state ${current}`}>{current}</div>}
          </div>
          <p className="note">
            Capture is in your browser; only the sampled frame is sent to{" "}
            <code>/api/vision</code> (Claude Opus 4.8). Point a Logitech Brio at a real
            machine — or at <a href="/loop.html" target="_blank" rel="noreferrer">/loop.html</a>{" "}
            on a second screen — or just use the built-in demo loop. A sustained{" "}
            <b>stopped</b> read (≥2 samples) is caught as a stoppage and an action is
            drafted. <b>Cover the lens</b> and the agent flags the feed as{" "}
            <b>obstructed</b> — skipping the paid call when the view is unusable.
          </p>
          <ul className="classlog" aria-label="Classification log">
            {logs.map((l, i) => (
              <li key={i}>
                {l.t} — <span className={`s state ${l.state}`}>{l.state}</span>{" "}
                <span className="sub">
                  {l.viaClaude ? "· Claude Opus 4.8" : "· obstruction check"}
                </span>
              </li>
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
                Start monitoring to watch the agent classify each frame and catch a
                stoppage live.
              </p>
            </div>
          )}
        </div>
      </div>

      <canvas ref={capRef} width={CAP_W} height={CAP_H} style={{ display: "none" }} />
    </main>
  );
}
