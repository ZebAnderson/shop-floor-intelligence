# Brief — Shop Floor Intelligence

*Judge-facing product brief. The machine-gradable definition of "done" lives in
[`rubric.md`](./rubric.md); the agent's operating rules live in [`CLAUDE.md`](./CLAUDE.md).*

## What it is
An **autonomous shop-floor agent** for high-mix job shops. A cheap webcam points at an
uninstrumented manual machine; Claude vision reads the feed; an agent watches it the way
a floor supervisor would — keeping running notes, **catching a stoppage or anomaly the
moment it happens**, investigating the surrounding frames, and **drafting an action plus
a shift briefing**. Cycle count and utilization come along as supporting context.

## Who it's for
The **line operator** who can't watch every machine and the **plant manager** who today
finds out a machine sat idle only when a part is late. The win: they learn about an idle
or stopped machine in minutes, with a proposed next step already drafted.

## The demo (anomaly-led)
1. The agent watches a fixture feed of a cyclically-running machine.
2. The machine stops. The agent **catches it live** — no human flagged it.
3. It investigates the recent frames, classifies the likely cause, and **drafts an
   action** ("Line 2 idle ~6 min — likely tool change; notify cell lead") plus a briefing
   entry. Utilization/cycle stats are shown as supporting context.

## What this is *not*
Not an image analyzer, not a dashboard — both are banned categories. Frame classification
(running / idle / other) is **plumbing** the agent uses; the product is the autonomous
watch → notice → investigate → draft-action loop. The UI surfaces the agent's output; it
is not the product.

## How "done" is proven
Every milestone in `rubric.md` is checked by an independent **verifier subagent** that runs
the actual command (`npm test`, `npm run eval`, `curl` the live URL) — completion is proven
by the model, not asserted by the builder. The build stops only when the rubric is all-PASS
and the deployed Vercel URL returns 200.

## Stack
Next.js (App Router) on Vercel. Vision via the Claude Messages API (`claude-opus-4-8`).
Built end-to-end during the Build Day on 2026-06-13.
