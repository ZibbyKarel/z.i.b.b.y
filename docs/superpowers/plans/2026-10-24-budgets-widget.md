# Budgets & Limits Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bridge widget `budgets` lists account limits, company rollups and project budgets.
It highlights what is near exhaustion (≥ 80 %) or exhausted (≥ 100 %, held, or paused).

**Architecture:** Web only. A pure `budgetHealth.ts` turns the existing `GET /api/budget`
readout, plus the projects and companies lists, into ordered rows with a status. `BudgetsWidget`
renders those rows and reports the header through `useWidgetReport`. There is no API or contract
change except adding `"budgets"` to the `BridgeWidgetSchema` type enum.

**Tech Stack:** Next.js 15, React 19, TanStack Query, next-intl, DS (`Progress` with `tone`,
`Badge`, `Typography`), Zod 4.

**Spec:** `docs/superpowers/specs/todo-15.md` is binding. The exact copy, thresholds and order
are there.

## Global Constraints

- pnpm only. No `any`. No `forwardRef`. No inline `style` on DOM in `apps/web`. Every string
  goes through next-intl in cs and en.
- Do not add new polling. Reuse `useBudgetQuery`, `useProjectsQuery` and `useCompaniesQuery`
  as they are.
- Run prettier and eslint on changed files, plus the related tests (`--project web-components`
  for widget tests). `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` and
  `-p libs/contracts/tsconfig.json` must exit 0.
- Never use `--no-verify`. Never edit `.zibby/data` by hand, except for the regenerated
  `self-knowledge.md` when the gate demands it (`graphify update .`, then
  `pnpm self-knowledge:generate`). Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A project whose only cap is in dollars (`monthlyCost.capUsd`) still appears. Its worst axis is
  shown as `$x/$y` with the "měsíc $" / "month $" label.
- A company with one capped and one uncapped member: the rollup ratio uses only the capped
  member's cap as the denominator, but sums usage only from members on that axis that have a cap
  (`LedgerBudgetsScreen.sumUsage` semantics: an uncapped member adds 0 to both sides).
- `global.stale = true`: no account-limit rows, and the aside reads "limits unknown" unless the
  exhausted aside wins.
- A `cap` of 0 never appears (the schema says positive). Usage above the cap clamps the Progress
  bar at 100 %, but the percent text shows the real value (e.g. 130 %).
- `held > 0` on an uncapped project yields an `exhausted` row with the held copy.

---

### Task 1: `budgetHealth` + `BudgetsWidget`

**Files:**

- Create `apps/web/features/budget/budgetHealth.ts` and `budgetHealth.test.ts`. The tests live
  in whichever vitest project covers `apps/web/features` non-component files; check
  `vitest.workspace` / `widgets.test.tsx` neighbours.
- Create `apps/web/features/bridge/widgets/BudgetsWidget.tsx` and `BudgetsWidget.test.tsx`.
- Modify `libs/contracts/src/system/system.schema.ts`: add `"budgets"` to the `BridgeWidgetSchema`
  type enum, and add a schema test that `{ type: "budgets" }` parses, next to the existing ones.
- Modify `apps/web/features/bridge/widgets/registry.tsx`: add the entry.
- Modify `apps/web/i18n/messages/{cs,en}.json`. Follow the existing split:
  - `bridge.widget.budgets.{label,desc}` holds the label and description;
  - `bridge.widgets.budgets.*` holds the body copy.
- If any exhaustive widget list elsewhere breaks `tsc` (palette, layout defaults), extend it.

**Interfaces (produced):**

```ts
export type BudgetRowKind = "limit" | "company" | "project";
export type BudgetStatus = "ok" | "near" | "exhausted";
export type BudgetAxis =
  | "daily"
  | "weekly"
  | "monthly"
  | "dailyCost"
  | "weeklyCost"
  | "monthlyCost"
  | "rolling"
  | "weeklyLimit";
export interface BudgetHealthRow {
  kind: BudgetRowKind;
  id: string; // projectId | companyId | "rolling" | "weekly"
  name: string; // limit rows: "" (the widget supplies the i18n label)
  status: BudgetStatus;
  ratio: number; // worst ratio; limit rows = usedPct / 100
  axis: BudgetAxis;
  used: number; // runs, USD or percent
  cap: number; // positive; limit rows = 100
  held: number;
}
export function buildBudgetRows(input: {
  budget: BudgetStatus /* the contracts type, imported as an alias */;
  projects: ReadonlyArray<{ id: string; companyId?: string | null }>;
  companies: ReadonlyArray<{ id: string; name: string }>;
}): { rows: BudgetHealthRow[]; limitsUnknown: boolean };
export const NEAR_RATIO = 0.8;
```

The contracts' `BudgetStatus` type name collides with the local status union. Import it as
`type BudgetStatus as BudgetReadout`.

- [ ] **Step 1: Failing tests** in `budgetHealth.test.ts`:
  - **Statuses:**
    - 7/10 → `ok`;
    - 8/10 → `near`;
    - 10/10 → `exhausted`;
    - an uncapped project with `held: 2` → `exhausted`, axis `daily`, and `used` = that axis's
      used.
  - **Worst axis:** `daily` 1/10 with `monthlyCost` 45/50 → axis `monthlyCost`, ratio 0.9, `near`.
  - **Filtering:** a project with no caps and `held: 0` is omitted.
  - **Company rollup:**
    - member A has daily 5/10, member B is uncapped with daily used 7 → the rollup has daily 5/10;
    - a company with no capped members is omitted.
  - **Limits:**
    - `usedPct` 85 with `warnAtRollingPct` unset → `near`;
    - `usedPct` 50 with `warnAtRollingPct` 40 → `near`;
    - `usedPct` 70 with `pauseAtRollingPct` 70 → `exhausted`;
    - `paused: true` → both limit rows `exhausted`;
    - `stale: true` → no limit rows and `limitsUnknown: true`.
  - **Order:** limits first, then exhausted, near and ok. Inside a status, ratio descending, then
    name ascending.
- [ ] **Step 2: Failing tests** in `BudgetsWidget.test.tsx`. Mock the three query hooks the way
      `TeamKbWidget.test.tsx` / `TodoWidget.test.tsx` do.
  - Each row shows:
    - the name (limit rows show the i18n label);
    - the badge copy for `exhausted` and `near`, and no badge for `ok`;
    - `used/cap` for runs and `$12.30/$50` for dollars, together with the axis label;
    - the percent;
    - the held copy when `held > 0`.
  - Hrefs: a project goes to `/projects/<id>`, a company to `/companies/<id>`, and limit rows to
    `/governance/budgets`.
  - Header report: `count` = the number of rows, `you` = exhausted + near, and the aside is
    "{n} exhausted" when any row is exhausted, else "limits unknown" when stale.
  - Empty state copy + `empty` reported. Loading reports `loading`. A query error renders
    QueryError and reports `failed`.
- [ ] **Step 3:** Run the tests and confirm they FAIL. Then implement, and confirm they PASS.
  - Format dollars with `Intl.NumberFormat(locale, { style: "currency", currency: "USD" })`
    using the next-intl locale. Trailing zero cents may be dropped for whole caps, as long as the
    tests assert what the formatter produces.
  - Progress `tone`: `exhausted` → `bad`, `near` → `warn`, `ok` → `ok`, with the value clamped to
    0–100.
- [ ] **Step 4:** `tsc` for web and contracts exits 0. Run prettier and eslint, then the related
      tests.
- [ ] **Step 5:** Commit `feat(web): Bridge widget Budgety a limity — highlights budgets and limits running out`.
