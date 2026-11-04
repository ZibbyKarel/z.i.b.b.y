# TODO 44 — Runs widget: percent done and elapsed time under the progress bar

Raw item (operator, Czech):

> Widget Behy - pod progress barem budeme mít tyto informace - Kolik procent je hotovo (smažeme počet fází a necháme jen procenta) a jak dlouho task běží

## Meaning

In the dashboard Runs widget (`apps/web/features/bridge/widgets/RunsWidget.tsx`), the meta line
under a running run's progress bar shows only:

- the percent done (the "N/M phases" count is removed), and
- how long the run has been running (elapsed since `startedAt`, live-updating).

## Rulings

- Format: `42% · 3m 12s` (cs: `42 % · 3m 12s`); without a phase list (indeterminate bar) only
  the elapsed time is shown. Elapsed uses the existing `formatDuration` helper.
- Elapsed ticks every second in a tiny leaf component so only that text re-renders.
- Active-but-not-running rows (blocked/thinking/error in the active group) use the same
  percent-only text (no phase count) but no elapsed — the item is about the bar under a running run.
