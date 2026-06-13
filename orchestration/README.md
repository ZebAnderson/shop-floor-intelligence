# Orchestration

The loop that builds and self-verifies Shop Floor Intelligence.

## Run it
```
node orchestration/workflow.mjs
```
(after wiring `runAgent()` to your Claude Code dynamic-workflow runtime — see the
comments in `workflow.mjs` and the event resources for the exact calls.)

## The loop, in one paragraph
For each milestone in `rubric.md`: the **builder** works toward it (with the brief +
accumulated lessons in context), then a **verifier** in a fresh context grades the
result against the rubric and runs the checks itself. Fail → feed the reason back, up
to 3 attempts. Pass → checkpoint it and distill one reusable lesson into memory. Stop
only when every milestone is green and the live URL responds.

## Why a judge cares (Orchestration 15%, Autonomy 15%)
- **Repeatable:** point this at a different `rubric.md` tomorrow and it runs.
- **Done is verifiable by the model:** the verifier runs real tests / curls the URL,
  so completion is proven, not asserted.
- **Autonomy is visible:** `checkpoints/` + `memory/LESSONS.md` are the session-log
  trail showing the model caught and fixed its own failures between checkpoints.

## Beyond the build loop
After the 5 milestones passed, later passes used **multi-agent workflows** for breadth:
an adversarial **pre-deploy review** (parallel reviewers across correctness / Vercel /
security / demo-positioning, double-verified) and an **enhancement research** workflow
(UX vs `docs/UX-GUIDELINES.md`, KPI/feature gaps via web search, the 3D-demo approach) that
produced the prioritized no-bloat roadmap. Same principle as the verifier: independent
agents grade and extend the work rather than the builder self-asserting.
