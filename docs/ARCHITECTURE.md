# Architecture & Features

How Shop Floor Intelligence is put together, and the conventions to keep. Companion to
the [README](../README.md) and [UX-GUIDELINES](./UX-GUIDELINES.md).

## Data flow

```
RawFrame ─▶ ingestFrame ─▶ ParsedRecord ─▶ classifyFrame ─▶ Observation ─▶ buildReport ─▶ AgentReport ─▶ renderAgentReport
(fixtures/   lib/ingest.ts   (machineId,     lib/vision.ts    (+ FrameState)  lib/reportCore.ts (anomalies,   lib/view.ts → HTML
 sequence,                    ts, frameRef)   → FrameState                     machines, briefing)            app/page.tsx, /live)
 camera, screen)
```

- **Ingest** normalizes a raw frame (`machineId`, ISO timestamp, `frameRef`, step) and
  validates it. It never reads the fixture's `trueState` label — state is always recovered
  from the image by the vision layer.
- **Vision** turns a frame into a `FrameState` = `running | idle | stopped | obstructed`.
- **Agent** (`reportCore.buildReport`) groups by machine, catches sustained stoppages and
  obstructions, drafts actions, rolls up KPIs, and orders alerts by consequence. It is a
  **pure** function (no fs, no network) so it runs identically on the server, in `/live`,
  and in tests.
- **View** (`renderAgentReport`) renders the report to HTML — one source of truth shared by
  the page and the smoke test.

## Module map

| Module | Responsibility |
|--------|----------------|
| `lib/types.ts` | `MachineState`, `FrameState`, `Observation`, `Anomaly` (`stoppage` \| `feed_obstructed`), `MachineSummary`, `AgentReport` |
| `lib/ingest.ts` | Raw frame → `ParsedRecord`; load/normalize `fixtures/sequence.json` |
| `lib/frameGeometry.ts` | Shared andon stack-light geometry/colors (generator + local classifier can't drift) |
| `lib/visionLocal.ts` | **Local backend** — reads PNG pixels, finds the lit lamp; flags near-uniform frames as `obstructed` |
| `lib/vision.ts` | Backend dispatch + **Claude Opus 4.8** path (`classifyImageClaude`); `parseState` (fail-closed) |
| `lib/reportCore.ts` | **The agent** — stoppage/obstruction detection, drafting, KPIs, consequence sort. Pure/client-safe |
| `lib/agent.ts` | `observe()` (classify a timeline) + `runAgent()` = observe + `buildReport` |
| `lib/reason.ts` | Optional **Claude-authored** drafted action + briefing for a caught anomaly |
| `lib/machineConfig.ts` | Floor config types + localStorage persistence + pure `clampRegion`/`normalizeMachines` |
| `lib/setup.ts` | `identifyMachines(image, description)` — Claude Opus 4.8 grounds the description into regions |
| `lib/demoFloor.ts` | Shared 3-machine demo floor (used by `/setup` + `/live` demo source) |
| `lib/view.ts` | `renderAgentReport(report)` → dashboard HTML |
| `app/page.tsx` | Static landing report (imports `data/report.json`) |
| `app/live/page.tsx` | Live browser-capture page |
| `app/api/vision/route.ts` | Claude vision endpoint (base64 in body; size-capped; generic errors) |
| `scripts/report.ts` | Bakes `data/report.json` (+ optional Claude reasoning) |
| `fixtures/generate.ts` | Renders the synthetic frame feed + `eval/ground_truth.csv` |
| `eval/run.ts` | Scores a vision backend vs ground truth against `eval/TARGET` |

## Vision backends

`classifyFrame(frameRef)` / `classifyImageClaude(base64)` resolve a frame to a `FrameState`.

- **local** (default, offline, deterministic): `lib/visionLocal.ts` reads the PNG, picks the
  brightest andon lamp region (must clear a brightness + margin threshold), and returns
  `obstructed` when the whole frame is near-uniform (variance < `UNIFORM_VAR`). Drives the
  eval and the committed report so neither needs a key. Kept in its own module so `pngjs`/`fs`
  never enter a serverless bundle that only uses the Claude path.
- **claude** (production / live demo): `lib/vision.ts` sends the image to `claude-opus-4-8`.
  The prompt classifies `running/idle/stopped/obstructed` (stack-light cues + general
  machine motion + an explicit "if you can't tell, say obstructed"). `parseState` accepts
  only the four exact words and **fails closed** (throws) on anything else — a vision
  failure never silently becomes "running".

Select with `VISION_BACKEND=claude`. On `/live`, classification is always Claude (plus an
instant in-browser obstruction pre-check that skips the paid call when the view is unusable).

## Agent logic (`lib/reportCore.ts`)

- **Stoppage:** ≥ `STOPPAGE_MIN_FRAMES` (2) consecutive `stopped` frames → a `stoppage`
  anomaly. Investigates the last-known-good frame + the stopped run; drafts an action.
- **Obstruction:** ≥ 2 consecutive `obstructed` frames → a distinct `feed_obstructed`
  anomaly with a "check the camera" action. Obstruction breaks a stopped run, so a blocked
  lens is never counted as a machine stop.
- **Duration:** `runLength × median sampling cadence` (consistent at both ends; no fabricated
  pre-stop gap). `ongoing = true` if still in-state at the latest frame.
- **Consequence sort** (ISA-18.2): `ongoing` first, then longer `durationMin`, obstruction
  nudged up; most-recent `detectedAt` breaks ties.
- **Claude-authored reasoning** (`lib/reason.ts`): when a key is present, Claude writes the
  cause hypothesis + next action + briefing (frozen into `data/report.json` at bake time);
  otherwise a deterministic template is used.

## Onboarding & multi-region monitoring ("set up in plain English")

One camera can see several machines, so the agent must be told which region is which.
`/setup` captures a still, takes the operator's natural-language description (typed or
spoken via the Web Speech API), and `POST /api/setup` has Claude Opus 4.8 ground each named
machine into a normalized bounding box (`region`). The operator confirms/edits the labels;
the floor config (`MachineRegion[]`) is saved to **localStorage** (no backend yet —
editable, browser-local). `/live` then reads the config and, each sweep, **crops every
labeled region** from the captured frame and classifies it separately (obstruction
pre-check + Claude), producing one `Observation` per machine → `buildReport` → a per-named
-machine report. With no config, it classifies the whole frame as a single source. The
3-machine `lib/demoFloor.ts` is shared by `/setup` and `/live` so labels set up on the demo
floor transfer straight into monitoring with no physical camera.

