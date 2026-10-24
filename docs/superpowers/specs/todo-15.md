# TODO 15 — Budget & limits widget

**Raw TODO item:** Widget co zobrazuje budgety a limity per project / firmu a zvýrazňuje ty, které se
blíží k vyčerpání nebo jsou vyčerpány

## Interpretation (night-run rulings, operator asleep)

- The data already exists. `GET /api/budget` (`useBudgetQuery`) returns the global account
  limits (5h rolling and weekly utilization, with the operator's warn and pause thresholds) and one
  `ProjectBudgetStatus` per project:
  - run-count windows `daily`, `weekly` and `monthly`, each `{used, cap?}`;
  - dollar windows `dailyCost`, `weeklyCost` and `monthlyCost`, each `{spentUsd, capUsd?}`;
  - a `held` count, the tasks held over a cap.
- Companies have no pool cap of their own. A company's `budget` is the default its projects
  inherit. "Per firmu" therefore means a **company rollup**: sum the member projects' usage and
  their defined caps, exactly as `/governance/budgets` (`LedgerBudgetsScreen.sumUsage`) does.
- **Web only, no API change.** A new Bridge widget `budgets` reads the budget, projects and
  companies queries.

## Requirements

1. **Widget `budgets`.**
   - Labels: cs "Budgety a limity" / en "Budgets & limits".
   - Description: cs "Čerpání budgetů a limitů po projektech a firmách — zvýrazní, co dochází." /
     en "Budget and limit usage per project and company — highlights what is running out."
   - Add it to the `BridgeWidgetSchema` type enum and the exhaustive `WIDGETS` registry.
2. **Rows.** There are three kinds:
   - **Account limits:** two rows, "Limit 5 h" / "5h limit" and "Týdenní limit" / "Weekly limit",
     from `global.rolling` and `global.weekly` (`LimitWindow` utilization percent).
     - They are shown only when `global.stale` is false.
     - If `global.stale` is true, neither row is shown and the header aside reads "limity
       neznámé" / "limits unknown" (unless the "{n} vyčerpáno" aside applies, which wins).
   - **Company rollups:** one row per company with at least one member project that has any
     defined cap.
   - **Projects:** one row per project with at least one defined cap (run count or dollars). An
     uncapped project with `held > 0` is also shown.
3. **Health of a row** (a pure function in `apps/web/features/budget/budgetHealth.ts`).
   - The ratio for each capped axis is `used / cap` (or `spentUsd / capUsd`). The row's ratio is
     the **worst** of them, and the row names that worst axis:
     - runs: "dnes" / "today", "týden" / "week", "měsíc" / "month";
     - dollars: the same labels followed by " $".
   - Status:
     - `exhausted` when the worst ratio is ≥ 1, or when `held > 0`;
     - `near` when the worst ratio is ≥ 0.8;
     - otherwise `ok`.
   - For account limits, utilization is a percent `p`:
     - `exhausted` when `global.paused` is true, or when `p` ≥ the window's `pauseAt*Pct`
       (default 100);
     - `near` when `p` ≥ the window's `warnAt*Pct` (default 80);
     - otherwise `ok`.
   - Company rollup: the sum of member `used` against the sum of member defined caps, per axis
     (an uncapped member contributes to neither side). `held` is the sum. Then the same rules
     apply.
4. **Each row** shows:
   - the name;
   - a status badge: cs "vyčerpáno" / en "exhausted", cs "dochází" / en "running low",
     nothing for `ok`;
   - the worst axis as `used/cap` (dollars as `$12.30/$50`) with its axis label;
   - the percent.
   - A `held > 0` row also shows cs "{n} čeká nad limitem" / en "{n} held over cap".
   - Rows link to the detail page: a project → `/projects/<id>`, a company → `/companies/<id>`,
     account limits → `/governance/budgets`.
   - Use DS primitives (Progress with `tone` from the status, Badge/Typography), testid enum, no
     inline style.
5. **Order:** account limits first. Then the remaining rows: `exhausted`, then `near`, then `ok`.
   Inside a status, the higher ratio comes first, then the name ascending.
6. **Header:**
   - `count` = the number of rows;
   - `you` = the number of `exhausted` + `near` rows;
   - aside: cs "{n} vyčerpáno" / en "{n} exhausted" when any row is exhausted.
   - Empty (no rows at all) reports `empty`, with the body text cs "Žádné budgety ani limity
     nejsou nastavené." / en "No budgets or limits are set."
   - Loading reports `loading`. A query error renders QueryError and reports `failed`.
7. **Freshness:** reuse the existing `useBudgetQuery` cadence. No new polling.
8. Every string goes through next-intl in cs and en. Testids use a `BudgetsWidgetTestId` enum.
