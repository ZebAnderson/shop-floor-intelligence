"use client";

// Onboarding — "set up in plain English". Capture a still from the feed, describe the
// machines in natural language (typed or spoken), and Claude Opus 4.8 grounds each named
// machine into a labeled region of the frame. Edit the labels, save (localStorage), then
// go monitor — the agent now knows which region is which machine.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { drawDemoFloor } from "@/lib/demoFloor.ts";
import {
  loadConfig,
  saveConfig,
  clampRegion,
  type MachineRegion,
} from "@/lib/machineConfig.ts";

const CAP_W = 640;
const CAP_H = 480;
const EXAMPLE =
  "The machine on the left is Lathe 1, the one in the middle is a sander, and the blue one on the right is a CNC machine.";

interface Source {
  id: string;
  label: string;
}

// Minimal Web Speech API typing (optional progressive enhancement).
interface SRLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: { length: number; [k: number]: { [k: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

export default function SetupPage() {
  const router = useRouter();
  const [cameras, setCameras] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("demo");
  const [previewing, setPreviewing] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [description, setDescription] = useState(EXAMPLE);
  const [machines, setMachines] = useState<MachineRegion[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [existing, setExisting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const demoRef = useRef<HTMLCanvasElement | null>(null);
  const capRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const srRef = useRef<SRLike | null>(null);

  const usingVideo = sourceId !== "demo";

  const labelFor = useCallback(
    (id: string) =>
      id === "demo" ? "Demo floor" : id === "screen" ? "Screen share" : cameras.find((c) => c.id === id)?.label ?? "Camera",
    [cameras],
  );

  // Load any saved config for editing.
  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      setMachines(cfg.machines);
      setExisting(true);
    }
  }, []);

  const drawDemo = useCallback(() => {
    const cv = demoRef.current;
    const ctx = cv?.getContext("2d");
    if (cv && ctx) drawDemoFloor(ctx, CAP_W, CAP_H, performance.now() / 1000);
    rafRef.current = requestAnimationFrame(drawDemo);
  }, []);

  const stopPreview = useCallback(() => {
    setPreviewing(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  async function enableCameras() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCameras(
        devs.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      );
    } catch {
      setError("Camera permission denied or no camera available.");
    }
  }

  async function startPreview() {
    setError(null);
    setFrame(null);
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
      setPreviewing(true);
    } catch {
      setError("Could not start the selected source.");
    }
  }

  function capture() {
    const cap = capRef.current;
    const ctx = cap?.getContext("2d");
    if (!cap || !ctx) return;
    if (usingVideo && videoRef.current && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, CAP_W, CAP_H);
    } else if (!usingVideo && demoRef.current) {
      ctx.drawImage(demoRef.current, 0, 0, CAP_W, CAP_H);
    } else {
      setError("Start the preview first, then capture a frame.");
      return;
    }
    setFrame(cap.toDataURL("image/jpeg", 0.85));
    stopPreview();
  }