## KPIs (and honesty caveats)

All derived from data already held (per-frame state timeline, stoppage durations) — no new
sensors. Operator-language, but labeled as proxies where they aren't certified:

| KPI | Definition | Caveat |
|-----|-----------|--------|
| Utilization | running frames / total frames | — |
| Time-in-state | share of frames per state (running/idle/stopped/obstructed) | — |
| Observed-window Availability | `1 − stopped/total` | **proxy**, not OEE-grade (no scheduled-production calendar) |
| Stoppage count / MTTR proxy | count of stoppages / mean stop duration | MTTR is restore-to-running latency, **not** certified wrench-time |
| Mean-Time-To-Detect | `STOPPAGE_MIN_FRAMES × cadence` | the product's own value metric |

Deliberately **not** built (need inputs a state-only webcam can't see): OEE Performance &
Quality (part/defect counts), TEEP (shift calendar), true MTTA (a human-ack action).

## Routes & demo feeds

| Route | Type | Purpose |
|-------|------|---------|
| `/` | static | Agent report baked from `data/report.json` |
| `/setup` | static (client) | Plain-English onboarding — capture a frame, describe machines, Claude grounds them into editable labeled regions, save to localStorage |
| `/live` | static (client) | Browser capture (Brio / screen share / demo floor) → `/api/vision` → live agent. Multi-region when a floor config exists |
| `/api/vision` | serverless (nodejs) | `POST {imageBase64, mediaType?}` → `{state, model}`; size-capped, validated, no error leakage |
| `/api/setup` | serverless (nodejs) | `POST {imageBase64, description}` → `{machines:[{name,kind,region,note}]}` via Claude vision grounding |
| `/loop.html` | static | Zero-dependency 2D machine loop (filmable + sampleable; offline fallback) |
| `/loop3d.html` | static | Three.js r184 corner-cam shop scene (CDN import map; `preserveDrawingBuffer` for sampling) |

## Opus 4.8 API conventions

- Model id `claude-opus-4-8`. **Do not** set `temperature`/`top_p`/`top_k` (400 error) —
  steer with the prompt. Use adaptive thinking + the effort parameter, not `budget_tokens`.
- Vision: send images as base64 image blocks; classification prompt keeps `max_tokens` small
  and demands one word. Run the build at `xhigh` effort.

## Toolchain & deploy

- **Tests/scripts:** Node native test runner (`node --test`) + native TS type-stripping
  (Node ≥ 22.18); no esbuild/vitest. Run via `scripts/test.mjs`; `.ts` scripts run with
  `node file.ts`. Relative imports use explicit `.ts` extensions.
- **App build:** Next.js + SWC (`next build`) — what Vercel runs; verify locally before deploy.
- **Deploy:** Vercel. Static landing page needs no key at build; `/api/vision` reads
  `ANTHROPIC_API_KEY` at runtime (set per environment, never committed; `.env` is gitignored).
