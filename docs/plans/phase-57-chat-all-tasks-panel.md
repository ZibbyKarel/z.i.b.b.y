# Phase 57 — Chat left panel shows ALL tasks in the project, not just running (line 95)

> TODO (line 95): _"Chat UI - momentálně vidím jen běžící tasky ale měl bych vidět všechny
> tasky ve vybraném projektu (nebo bez projektů) v panelu tasků na levo. Chat UI by mělo být
> plnohodnoté UI."_

## Context

Phase 50 added the left "Běží" rail (`ChatRunningTasks` / `ChatRunningTaskRow`) showing only ACTIVE runs.
The operator now wants the left tasks panel to show ALL tasks in the selected project (or the
no-project scope) — the chat should be a full-fledged UI, not just a running-tasks strip.

⚠️ The chat data-layer + `ChatScreen.tsx` were operator WIP when written. Runs AFTER the operator commits
the chat refactor. RECON the committed state — the operator's refactor may have moved/renamed things
(new `queries/` folder etc.); build on the committed structure.

## Goal

The chat left panel lists ALL tasks/runs in the active-project scope (real project → its runs; null →
unattributed), not just the running ones — grouped or ordered so running/active surface first but
finished/scheduled/etc. are also visible. Clicking a task still navigates to `/runs?run=<id>`.

## Recon (implementer)

- Read the COMMITTED `ChatScreen.tsx` + `ChatRunningTasks.tsx`/`ChatRunningTaskRow.tsx` (Phase 50) and the
  committed chat structure after the operator's refactor.
- Reuse the STABLE `apps/web/features/runs/queries/useRunsQuery.ts` full feed (not just active) + the
  project scope (`useActiveProject`) exactly as Phase 50 did. Consider the runs Screen's own grouping/
  ordering (`statusGroups.ts`, `RUN_STATUS_GROUPS`) so the chat panel matches the app's task grouping.

## Approach

- Generalize the Phase-50 panel from "active only" to "all tasks in scope": drop the active-only filter
  (keep the project scope), and order/group so live tasks are on top (running / awaiting-approval), then
  waiting/scheduled, then finished — reuse `RUN_STATUS_GROUPS`/`runStateTone` so it's consistent with the
  runs feed. Rename the panel/title if "Běží" no longer fits (e.g. "Tasky" / tasks) — i18n cs+en.
- Keep the compact row (glyph/avatar + title + state + progress), glow only when live, row → `/runs?run=`.
  Keep it scrollable; sensible empty state. Keep it additive to `ChatScreen` (a purely-additive edit as in
  Phase 50 — do not disturb the operator's committed chat layout beyond swapping/extending the panel).
- If the operator wants the panel to be richer (a full task list is "plnohodnoté UI"), keep scope tight:
  list + navigate is enough for this item; don't build a second full runs screen inside chat.

## Files
- `apps/web/features/chat/components/ChatRunningTasks.tsx` → generalize (or a renamed `ChatTasksPanel`),
  `ChatRunningTaskRow.tsx` (reuse), their tests.
- `apps/web/features/chat/components/ChatScreen.tsx` (swap/extend the panel — additive, preserve committed layout).
- i18n `apps/web/i18n/messages/{cs,en}.json` (title/empty if renamed).

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/chat`.
- `rtk proxy npx vitest run apps/web/features/chat` green (your tests; note any operator mid-refactor red).
- Manual: open /chat → the left panel lists all tasks in the active project (running first), no-project
  scope works, clicking navigates to /runs; live rows glow, others matte.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style`. Reuse `useRunsQuery` + `runStateTone` +
  `RUN_STATUS_GROUPS` (single sources). Sequenced with Phase 58 (both chat); dispatcher orders them. Don't
  touch non-chat operator WIP (SummaryWidget, machine.*, design/*, RunLogStream).
