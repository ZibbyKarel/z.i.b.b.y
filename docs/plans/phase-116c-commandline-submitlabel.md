# Phase 116c — CommandLine `submitLabel` prop

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`.

## Goal
Let a host override the CommandLine submit-button label (e.g. "Naplánovat" / "Save") without
changing the global `classifyRun`/`commandLine.send` translations. Action is unchanged — the host
still gets the value via `onSubmit` (send-delegation mode).

## Change — `apps/web/features/tasks/components/CommandLine/CommandLine.tsx`
1. Add to `CommandLineProps`: `submitLabel?: string;` with a docstring: *"Overrides the run/submit
   button label. Label only — the submit action is still whatever the mode dictates (in
   send-delegation mode, `onSubmit`). Defaults to the classify/send translation."*
2. In the label computation (currently `const runLabel = isLoop ? t("loop.submit") : t("classifyRun");`,
   ~L629): make `submitLabel` win when provided:
   `const runLabel = submitLabel ?? (isLoop ? t("loop.submit") : t("classifyRun"));`
3. Send-delegation branch (the plain `Button`, ~L1120-1129) currently renders `t("commandLine.send")`.
   Make it render `submitLabel ?? t("commandLine.send")`.
4. Default (task-launch) `DropDownButton` (~L1131-1141) uses `runLabel` — already covered by (2).
5. Do not change any other behaviour. Keep the existing `Send` testid on the send-mode button.

## Tests
- Add/extend `CommandLine.test.tsx`: when `submitLabel="Naplánovat"` and `onSubmit` is provided,
  the submit button shows "Naplánovat". Keep existing tests green (default label unchanged when
  `submitLabel` omitted).

## Verify
`pnpm check:types && pnpm web:test` (CommandLine suite green; no regressions in NewTaskDialog/chat
call sites, which don't pass `submitLabel`).

## Notes
This phase touches only CommandLine — safe to run in parallel with 116a/116f.
