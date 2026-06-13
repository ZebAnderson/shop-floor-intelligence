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
