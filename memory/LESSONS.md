# Lessons (file-based memory)

The outer loop. Before each milestone, the builder reads this. After each one, it
appends a general *rule* (not a narration) so a solved mistake is never re-derived.

## Toolchain
- This machine kills prebuilt adhoc-signed native binaries (esbuild, exit 137/SIGKILL), so vitest/tsx do not run here. Use Node's native test runner (`node --test`) + native TS type-stripping (Node ≥ 23.6). Run tests via `scripts/test.mjs`; run `.ts` scripts directly with `node file.ts`. Publisher-signed binaries (node, gh) work fine.
- Cross-file relative TS imports must include the `.ts` extension (e.g. `./types.ts`) for Node strip-types; `allowImportingTsExtensions: true` keeps `tsc` and webpack happy too.

## M1 — Data ingest
- Keep the fixture timeline (`fixtures/sequence.json`) as the single source of truth: machineId/ts/frameRef/trueState. Ingest output (`ParsedRecord`) drops `trueState` — the agent must recover state from the image via vision, never read the label.
