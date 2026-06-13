# UX Guidelines — Shop Floor Intelligence

The rubric the UI is held to. Grounded in **Nielsen/NN-g's 10 Usability Heuristics**
(the most-cited heuristic-evaluation framework) and 2026 dark-UI / accessibility
practice. Ethos: **no bloat** — every element earns its place or it is cut.

## Product framing (non-negotiable)
- The product is the **autonomous agent loop** (watch → catch → investigate → draft).
  Never present as an "image analyzer" or a "dashboard" (both are banned categories).
- Classification is **plumbing**; the caught event + drafted action are the hero.
- Vision is real **Claude Opus 4.8** — surface it honestly (badge, model id).

## The 10 heuristics, mapped to this app
1. **Visibility of system status** — monitoring pulse, KPI strip, last-sweep time,
   per-machine timeline sparkline. The screen should read as "an agent is watching now."
2. **Match the real world** — shop-floor language (andon, stack light, cell lead, tool
   change, OEE), not dev jargon.
3. **User control & freedom** — on `/live`: clear start/stop, source switch, no traps.
4. **Consistency & standards** — one renderer (`renderAgentReport`), shared tokens,
   consistent state colors everywhere.
5. **Error prevention** — input caps/validation on `/api/vision`; obstruction detected
   so a blocked lens never becomes a false stoppage.
6. **Recognition, not recall** — a status legend; never convey state by color alone.
7. **Flexibility & efficiency** — at-a-glance KPIs first (F-pattern, top-left), drill-down
   second; keyboard reachable.
8. **Aesthetic & minimalist** — industrial control-room identity (monospace chrome,
   dark slate, andon status colors). Long prose uses a readable **sans**; everything else
   stays monospace. No decoration without function.
9. **Help users recover from errors** — clear, non-leaky error messages; graceful empties.
10. **Help & documentation** — a one-line footer explains what the screen is.

## Visual system (tokens)
- Surfaces: `--bg #0e1116`, `--panel #161b22`, `--panel-2 #1c232c`, `--border #2a323c`.
- Text: `--text #e6edf3`, `--muted #9aa6b2` (AA on `--bg`).
- Status: `--run #36d399` (running), `--idle #f2c14e` (idle), `--stop #f2545b` (stopped),
  `--blocked #a78bfa` (camera obstructed). Status is always **color + text/shape**.
- Type: `--font-mono` for chrome/data/IDs/numbers; `--font-sans` for prose
  (`.prose` = briefing lines + drafted action). Avoid AI-slop fonts (Inter/Roboto default,
  purple-gradient-on-dark clichés).
- Radius 4px; generous breathing room; sections separated by hairline borders.

## Accessibility checklist (WCAG-minded)
- Semantic landmarks (`header/section/article/footer`); `aria-live="polite"` on status.
- `aria-label`s on controls; visible `:focus-visible`; full keyboard operability.
- Never rely on color alone — pair every status color with a label and/or icon.
- Maintain ≥ 4.5:1 contrast for body text, ≥ 3:1 for large text/UI.

## Anti-patterns to flag in review
- Dashboard-first / image-analyzer framing anywhere (code comments included).
- Status conveyed only by color. Long prose set in monospace. Decorative motion with no
  meaning. Redundant labels/headers. Generic AI-slop aesthetics. Any element that does not
  help the operator act — cut it.
