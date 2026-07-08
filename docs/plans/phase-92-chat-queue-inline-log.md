# Phase 92 — Chat left queue: expand a task inline to its live log

> Design doc layout, left column: "fronta úkolů — running/error/queued/done, expandable inline
> to a live log. This reuses the existing Runs & Activity / RunLogStream behavior; it is not a
> new component, just relocated." RECON: `ChatTasksPanel` (phase 57) already IS the left queue
> with statuses — the only missing piece is inline expansion to the live log. Smallest phase
> of the arc, shipped last deliberately.

## 1 — `ChatTasksPanel` expansion

- Each task row gains an expand affordance (chevron, the accordion idiom from phase-46
  timeline-accordion-log) — expanding mounts `RunLogStream` for that task's run inline under
  the row (bounded height, `followTail`), collapsing unmounts it (no hidden polling).
- One row expanded at a time (accordion) — keeps the narrow column readable and polling
  bounded.
- Done/parked rows expand to the same stream (it serves the finished log too) — the phase-58
  ⌘K detail dialog stays the deep-dive; this is the glance.
- Row click behavior today (whatever navigation/selection it does) must be preserved —
  expansion is the chevron's job, not the row's.

## Tests

- Expand mounts `RunLogStream` with the right runId; second expand collapses the first.
- Collapse unmounts (assert polling hook not active — mock `useRunLog`).
- Existing `ChatTasksPanel` tests keep passing unmodified where behavior is untouched.

## Verification (paste real output)

- `npx tsc -p` web — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/chat` — green.
- Visual: screenshot of the chat with one queue row expanded showing a live tail.

## Constraints

- No fork of `RunLogStream`; no new transport; accordion single-expansion.
- Keep the panel `lg:`-gated as today (mobile chat layout unchanged — the drawer's mobile
  question is still open and this panel follows whatever that decision lands on later).
