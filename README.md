# Shop Floor Intelligence

Built for the Claude Build Day, running on **Claude Opus 4.8**.

An **autonomous shop-floor agent** for high-mix job shops. Cheap webcams plus Claude
vision turn uninstrumented manual machines into monitored ones, set up in plain English.
The agent watches the feed, keeps running notes, **catches a machine stoppage or anomaly
live**, investigates the surrounding frames, and **drafts an action and a shift briefing**
— with cycle count and utilization as supporting context. The user is the line operator
or plant manager; "working" in the demo is the agent catching a stop nobody flagged and
proposing the next step. Frame classification is plumbing underneath this, never the
headline.

## Why this layout

Opus 4.8 is a strong long-horizon runner on its own — better long-context handling,
fewer compactions, and better compaction recovery than prior models, with a 1M-token
context window by default. So the harness here is **not** a crutch for a weak long-runner.
It exists to make "done" something the model *proves* rather than asserts: verifier-gated
milestones, milestone decomposition that caps how far a silent error can propagate, and
file-based memory so a lesson learned once becomes a rule. That is what earns the
Autonomy (15%) and Orchestration (15%) score — a clean, unsteered session log where the
model caught and fixed its own failures against a machine-checkable rubric.

## Structure

- `CLAUDE.md` — the brief Claude Code reads on every run (context + the rules of the loop)
- `rubric.md` — machine-gradable definition of "done" the verifier grades against
- `orchestration/` — the builder→verifier loop, verifier prompt, and how a judge reruns it
- `memory/` — file-based memory: lessons learned, decisions, so mistakes become rules
- `checkpoints/` — verified milestone snapshots (the autonomy trail for the session log)
