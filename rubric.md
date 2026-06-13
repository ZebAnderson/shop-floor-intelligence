# Rubric — "done" the verifier can grade without a human

Each milestone is independently verifiable. The verifier sub-agent reads this file,
checks the named evidence, and returns PASS/FAIL per item with reasons. The builder
may only stop when every item is PASS and the live URL responds.

> Decomposing into small, separately-checkable milestones is the key Opus 4.8 move:
> it caps how far a silent error can propagate before something catches it.

| # | Milestone | Verifiable check (the exact command the verifier runs) |
|---|-----------|--------------------------------------------------------|
| 1 | Data ingest | `npm test -- ingest` passes: given a sample frame + timestamp from `fixtures/`, the ingest module returns a parsed record with the expected shape (machine id, timestamp, frame ref). |
| 2 | Vision (plumbing) | `npm run eval` prints frame-classification accuracy on `eval/ground_truth.csv` and the number is **≥ the target set in `eval/TARGET`** (target chosen after a baseline run; record it there). Exit code 0 only if the bar is met. |
| 3 | Agent intelligence output | `npm test -- agent` passes: fed the stoppage fixture sequence in `fixtures/`, the agent emits anomaly JSON whose `event` matches the planted stoppage **and** includes a non-empty `draftedAction`, a `briefing` string, and a `utilization` summary. Test asserts both the caught event and the JSON shape. |
| 4 | UI surfaces the result | `npm run test:smoke` passes: the page renders the latest agent briefing and the per-machine live state (running/idle/stopped), with the most recent anomaly surfaced first. |
| 5 | Deployed + responding | `curl -fsS -o /dev/null -w "%{http_code}" <vercel-url>` returns `200`, and loading the page shows the watch → catch → draft flow end-to-end on the demo fixture. |

## Verifier instructions
- Grade ONLY against the checks above. Do not invent new criteria.
- For each item, run the named test/command yourself; do not trust the builder's word.
- Output: a table of `# | PASS/FAIL | reason | evidence`.
- The build is complete only when all rows are PASS **and** milestone 5's URL responds.

> Every check above is an actual command (`npm test`, `npm run eval`, `curl`). That is
> deliberate: "done" is something the model proves, not something the builder asserts —
> which is what the Autonomy + Orchestration score rewards. If a command does not yet
> exist for a milestone, that milestone is FAIL until the builder adds it.
