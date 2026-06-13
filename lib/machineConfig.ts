// Floor configuration — the operator's plain-English machine labels, grounded into
// frame regions during onboarding (/setup). Persisted in localStorage (no backend yet);
// editable and exportable. The pure helpers (clampRegion, normalizeMachines) are
// unit-tested; the load/save helpers are browser-only and guard for SSR.

// A normalized bounding box (0..1) of one machine within the camera frame.
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MachineRegion {
  id: string;
  name: string; // e.g. "Lathe 1"
  kind: string; // e.g. "lathe", "sander", "cnc"
  region: Region;
  note?: string; // short visual descriptor (from the vision grounding)
}

export interface FloorConfig {
  version: 1;
  machines: MachineRegion[];
  sourceLabel?: string; // which source it was set up against
  updatedAt: string;
}

const KEY = "sfi.floorConfig.v1";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const MIN_SIZE = 0.02;

// Keep a region inside the frame with positive size. The top-left is pulled in far
// enough to leave room for the minimum size, so x+w and y+h never exceed 1.
export function clampRegion(r: Partial<Region> | undefined): Region {
  const x = Math.min(clamp01(Number(r?.x)), 1 - MIN_SIZE);
  const y = Math.min(clamp01(Number(r?.y)), 1 - MIN_SIZE);
  const w = clamp01(Number(r?.w));
  const h = clamp01(Number(r?.h));
  return {
    x,
    y,
    w: Math.max(MIN_SIZE, Math.min(w, 1 - x)),
    h: Math.max(MIN_SIZE, Math.min(h, 1 - y)),
  };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Coerce raw vision-grounding output into a validated, de-duplicated machine list.
export function normalizeMachines(raw: unknown): MachineRegion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MachineRegion[] = [];
  raw.forEach((m, i) => {
    if (!m || typeof m !== "object") return;
    const obj = m as Record<string, unknown>;
    const name = String(obj.name ?? `Machine ${i + 1}`).trim().slice(0, 64) || `Machine ${i + 1}`;
    const kind = String(obj.kind ?? "machine").trim().slice(0, 40) || "machine";
    let id = slug(name) || `m${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({
      id,
      name,
      kind,
      region: clampRegion(obj.region as Partial<Region> | undefined),
      note: obj.note ? String(obj.note).slice(0, 160) : undefined,
    });
  });
  return out;
}

export function loadConfig(): FloorConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as FloorConfig;
    return cfg && Array.isArray(cfg.machines) && cfg.machines.length > 0 ? cfg : null;
  } catch {
    return null;
  }
}

export function saveConfig(machines: MachineRegion[], sourceLabel?: string): FloorConfig {
  const cfg: FloorConfig = {
    version: 1,
    machines,
    sourceLabel,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(cfg));
  }
  return cfg;
}

export function clearConfig(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}