  async function identify() {
    if (!frame) return;
    setIdentifying(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: frame.split(",")[1], description, mediaType: "image/jpeg" }),
      });
      const data = (await res.json().catch(() => ({}))) as { machines?: MachineRegion[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Setup error ${res.status}`);
        return;
      }
      setMachines(data.machines ?? []);
      if (!data.machines || data.machines.length === 0) {
        setError("No machines identified — try a clearer frame or a more specific description.");
      }
    } catch {
      setError("Network error contacting /api/setup.");
    } finally {
      setIdentifying(false);
    }
  }

  function patchMachine(id: string, patch: Partial<MachineRegion>) {
    setMachines((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function removeMachine(id: string) {
    setMachines((ms) => ms.filter((m) => m.id !== id));
  }
  function addMachine() {
    const n = machines.length + 1;
    setMachines((ms) => [
      ...ms,
      { id: `m-${n}-${ms.length}`, name: `Machine ${n}`, kind: "machine", region: clampRegion({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }) },
    ]);
  }

  function toggleVoice() {
    if (listening) {
      srRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SRLike; webkitSpeechRecognition?: new () => SRLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Voice input isn't supported in this browser — type the description instead.");
      return;
    }
    const sr = new Ctor();
    sr.lang = "en-US";
    sr.interimResults = false;
    sr.continuous = false;
    sr.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setDescription((d) => (d === EXAMPLE ? text : `${d} ${text}`).trim());
    };
    sr.onend = () => setListening(false);
    sr.onerror = () => setListening(false);
    srRef.current = sr;
    setListening(true);
    sr.start();
  }

  function save() {
    if (machines.length === 0) {
      setError("Identify or add at least one machine before saving.");
      return;
    }
    saveConfig(machines, labelFor(sourceId));
    router.push("/live");
  }

  useEffect(() => stopPreview, [stopPreview]);

  return (
    <main className="wrap">
      <div className="topbar">
        <h1>Set Up Your Floor</h1>
        <span className="sub">tell the agent which machine is which — in plain English</span>
      </div>
      <div className="cta-row">
        <a className="cta secondary" href="/">← Back to report</a>
      </div>
      {existing && (
        <p className="note">Editing your saved floor ({machines.length} machine{machines.length === 1 ? "" : "s"}). Re-capture and re-identify to redo it, or edit the labels below.</p>
      )}

      <section className="section">
        <p className="eyebrow">1 · Capture a frame</p>
        <div className="controls">
          <select aria-label="Camera source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={previewing}>
            <option value="demo">Demo floor (3 machines)</option>
            <option value="screen">Screen / window share</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {cameras.length === 0 && (
            <button onClick={enableCameras} disabled={previewing} aria-label="Enable cameras">Enable cameras</button>
          )}
          {!previewing ? (
            <button className="primary" onClick={startPreview}>Start preview</button>
          ) : (
            <button onClick={capture}>📸 Capture frame</button>
          )}
        </div>
        <div className="feed setup-feed">
          {!frame && <video ref={videoRef} muted playsInline style={{ display: usingVideo && previewing ? "block" : "none" }} />}
          {!frame && <canvas ref={demoRef} width={CAP_W} height={CAP_H} style={{ display: !usingVideo && previewing ? "block" : "none" }} />}
          {!frame && !previewing && <div className="feed-empty">Start a preview, then capture the frame the agent will watch.</div>}
          {frame && (
            <div className="frame-wrap">
              <img className="frame-img" src={frame} alt="captured floor frame" />
              {machines.map((m) => (
                <div
                  key={m.id}
                  className="mbox"
                  style={{ left: `${m.region.x * 100}%`, top: `${m.region.y * 100}%`, width: `${m.region.w * 100}%`, height: `${m.region.h * 100}%` }}
                >
                  <span className="mbox-label">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <p className="eyebrow">2 · Describe the machines</p>
        <textarea
          className="desc"
          rows={3}
          value={description}
          aria-label="Machine description"
          onChange={(e) => setDescription(e.target.value)}
          placeholder={EXAMPLE}
        />
        <div className="controls">
          <button onClick={toggleVoice} aria-pressed={listening}>{listening ? "● Listening… (stop)" : "🎤 Speak"}</button>
          <button className="primary" onClick={identify} disabled={!frame || identifying}>
            {identifying ? "Identifying…" : "Identify machines"}
          </button>
        </div>
      </section>

      {machines.length > 0 && (
        <section className="section">
          <p className="eyebrow">3 · Confirm &amp; label ({machines.length})</p>
          <div className="machine-rows">
            {machines.map((m) => (
              <div className="mrow" key={m.id}>
                <input className="mname" value={m.name} aria-label="Machine name" onChange={(e) => patchMachine(m.id, { name: e.target.value })} />
                <input className="mkind" value={m.kind} aria-label="Machine type" onChange={(e) => patchMachine(m.id, { kind: e.target.value })} />
                {m.note && <span className="sub mnote">{m.note}</span>}
                <button className="mremove" onClick={() => removeMachine(m.id)} aria-label={`Remove ${m.name}`}>✕</button>
              </div>
            ))}
          </div>
          <div className="controls">
            <button onClick={addMachine}>+ Add machine</button>
            <button className="cta" onClick={save}>Save &amp; monitor →</button>
          </div>
        </section>
      )}

      {error && <p className="err" role="alert">{error}</p>}
      <canvas ref={capRef} width={CAP_W} height={CAP_H} style={{ display: "none" }} />

      <footer className="foot">
        Labels are grounded by Claude Opus 4.8 vision from your description, saved in this
        browser, and editable anytime. This is the "set up in plain English" step — once
        saved, monitoring tracks each named machine's region separately.
      </footer>
    </main>
  );
}
