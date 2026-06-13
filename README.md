# Shop Floor Intelligence

**Live:** https://shop-floor-intelligence.vercel.app
Built for the Claude Build Day, running on **Claude Opus 4.8**.

An **autonomous shop-floor agent** for high-mix job shops. A cheap webcam plus Claude
vision turns an uninstrumented manual machine into a monitored one. The agent watches the
feed, keeps running notes, **catches a machine stoppage or a blocked camera live**,
investigates the surrounding frames, and **drafts the next action plus a shift briefing**
— with utilization, time-in-state, and availability as supporting context. The user is the
line operator or plant manager; "working" is the agent catching a stop nobody flagged and
proposing the next step. Frame classification is plumbing underneath this, never the
headline (this is an agent, not an image analyzer or a dashboard).

## What it does

- **Plain-English onboarding (`/setup`).** Describe your machines in natural language —
  typed or **spoken** ("the machine on the left is Lathe 1, the middle one is a sander, the
  blue one on the right is a CNC"). Claude Opus 4.8 vision grounds each named machine into a
  labeled **region** of the frame; you edit/confirm, save (localStorage, editable), then
  monitoring tracks each named machine separately. This is how the agent knows *which*
  machine is down.
- **Watch → catch → draft loop.** Classifies each frame (running / idle / stopped /
  obstructed), debounces a sustained stoppage, and drafts a Claude-authored action + a
  one-line shift briefing. Most-consequential alert first (ongoing > resolved, longer
  downtime and obstruction ranked up).
- **Real Claude Opus 4.8 vision.** The production path classifies frames with
  `claude-opus-4-8`; an offline pixel backend drives the deterministic eval. Measured
  **24/24** on the labeled fixture set, both backends.
- **Camera-obstruction detection.** A blocked/covered/too-dark lens is caught as a distinct
  **camera** alert (`feed_obstructed`) — never misreported as a machine stoppage. Detected
  by Claude, by a local pixel-variance check, and instantly in-browser on `/live`.
- **Live camera page (`/live`).** Browser capture from a **Logitech Brio** (or a screen
  share, or the built-in demo loop) → `/api/vision` (Claude) → the same agent, live. Same
  code runs locally and on Vercel.
- **Demo feeds.** `/loop.html` (zero-dependency 2D machine loop) and `/loop3d.html` (a
  Three.js corner-mounted CCTV view of a low-poly shop — multiple machines, andon stack
  lights, scrap bins, an operator, and a forklift that crosses the lens to trip obstruction).
- **Operator-grade KPIs** from data already held: time-in-state %, observed-window
  availability, per-machine timeline sparkline, fleet rollups. (Honest proxies — see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).)
- **Industrial UX** grounded in Nielsen heuristics + 2026 dark-UI practice — see
  [`docs/UX-GUIDELINES.md`](docs/UX-GUIDELINES.md).

## Architecture (one breath)

```
camera/feed ─▶ ingest ─▶ vision (local pixels | Claude Opus 4.8) ─▶ agent ─▶ report ─▶ UI
fixtures/      lib/        lib/vision.ts + lib/visionLocal.ts        lib/         lib/      app/
sequence.json  ingest.ts   → FrameState (running/idle/stopped/obstructed)  reportCore.ts  view.ts  page.tsx + live/
```

- The **landing page** (`/`) is statically prerendered from a committed
  `data/report.json` (no runtime fs, no key needed to load) baked with real Claude vision +
  a Claude-authored action.
- The **live page** (`/live`) captures in the browser and classifies server-side via
  `/api/vision` — the only path that needs `ANTHROPIC_API_KEY` at runtime.

Full module map, KPI definitions, vision backends, routes, and Opus 4.8 API conventions
are in **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)**.

## Run it

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY for the Claude vision path
npm run fixtures            # render synthetic frames + eval/ground_truth.csv
npm run report              # bake data/report.json (add report:claude for real Opus 4.8)
npm run dev                 # http://localhost:3000  (/, /live, /loop.html, /loop3d.html)
```

### Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm test` | Full suite (Node-native runner). `npm test -- ingest` / `-- agent` / `npm run test:smoke` filter |
| `npm run eval` | Score the **local** vision backend vs `eval/ground_truth.csv` (exits non-zero below `eval/TARGET`) |
| `npm run eval:claude` | Same, scoring **real Claude Opus 4.8** vision (reads `.env`) |
| `npm run fixtures` | Generate the synthetic frame feed + ground truth from `fixtures/sequence.json` |
| `npm run report` / `report:claude` | Bake `data/report.json` for the static landing page (local / Claude vision + Claude-authored action) |

> **Toolchain note:** tests and scripts run on **Node's native test runner + native TS
> type-stripping** (Node ≥ 22.18) — no esbuild/vitest (this build machine kills prebuilt
> adhoc-signed binaries). Next.js builds with SWC and is unaffected. Cross-file relative
> imports use explicit `.ts` extensions (`allowImportingTsExtensions`).

## Deploy (Vercel)

```bash
vercel link --yes
vercel env add ANTHROPIC_API_KEY production   # paste the key (also: preview/development)
vercel --prod --yes
```

The landing page builds static (no key needed); only `/api/vision` needs the key at runtime.

## Repo map

| Path | Purpose |
|------|---------|
| `app/` | App Router: `page.tsx` (report), `live/page.tsx`, `setup/page.tsx` (onboarding), `api/vision/route.ts`, `api/setup/route.ts` |
| `lib/` | `ingest`, `vision` + `visionLocal`, `reportCore` (agent), `reason` (Claude action), `view` (renderer), `types`, `frameGeometry`, `machineConfig` (floor labels), `setup` (vision grounding), `demoFloor` |
| `fixtures/` | `sequence.json` (source-of-truth timeline), `generate.ts`, generated `frames/` |
| `eval/` | `run.ts`, `ground_truth.csv`, `TARGET` |
| `public/` | `loop.html`, `loop3d.html`, `frames/` (served thumbnails) |
| `docs/` | `ARCHITECTURE.md`, `UX-GUIDELINES.md` |
| `orchestration/` | the builder→verifier loop, verifier prompt (how the build was driven) |
| `memory/` | `LESSONS.md`, `DECISIONS.md` — file-based memory from the build |
| `rubric.md` / `BRIEF.md` / `CLAUDE.md` | machine-gradable spec / judge brief / agent operating brief |

## Why this layout (Autonomy + Orchestration)

Opus 4.8 is a strong long-horizon runner (better long-context, fewer compactions, 1M
context), so the harness here isn't a crutch — it makes "done" something the model
*proves*: verifier-gated milestones, milestone decomposition that caps silent-error blast
radius, and file-based memory so a lesson learned once becomes a rule. The build ran as an
unsteered `/goal` loop with an independent verifier grading each of the 5 rubric milestones;
later passes used research/review workflows to harden and extend it. That trail —
`checkpoints/`, `memory/`, the verifier reports — is the Autonomy/Orchestration story.
