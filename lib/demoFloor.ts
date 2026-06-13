// Self-contained demo shop floor — three visually-distinct machines at fixed positions,
// each with an andon stack light, cycling state on staggered timelines. Shared by /setup
// (capture + label by plain-English description) and /live (monitor the same regions), so
// the labels you set up transfer straight into monitoring with no physical camera.
import type { MachineState } from "./types.ts";

export interface DemoMachine {
  name: string;
  kind: string;
  cx: number; // center x as a fraction of width
  color: string; // body color — distinct so "the blue one on the right" maps
}

// Greenish lathe (left), gray sander (middle), BLUE cnc (right).
export const DEMO_MACHINES: DemoMachine[] = [
  { name: "Lathe 1", kind: "lathe", cx: 0.18, color: "#5a7d5a" },
  { name: "Sander", kind: "sander", cx: 0.5, color: "#5b626b" },
  { name: "CNC Mill", kind: "cnc", cx: 0.82, color: "#3f6fae" },
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
  ctx.fillStyle = "#0e1116";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#11151b";
  ctx.fillRect(0, H * 0.74, W, H * 0.26);

  DEMO_MACHINES.forEach((m, i) => {
    const state = demoState(i, t);
    const cx = m.cx * W;
    const baseY = H * 0.72;
    const bw = W * 0.2;
    const bh = H * 0.32;
    const x = cx - bw / 2;
    const y = baseY - bh;

    ctx.fillStyle = m.color;
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = shade(m.color, 1.25);
    ctx.fillRect(x + bw * 0.1, y - bh * 0.16, bw * 0.8, bh * 0.18);

    const moving = state === "running";
    const off = moving ? Math.sin(t * 6 + i) * bw * 0.12 : 0;
    ctx.fillStyle = "#cfd7e0";
    ctx.fillRect(cx - bw * 0.06 + off, y + bh * 0.22, bw * 0.12, bh * 0.42);

    // andon stack light, top-right of the machine
    const lw = W * 0.022;
    const lh = H * 0.045;
    const lx = x + bw - lw * 1.4;
    const ly = y - bh * 0.5;
    (["stopped", "idle", "running"] as MachineState[]).forEach((lamp, k) => {
      const lit = lamp === state;
      ctx.fillStyle = lit ? LAMP[lamp] : LAMP_OFF[lamp];
      if (lit) {
        ctx.shadowColor = LAMP[lamp];
        ctx.shadowBlur = 18;
      }
      ctx.fillRect(lx, ly + k * (lh + 2), lw, lh);
      ctx.shadowBlur = 0;
    });
  });

  ctx.fillStyle = "#8b97a3";
  ctx.font = `600 ${Math.round(H * 0.04)}px ui-monospace, Menlo, monospace`;
  ctx.fillText("SHOP FLOOR INTELLIGENCE · DEMO FLOOR", W * 0.04, H * 0.1);
}
