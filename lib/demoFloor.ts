// Self-contained demo shop floor — FOUR visually-distinct machines at fixed positions
// (matching the 3D feed: green lathe, steel mill, orange press, blue CNC), each with an
// andon stack light, cycling state on staggered timelines. Shared by /setup (capture +
// label by plain-English description) and /live (monitor the same regions), so the labels
// you set up transfer straight into monitoring with no physical camera.
import type { MachineState } from "./types.ts";

export interface DemoMachine {
  name: string;
  kind: string;
  cx: number; // center x as a fraction of width
  color: string; // distinct body color
  shape: "wide" | "tall" | "press" | "cnc";
}

export const DEMO_MACHINES: DemoMachine[] = [
  { name: "Lathe 1", kind: "lathe", cx: 0.13, color: "#34b36a", shape: "wide" }, // green
  { name: "Mill", kind: "mill", cx: 0.38, color: "#aab6c4", shape: "tall" }, // light steel
  { name: "Press", kind: "press", cx: 0.62, color: "#e0853a", shape: "press" }, // orange
  { name: "CNC Mill", kind: "cnc", cx: 0.87, color: "#3f86d6", shape: "cnc" }, // blue
];

const LAMP: Record<MachineState, string> = { stopped: "#e62d28", idle: "#f0b91e", running: "#37d25a" };
const LAMP_OFF: Record<MachineState, string> = { stopped: "#461614", idle: "#463c12", running: "#144120" };

// Staggered so the floor always shows a mix; each machine spends ~6s stopped (≥2 samples).
export function demoState(i: number, t: number): MachineState {
  const s = (t + i * 7) % 24;
  if (s < 10) return "running";
  if (s < 13) return "idle";
  if (s < 19) return "stopped";
  return "running";
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

export function drawDemoFloor(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
  ctx.fillStyle = "#141922"; // lighter so machines read on capture
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#222a33";
  ctx.fillRect(0, H * 0.72, W, H * 0.28);

  const baseY = H * 0.74;
  DEMO_MACHINES.forEach((m, i) => {
    const state = demoState(i, t);
    const cx = m.cx * W;
    // Distinct silhouettes per shape.
    const dims = {
      wide: { w: 0.2, h: 0.24 },
      tall: { w: 0.12, h: 0.36 },
      press: { w: 0.15, h: 0.3 },
      cnc: { w: 0.16, h: 0.36 },
    }[m.shape];
    const bw = dims.w * W;
    const bh = dims.h * H;
    const x = cx - bw / 2;
    const y = baseY - bh;

    ctx.fillStyle = m.color;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = shade(m.color, 1.25);
    ctx.fillRect(x + bw * 0.1, y - bh * 0.14, bw * 0.8, bh * 0.16); // head

    if (m.shape === "press") {
      // top overhang bar (C-frame look)
      ctx.fillStyle = shade(m.color, 1.1);
      ctx.fillRect(x - bw * 0.12, y - bh * 0.14, bw * 1.24, bh * 0.12);
    }
    if (m.shape === "cnc") {
      // glowing-ish window panel
      ctx.fillStyle = state === "running" ? "#bfe6f5" : "#7fa6b8";
      ctx.fillRect(x + bw * 0.22, y + bh * 0.3, bw * 0.56, bh * 0.4);
    }

    // moving part when running (skip for the enclosed cnc cabinet)
    if (m.shape !== "cnc") {
      const moving = state === "running";
      const off = moving ? Math.sin(t * 6 + i) * bw * 0.14 : 0;
      ctx.fillStyle = "#d2d9e2";
      ctx.fillRect(cx - bw * 0.07 + off, y + bh * 0.28, bw * 0.14, bh * 0.42);
    }

    // andon stack light, top-right of the machine
    const lw = W * 0.02;
    const lh = H * 0.042;
    const lx = x + bw - lw * 1.2;
    const ly = y - bh * 0.42;
    (["stopped", "idle", "running"] as MachineState[]).forEach((lamp, k) => {
      const lit = lamp === state;
      ctx.fillStyle = lit ? LAMP[lamp] : LAMP_OFF[lamp];
      if (lit) {
        ctx.shadowColor = LAMP[lamp];
        ctx.shadowBlur = 16;
      }
      ctx.fillRect(lx, ly + k * (lh + 2), lw, lh);
      ctx.shadowBlur = 0;
    });
  });

  ctx.fillStyle = "#aeb9c5";
  ctx.font = `600 ${Math.round(H * 0.038)}px ui-monospace, Menlo, monospace`;
  ctx.fillText("SHOP FLOOR INTELLIGENCE · DEMO FLOOR", W * 0.04, H * 0.09);
}
