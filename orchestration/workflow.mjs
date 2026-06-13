// orchestration/workflow.mjs
//
// Builder → Verifier loop, milestone by milestone — the "loop in code, not in the
// model's head" pattern.
//
// ⚠️ THIS FILE IS A DOCUMENTED ORCHESTRATION ARTIFACT, NOT THE LIVE DRIVER.
// On Opus 4.8 we run the build natively (Claude Code `/goal` + auto mode, spawning the
// verifier subagent per milestone — see CLAUDE.md), because Opus 4.8 is a strong
// long-horizon runner and the native loop produces a cleaner autonomy log. This script
// captures the same control flow in explicit code so a judge can see exactly how "done"
// is gated, and so the whole setup re-runs on a *different* problem tomorrow by swapping
// `rubric.md` + `eval/ground_truth.csv` — no model in the loop required to read it.
//
// The control flow below is the point. The `runAgent()` stub is intentionally not wired
// to a runtime (the native run is the live path); wire it only if you want this script
// to drive the build headlessly instead of the native loop.

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const MAX_ATTEMPTS = 3;

// Pull milestones out of rubric.md (the rows of the table). Adapt the parse to your file.
const milestones = parseMilestones(readFileSync("./rubric.md", "utf8"));

for (const m of milestones) {
  let passed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !passed; attempt++) {
    // 1. BUILD — give the builder the goal, the brief, and prior lessons.
    await runAgent("builder", {
      goal: m.goal,
      context: [readFileSync("./CLAUDE.md", "utf8"),
                readFileSync("./memory/LESSONS.md", "utf8")].join("\n\n"),
      feedback: m.lastFailure ?? null, // course-correct from the verifier, if any
    });

    // 2. VERIFY — fresh context, independent grader. Self-critique underperforms this.
    const verdict = await runAgent("verifier", {
      prompt: readFileSync("./orchestration/verifier.md", "utf8"),
      rubric: readFileSync("./rubric.md", "utf8"),
      milestone: m.id,
    });

    passed = verdict.includes("VERDICT: PASS");
    if (!passed) m.lastFailure = verdict; // feed the reason back into the next attempt
  }

  if (!passed) {
    // 3. STOP and flag — do not let the model declare victory it didn't earn.
    appendFileSync("./memory/LESSONS.md",
      `\n## BLOCKED on milestone ${m.id}\nNeeds a human. Last verdict:\n${m.lastFailure}\n`);
    throw new Error(`Milestone ${m.id} failed after ${MAX_ATTEMPTS} attempts — human needed.`);
  }

  // 4. CHECKPOINT + DISTILL — snapshot the win, turn the experience into a reusable rule.
  writeFileSync(`./checkpoints/milestone-${m.id}.json`,
    JSON.stringify({ id: m.id, passedAt: new Date().toISOString() }, null, 2));
  await runAgent("builder", {
    goal: `Append one general, reusable lesson from milestone ${m.id} to memory/LESSONS.md. ` +
          `A rule, not a narration. So the same mistake is never re-derived.`,
  });
}

console.log("All milestones PASS. Confirm the live URL responds, then submit.");

// --- adapt these to your runtime ---
async function runAgent(role, opts) { throw new Error("Wire runAgent() to your Claude Code workflow runtime."); }
function parseMilestones(rubricText) { /* parse the table rows into {id, goal, lastFailure} */ return []; }
