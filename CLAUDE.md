# Brief for Claude Code — Shop Floor Intelligence

## The problem
High-mix job shops run manual machines with no instrumentation: when a machine stops —
a tool change, a jam, an operator stepping away — nobody knows until someone walks the
floor or the part is late. The plant manager has no live picture of what's actually
running, and the line operator can't be everywhere. This project points a cheap webcam
at each machine and runs an autonomous agent that watches the feed, catches stoppages
and anomalies as they happen, investigates them, and drafts the next action plus a shift
briefing — so the manager learns about an idle machine in minutes, not at end of shift.

## The product is the agent, not the classifier
The headline is the **autonomous watch → notice → investigate → draft-action loop**.
Frame classification (running/idle/other) is plumbing the agent uses; never frame the
demo, UI, or README as an "image analyzer" or a dashboard — those categories are banned.
The demo leads on the live anomaly catch and the drafted briefing.

## What "done" looks like
The build is done when **every milestone in `rubric.md` passes verification by the
verifier sub-agent**, the app is deployed to a live URL, and that URL responds. Do
not stop on your own judgment that it "looks good" — stop only when the rubric is green.

## How to work
1. Work **one milestone at a time** from `rubric.md`. Build them in order.
2. After each milestone, **spawn the verifier subagent** (`orchestration/verifier.md`)
   in a fresh context to grade your work against the rubric. Do not self-grade —
   independent grading beats self-critique. (Spawn it explicitly every time; do not skip
   it because the work looks done.)
3. If the verifier fails you, read its reasons, fix, and re-verify. Max 3 attempts
   per milestone before you stop and flag for a human.
4. On a pass: write a checkpoint to `checkpoints/`, append what you learned to
   `memory/LESSONS.md`, then move to the next milestone.
5. Before starting any milestone, **read `memory/LESSONS.md`** so you don't re-make a
   solved mistake.

## Operating on Opus 4.8 (read this — the run is tuned for it)
- **Effort:** run the build at **`xhigh`** effort (best for coding/agentic work; the
  surface default is only `high`). `/fast` (fast mode) is available on Opus 4.8 if you
  want higher output speed during long stretches.
- **Thinking:** use adaptive thinking on multi-step milestones (ingest pipeline, the
  agent loop, deploy debugging). Respond directly on simple lookups.
- **Spawn the verifier explicitly:** Opus 4.8 spawns *fewer* subagents by default, so the
  rule in step 2 is deliberate — always spawn the verifier subagent in a fresh context
  after each milestone. Fan out subagents when reading several fixtures/files at once.
- **Instructions are read literally:** state scope explicitly. When something should apply
  to every milestone, every section, or every fixture, say "every" — Opus 4.8 will not
  silently generalize from one item to the rest, and it won't infer requests you didn't make.
- **Say what to do, not what to avoid:** prefer positive instructions. The one rule kept
  as a negative is load-bearing: **do not stop on your own judgment that it "looks good" —
  stop only when the rubric is all-PASS and the live URL responds.**
- **Specify upfront:** Opus 4.8 maximizes autonomy and token efficiency when intent and
  constraints are given in the first turn. The kickoff `/goal` carries the full goal; once
  it's running, intervene only to supply *new information*, not to steer.

## UI design direction (do not use the default house style)
Opus 4.8's default frontend look is warm cream / serif / terracotta — good for editorial,
**wrong for an industrial monitoring UI.** Build the UI as a dark control-room surface:
near-black background (~`#0E1116`), slate panels, and a single high-visibility status
accent that maps to machine state (green = running, amber = idle/anomaly, red = stopped).
Use a monospace or condensed sans for readouts and timestamps. Specify this concretely in
code; generic "make it clean/minimal" will not override the default — a concrete palette will.

## Image analysis
This project uses vision/image analysis on shop-floor imagery. Permission to use it was
granted by the Anthropic team on-site at the Build Day on 2026-06-13.
<!-- TODO (Zeb): paste the exact name/channel of the written confirmation here. -->

## Hard constraints
- Public repo. The demo must show only what was built today; keep contributions clear.
- Deploy target: **Vercel** (Next.js App Router) with a responding HTTPS URL. The
  `ANTHROPIC_API_KEY` lives in Vercel env vars and is never committed.
