// Esbuild-free test runner: Node's native test runner + native TypeScript
// type-stripping (Node >= 23.6). Avoids esbuild/vitest entirely.
//
// Usage:
//   node scripts/test.mjs          -> run every test/*.test.ts
//   node scripts/test.mjs ingest   -> run only test files whose name includes "ingest"
//   node scripts/test.mjs smoke    -> run only the smoke test
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const filter = process.argv[2] ?? "";
const files = readdirSync("test")
  .filter((f) => f.endsWith(".test.ts") && f.includes(filter))
  .map((f) => `test/${f}`)
  .sort();

if (files.length === 0) {
  console.error(`No test files in test/ match "${filter}".`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--disable-warning=ExperimentalWarning", "--test", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
