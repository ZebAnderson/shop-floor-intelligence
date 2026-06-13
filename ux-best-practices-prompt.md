# UX Best Practices — Standing Instructions

You are building and editing user-facing interfaces. Apply the following UX
principles to every change you make. These are constraints, not suggestions:
if a change would violate one, fix it or flag it before finishing.

## Operating rules

- **Default to deciding, surface real tradeoffs.** Make the obvious UX call
  yourself. Only stop to ask when two reasonable approaches lead to genuinely
  different product outcomes (e.g. destructive-action confirmation flow,
  multi-step vs. single-page form). State the tradeoff in one line and pick a
  default.
- **Match existing patterns first.** Before inventing a component, check how
  the codebase already handles buttons, forms, modals, spacing, and color.
  Consistency beats novelty. Only introduce a new pattern when nothing existing
  fits, and say so.
- **Never ship a dead end.** Every state a user can reach must have a way
  forward or back. No blank screens, no spinners with no timeout, no errors
  without a next action.

## Core principles

### Hierarchy & layout
- One primary action per screen or section; make it visually dominant. Secondary
  actions are quieter (outline/ghost/text), not competing.
- Group related things; separate unrelated things with whitespace, not borders,
  wherever possible.
- Respect a consistent spacing scale (e.g. 4/8px increments). Don't hand-pick
  arbitrary pixel values.
- Limit line length for body text to ~60–75 characters for readability.

### Feedback & state
- Every interactive element gives immediate feedback: hover, active, focus,
  disabled, and loading states. No element that does something silently.
- Show loading states for anything over ~300ms. Prefer skeletons or inline
  spinners over full-screen blockers.
- Confirm success explicitly (toast, inline message, state change). Don't make
  users guess whether an action worked.
- Optimistic UI where safe; roll back visibly on failure.

### Forms & input
- Label every field (visible label, not just placeholder). Placeholders are
  hints, not labels.
- Validate inline and on blur, not only on submit. Error messages say what's
  wrong AND how to fix it.
- Preserve user input on error — never clear a form a user just filled out.
- Mark required vs. optional explicitly. Use the right input type
  (email/tel/number) and autocomplete attributes.
- Disable the submit button only with a visible reason, or keep it enabled and
  validate on click.

### Errors & edge cases
- Handle the three states every data view has: empty, loading, error. Design all
  three, not just the happy path.
- Empty states explain what goes here and how to add the first item.
- Error messages are human, specific, and actionable. Never expose raw stack
  traces or codes to end users.
- Account for long strings, missing images, zero/one/many counts, and slow
  networks.

### Accessibility (non-negotiable)
- All interactive elements are keyboard reachable and operable; visible focus
  rings (don't remove outlines without replacing them).
- Semantic HTML first (`button`, `nav`, `main`, `label`) before ARIA. Add ARIA
  only to fill gaps.
- Color contrast meets WCAG AA: 4.5:1 for normal text, 3:1 for large text and UI
  components. Never use color as the only signal.
- Images have alt text; decorative images have empty alt. Icon-only buttons have
  accessible names.
- Respects `prefers-reduced-motion`. Touch targets ≥ 44×44px.

### Responsive & performance
- Mobile-first. Test layouts at narrow widths; no horizontal scroll, no
  truncated controls.
- Don't block interaction on non-critical data. Lazy-load below the fold.
- Avoid layout shift — reserve space for images and async content.

### Microcopy
- Buttons describe the action ("Save changes", "Delete project"), not "OK"/
  "Submit".
- Be concise and consistent in voice. Sentence case unless the codebase uses
  otherwise.
- Destructive actions name the consequence ("This permanently deletes 3 files").

## Before you finish, verify
- [ ] Primary action obvious; secondary actions de-emphasized
- [ ] Empty, loading, and error states all handled
- [ ] Full keyboard navigation + visible focus
- [ ] Contrast passes AA; color isn't the only signal
- [ ] Forms: labeled, inline-validated, input-preserving
- [ ] No dead ends; every error has a next step
- [ ] Works at mobile width with no overflow
- [ ] Matches existing component/spacing/color patterns
- [ ] Microcopy is specific and action-oriented

When you're done, briefly note any UX tradeoff you made and anything you
deliberately left for me to decide.
