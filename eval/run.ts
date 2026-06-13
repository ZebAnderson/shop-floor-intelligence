// Milestone 2 check — scores the vision classifier against eval/ground_truth.csv.
// Prints accuracy and a confusion summary; exits 0 only if accuracy >= eval/TARGET.
// Run: npm run eval   (defaults to the offline local backend; VISION_BACKEND=claude
// scores Claude Opus 4.8 vision instead, which needs ANTHROPIC_API_KEY.)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFrame } from "../lib/visionFs.ts";
import { currentBackend } from "../lib/vision.ts";
import type { MachineState } from "../lib/types.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Row {
  frameRef: string;
  label: MachineState;
}

function readGroundTruth(): Row[] {
  const text = readFileSync(join(repoRoot, "eval", "ground_truth.csv"), "utf8").trim();
  const valid: MachineState[] = ["running", "idle", "stopped"];
  return text
    .split(/\r?\n/)
    .slice(1) // drop header
    .filter((line) => line.trim().length > 0)
    .map((line, i) => {
      const cells = line.split(",");
      if (cells.length !== 2) {
        throw new Error(`ground_truth.csv row ${i + 2}: expected 2 columns, got ${cells.length}`);
      }
      const frameRef = cells[0].trim();
      const label = cells[1].trim();
      if (!valid.includes(label as MachineState)) {
        throw new Error(`ground_truth.csv row ${i + 2}: invalid label "${label}"`);
      }
      return { frameRef, label: label as MachineState };
    });
}

const target = Number.parseFloat(
  readFileSync(join(repoRoot, "eval", "TARGET"), "utf8").trim(),
);
const rows = readGroundTruth();
if (rows.length === 0) {
  console.error("eval: ground_truth.csv has no rows — run `npm run fixtures` first.");
  process.exit(1);
}

let correct = 0;
const confusion: Record<string, Record<string, number>> = {};
for (const { frameRef, label } of rows) {
  const pred = await classifyFrame(frameRef);
  if (pred === label) correct++;
  confusion[label] ??= {};
  confusion[label][pred] = (confusion[label][pred] ?? 0) + 1;
}

const accuracy = correct / rows.length;
console.log(`backend:  ${currentBackend()}`);
console.log(
  `frames: ${rows.length}  correct: ${correct}  accuracy: ${(accuracy * 100).toFixed(1)}%  target: ${(target * 100).toFixed(1)}%`,
);
for (const truth of Object.keys(confusion).sort()) {
  console.log(`  ${truth.padEnd(8)} -> ${JSON.stringify(confusion[truth])}`);
}

if (accuracy + 1e-9 >= target) {
  console.log("EVAL PASS");
  process.exit(0);
} else {
  console.log("EVAL FAIL");
  process.exit(1);
}
