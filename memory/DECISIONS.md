# Decisions

One line per non-obvious choice and why, so context survives across long runs.

- **Stack: Next.js (App Router) on Vercel.** One cohesive app for UI + the Claude vision API route + a fast static deploy.
- **Node-native toolchain (no esbuild/vitest).** This build machine SIGKILLs prebuilt adhoc-signed binaries (esbuild), so tests use `node --test` + native TS type-stripping; `.ts` import extensions + `allowImportingTsExtensions` keep tsc/webpack happy. Next builds with SWC, unaffected.
- **Capture in the browser, classify on the server.** `/live` uses `getUserMedia`/`getDisplayMedia`; the server only classifies. Identical local and on Vercel (server-side camera capture would never port). The one thing that makes it portable.
- **Two vision backends, one interface.** Local pixel classifier (deterministic, offline, drives the eval + committed report — no key) and Claude Opus 4.8 (production/live demo). Keep `pngjs`/`fs` in `visionLocal.ts` so the serverless bundle stays lean.
- **`obstructed` is a first-class FrameState + `feed_obstructed` anomaly.** A blocked/covered/dark lens is a CAMERA problem, never a phantom machine stoppage. Detected three ways: Claude prompt, local pixel variance, and an instant in-browser check on `/live` that also saves the paid call.
- **Static landing page from a committed `data/report.json`.** Prerender the report at build (baked with Claude vision + a Claude-authored action) so the deployed URL always responds with no runtime fs and no key; `/api/vision` is the only key-dependent path.
- **`parseState` fails closed.** Only the exact state words are accepted; an empty/odd Claude reply throws rather than silently becoming "running" (a vision failure must not read as a healthy machine).
- **Blank/low-signal frames default benign, not "stopped".** The local classifier needs a clearly-lit lamp (brightness + margin) or returns idle/obstructed — avoids fabricating false stoppages.
- **Agent reasoning is pure + client-safe (`reportCore.ts`).** Same `buildReport` runs server-side, in `/live`, and in tests; KPIs and detection are deterministic.
- **KPIs labeled as proxies.** Observed-window availability and MTTR-proxy are honest approximations (no shift calendar / repair timestamps); OEE Performance/Quality, TEEP, true MTTA were explicitly cut as needing inputs a state-only webcam can't see.
- **Alerts ranked by consequence (ISA-18.2), not recency.** Ongoing > resolved, longer downtime + obstruction up; recency only breaks ties.
- **3D demo via vanilla Three.js r184 from a CDN import map, self-contained.** No react-three-fiber (needs a bundler → breaks the filmable standalone file), no Babylon, no bloom (GPU cost while filming). `preserveDrawingBuffer:true` is required so `/live` can sample the WebGL canvas. `loop.html` kept as the zero-dependency offline fallback.
- **UX grounded in Nielsen heuristics + 2026 dark-UI** (`docs/UX-GUIDELINES.md` is the rubric). Monospace "instrument" identity for chrome/data; a readable sans only for long prose. Status is always color + label (never color alone).
- **Opus 4.8 specifics:** model `claude-opus-4-8`, no `temperature`/`top_p`/`top_k`, adaptive thinking + effort (run at `xhigh`), explicit verifier-subagent spawning. See `CLAUDE.md`.
