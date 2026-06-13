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
  clearConfig,
  clampRegion,
  normalizeMachines,
  type MachineRegion,
  type Region,
} from "@/lib/machineConfig.ts";

const CAP_W = 640;
const CAP_H = 480;
// Shown as a placeholder only (the field starts empty so nothing canned is sent).
const EXAMPLE =
  "e.g. the green lathe is on the left, then a steel mill, an orange press, and the blue CNC on the right.";

interface Source {
  id: string;
  label: string;
}

// Minimal Web Speech API typing (optional progressive enhancement).
interface SRResult {
  isFinal: boolean;
  [k: number]: { transcript: string };
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [k: number]: SRResult };
}
interface SRLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
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
  const [description, setDescription] = useState(""); // starts empty; EXAMPLE is the placeholder
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
  const wantListenRef = useRef(false); // keep restarting until the user taps stop
  const finalRef = useRef(""); // accumulated finalized transcript
  const baseRef = useRef(""); // description text present before dictation started
  const addSeqRef = useRef(0); // monotonic so manually-added machines never collide
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; px: number; py: number; region: Region } | null>(null);

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
    setMachines([]); // fresh frame — drop any stale boxes; Identify detects them anew
    setError(null);
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
      const incoming = data.machines ?? [];
      if (incoming.length === 0) {
        setError("No machines identified — try a clearer frame or a more specific description.");
        return; // keep the description so it can be edited
      }
      // Replace with the fresh detection (auto-detect finds every machine in the frame).
      // No stale entries, no duplicates — edit names / add any it missed below.
      setMachines(incoming);
      setDescription("");
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
    addSeqRef.current += 1; // monotonic — never reused, even after removals
    const seq = addSeqRef.current;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${seq}-${Date.now()}`;
    setMachines((ms) => [
      ...ms,
      { id, name: `New machine ${seq}`, kind: "machine", region: clampRegion({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }) },
    ]);
  }

  // Drag a box to move it, or drag its corner handle to resize — region edits the
  // operator can actually make when the grounding isn't perfect.
  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    const wrap = frameWrapRef.current;
    if (!d || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dx = (e.clientX - d.px) / rect.width;
    const dy = (e.clientY - d.py) / rect.height;
    const region =
      d.mode === "move"
        ? clampRegion({ x: d.region.x + dx, y: d.region.y + dy, w: d.region.w, h: d.region.h })
        : clampRegion({ x: d.region.x, y: d.region.y, w: d.region.w + dx, h: d.region.h + dy });
    setMachines((ms) => ms.map((m) => (m.id === d.id ? { ...m, region } : m)));
  }, []);
  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
  }, [onPointerMove]);
  function startDrag(e: React.PointerEvent, m: MachineRegion, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { id: m.id, mode, px: e.clientX, py: e.clientY, region: { ...m.region } };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag, { once: true });
  }

  function buildRecognizer(): SRLike | null {
    const w = window as unknown as { SpeechRecognition?: new () => SRLike; webkitSpeechRecognition?: new () => SRLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const sr = new Ctor();
    sr.lang = "en-US";
    sr.continuous = true; // keep listening across sentences/pauses
    sr.interimResults = true; // show words as they're spoken
    sr.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) finalRef.current = `${finalRef.current} ${txt}`.trim();
        else interim += txt;
      }
      setDescription(`${baseRef.current} ${finalRef.current} ${interim}`.replace(/\s+/g, " ").trim());
    };
    // Browsers stop the recognizer after a silence window; restart it until the
    // user taps stop, so dictation spans as many sentences as they like.
    sr.onend = () => {
      if (wantListenRef.current) {
        try {
          sr.start();
        } catch {
          /* already starting */
        }
      } else {
        setListening(false);
      }
    };
    sr.onerror = () => {
      /* keep wantListen; onend fires next and decides whether to restart */
    };
    return sr;
  }

  function toggleVoice() {
    if (listening) {
      wantListenRef.current = false;
      srRef.current?.stop();
      setListening(false);
      return;
    }
    const sr = buildRecognizer();
    if (!sr) {
      setError("Voice input isn't supported in this browser — type the description instead.");
      return;
    }
    baseRef.current = description.trim();
    finalRef.current = "";
    srRef.current = sr;
    wantListenRef.current = true;
    setListening(true);
    try {
      sr.start();
    } catch {
      /* already started */
    }
  }

  function save() {
    if (machines.length === 0) {
      setError("Identify or add at least one machine before saving.");
      return;
    }
    // normalize() guarantees unique ids + clamped regions before persisting.
    saveConfig(normalizeMachines(machines), labelFor(sourceId));
    router.push("/live");
  }

  function clearSaved() {
    clearConfig();
    setMachines([]);
    setExisting(false);
  }

  useEffect(() => stopPreview, [stopPreview]);
  useEffect(
    () => () => {
      wantListenRef.current = false;
      srRef.current?.stop();
    },
    [],
  );

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
            <div className="frame-wrap" ref={frameWrapRef}>
              <img className="frame-img" src={frame} alt="captured floor frame" draggable={false} />
              {machines.map((m) => (
                <div
                  key={m.id}
                  className="mbox"
                  onPointerDown={(e) => startDrag(e, m, "move")}
                  title="Drag to move · drag the corner to resize"
                  style={{ left: `${m.region.x * 100}%`, top: `${m.region.y * 100}%`, width: `${m.region.w * 100}%`, height: `${m.region.h * 100}%` }}
                >
                  <span className="mbox-label">{m.name}</span>
                  <span className="mbox-handle" onPointerDown={(e) => startDrag(e, m, "resize")} />
                </div>
              ))}
            </div>
          )}
          {frame && machines.length > 0 && (
            <p className="sub">Drag a box to move it, or its bottom-right corner to resize.</p>
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
          <button onClick={toggleVoice} aria-pressed={listening}>{listening ? "● Listening… (tap to stop)" : "🎤 Speak"}</button>
          <button className="primary" onClick={identify} disabled={!frame || identifying}>
            {identifying ? "Identifying…" : machines.length > 0 ? "Re-identify" : "Identify machines"}
          </button>
        </div>
        <p className="note">
          <b>Leave it blank</b> to auto-detect and name every machine, or describe some to set
          the names you want. Identify <b>replaces</b> the list below with everything it finds in
          this frame — then rename, drag/resize the boxes, or <b>+ Add machine</b> for anything
          it missed. Re-identify anytime to redo.
        </p>
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
            {existing && <button onClick={clearSaved}>Clear saved floor</button>}
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
