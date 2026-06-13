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
