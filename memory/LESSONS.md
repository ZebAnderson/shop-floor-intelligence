# Lessons (file-based memory)

The outer loop. Before each milestone, the builder reads this. After each one, it
appends a general *rule* (not a narration) so a solved mistake is never re-derived.

## Toolchain
- This machine kills prebuilt adhoc-signed native binaries (esbuild, exit 137/SIGKILL), so vitest/tsx do not run here. Use Node's native test runner (`node --test`) + native TS type-stripping (Node ≥ 23.6). Run tests via `scripts/test.mjs`; run `.ts` scripts directly with `node file.ts`. Publisher-signed binaries (node, gh) work fine.
- Cross-file relative TS imports must include the `.ts` extension (e.g. `./types.ts`) for Node strip-types; `allowImportingTsExtensions: true` keeps `tsc` and webpack happy too.

## M1 — Data ingest
- Keep the fixture timeline (`fixtures/sequence.json`) as the single source of truth: machineId/ts/frameRef/trueState. Ingest output (`ParsedRecord`) drops `trueState` — the agent must recover state from the image via vision, never read the label.

## M2 — Vision (plumbing) + Vercel
- Keep pngjs/fs out of the serverless bundle: split the local (pixel) backend into its own module and reach it via dynamic `import()`. Mark heavy native deps in `serverExternalPackages` (next.config). The Claude route takes the image as base64 in the request body — no server-side fs, so it is Vercel-safe.
- `next build` IS the Vercel check: run it locally to confirm the app compiles + type-checks before deploying. `.ts`-extension imports + `allowImportingTsExtensions` pass Next's SWC and type-checker.
- Make eval honest: the classifier takes only a file path and reads pixels; it never sees the label/trueState. Keep a confusion summary in the eval output so a verifier can see it's genuinely diagonal.

## M3 — Agent loop (the product)
- The agent is the headline: watch -> catch sustained stoppage (>= N consecutive stopped frames) -> investigate surrounding frames -> draft action + briefing, with utilization as supporting context. Keep classification as plumbing reached only via classifyFrame(frameRef).
- Inject the classifier into runAgent so tests run offline/deterministic (local backend) while production can pass the Claude backend. Never read trueState in the agent.

## M4 — UI (agent report)
- Single source of truth: one pure renderAgentReport(report) string used by BOTH the page (dangerouslySetInnerHTML) and the smoke test — page and test can never drift. Lead with the caught stoppage as the hero; utilization grid is clearly-secondary supporting context.
- Statically prerender from a committed data/report.json (no runtime fs, no key) so the deployed URL always responds; bake it with the Claude backend + Claude-AUTHORED action so real Opus 4.8 is visible on the static page.

## M5 — Deploy (Vercel)
- Browser-capture + server-classify is the portability key: getUserMedia in the client (works on https + localhost) + a Claude /api/vision route works identically local and on Vercel; server-side camera capture would never port.
- Deploy flow: `vercel link --yes`, set ANTHROPIC_API_KEY via `vercel env add <name> production`, then `vercel --prod --yes`. Landing page builds static (no key needed); only the function needs the key at runtime.
- Serverless cold start + Opus 4.8 latency can briefly exceed a 60s client timeout on the first call; healthy on retry. Consider a warm-up ping before a live demo.

## UX pass + obstruction (post-launch)
- Ground UX work in Nielsen/NN-g 10 usability heuristics + 2026 dark-UI practice: status visibility (KPI strip + pulse), recognition-not-recall (a status legend — never color alone), clear hierarchy (event chips + one hero, readable sans for long prose while keeping the monospace identity for chrome/data), and accessibility (ARIA roles/labels, aria-live, focus-visible, AA contrast).
- Camera-obstruction is a first-class state: add "obstructed" to FrameState and a distinct "feed_obstructed" anomaly so a blocked lens is a CAMERA alert, never a phantom stoppage. Detect three ways — Claude prompt (vision), local pixel variance (offline), and an instant in-browser variance check in /live that skips the paid call when the view is unusable.
