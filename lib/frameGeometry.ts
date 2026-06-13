// Shared frame geometry for the synthetic camera feed.
//
// Each frame depicts a machine with an andon stack light — red (top), amber
// (middle), green (bottom) — exactly one lamp lit. Stack-light state is a real
// signal used to monitor otherwise-uninstrumented machines, so classifying the
// lit lamp is legitimate (if simple) machine vision. Both the fixture generator
// and the local classifier import these constants so they can never drift apart.
import type { MachineState } from "./types.ts";

export const FRAME_W = 320;
export const FRAME_H = 240;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Lamp regions, keyed by the machine state each lamp signals.
export const LAMPS: Record<MachineState, Rect> = {
  stopped: { x0: 268, y0: 28, x1: 304, y1: 72 }, // red, top
  idle: { x0: 268, y0: 84, x1: 304, y1: 128 }, // amber, middle
  running: { x0: 268, y0: 140, x1: 304, y1: 184 }, // green, bottom
};

// Lit ("on") vs dim ("off") colors for each lamp.
export const LAMP_COLORS: Record<
  MachineState,
  { on: readonly [number, number, number]; off: readonly [number, number, number] }
> = {
  stopped: { on: [230, 45, 40], off: [70, 22, 20] },
  idle: { on: [240, 185, 30], off: [70, 60, 18] },
  running: { on: [55, 210, 90], off: [20, 65, 32] },
};
