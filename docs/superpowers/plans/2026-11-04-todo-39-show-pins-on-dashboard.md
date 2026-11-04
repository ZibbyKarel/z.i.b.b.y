# TODO 39 — Show all pins in the dashboard Pins widget — Implementation Plan

**Goal:** The bridge dashboard's `pins` widget shows every pin from `pins.json` (pages, workflows,
agents), not just page pins. Spec: `docs/superpowers/specs/todo-39.md`.

**Architecture:** Web-only change in `apps/web/features/bridge/widgets/PinsWidget.tsx`. Reads
`usePinsQuery` (all pins), resolves entity names live from `useWorkflowsQuery` / `useAgentsQuery`,
navigates with `router.push`. No contract/API change, no data migration.

**Execution:** Subagent-Driven (one task; executed inline — it is a single small file + test).

## Task 1: PinsWidget renders all pin kinds

**Files:**

- Modify: `apps/web/features/bridge/widgets/PinsWidget.tsx`
- Create: `apps/web/features/bridge/widgets/PinsWidget.test.tsx`
- Modify: `apps/web/i18n/messages/{cs,en}.json` (`bridge.widget.pins.{label,desc}`, `bridge.widgets.pins.kind.*`)

Steps:

1. Write the failing test: mocks `../../pins` (`usePinsQuery`), `../../workflows`, `../../agents/queries`, `next/navigation`;
   asserts one row per pin in pin order with page label / live workflow name / agent id fallback, a kind tag
   per row, a click pushes `/dashboard/...`, `/work/workflows/<id>`, `/workforce/agents/<id>`, and count reports 3.
2. Run it: `pnpm exec vitest run apps/web/features/bridge/widgets/PinsWidget.test.tsx --project web-components` → FAIL.
3. Implement: map all pins → `{ href, label, kind }`; render `BoardRow` with `BoardText` label and a
   `trailing` meta kind tag.
4. Re-run → PASS. Prettier + eslint on changed files, `tsc -p apps/web/tsconfig.json --noEmit`.
5. Commit.
