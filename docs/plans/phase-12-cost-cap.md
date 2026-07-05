# Fáze 12 — Dolarový cost cap napojený na spend-past-cap gate

## Nálezy z investigace (Fáze 0)

- **`costUsd` SE už počítá** — `apps/api/src/runner/runner-core.ts` (~ř. 930, 993)
  parsuje cenu z `result` eventů Claude streamu (`extractResultCost`) a akumuluje do
  `run.costUsd` (přežívá respawny); pipeline stage records ji kopírují
  (`pipeline-runner.service.ts:1548`), `task-runs.service.ts` ji promítá do
  `TaskRun.costUsd` (agent run přímo, pipeline run součet fází). Fáze 12 tedy řeší
  **jen agregaci a cap**, ne výpočet.
- **Budget systém (Phase 8.1)**: `ProjectBudgetSchema`
  (libs/contracts/src/projects/project.schema.ts:85) = run-count capy
  (`dailyRuns`/`weeklyRuns`/`monthlyRuns`/`maxConcurrent`); komentář na ř. 91 („the
  budget unit is runs, never dollars") je po této fázi zastaralý — přepsat.
  `GlobalBudgetSchema` (budget.schema.ts) = pause-percenta účtu, těch se fáze
  nedotýká. `BudgetLedgerStore` (apps/api/src/budget/ledger.store.ts) = append-only
  `<YYYY-MM-DD>.jsonl` dispatch ledger (Europe/Prague okna), `countDaily/Weekly/Monthly`
  počítají VŠECHNY řádky s daným projectId. `BudgetService.check()` fail-closed;
  `task-scheduler.service.ts` při over-cap volá `holdForApproval` →
  `gates.evaluate(floor, { action: "spend-past-cap" })` (dnes bez `metrics`) +
  `approvals.requestApproval` (Tier-3). `IntendedActionSchema`
  (gate.schema.ts:101-108) už má volné `metrics: z.record(z.string(), z.number())`.
- **Kudy teče dokončení runu**: dispatch zapisuje ledger v
  `task-scheduler.recordLedger` a `goal-runner.recordDispatch`; scheduler po
  dispatchi spouští `reconcileOutcome(task)` — sleduje běh do terminálního stavu
  (ověřit přesný mechanismus při implementaci). To je kandidát na JEDNO místo, kde je
  po doběhu k dispozici `projectId` i finální `costUsd` (z TaskRun projekce).

## Rozhodnutí

1. **Jedno rozšířené schéma, žádný paralelní systém.** Dolarové capy jdou do
   `ProjectBudgetSchema` vedle run-count capů; status do
   `ProjectBudgetStatusSchema` vedle count oken.
2. **Cost řádky jedou stejným ledgerem.** `BudgetLedgerStore` dostane druhý typ
   řádku (`type: "cost"`) zapisovaný po DOBĚHU runu s `costUsd`. Stávající řádky typ
   nemají → counting filtruje `type !== "cost"` (zpětně kompatibilní), nová suma
   `sumCostDaily/Weekly/Monthly` čte jen cost řádky. Okna a Prague-day soubory se
   znovu použijí beze změny.
3. **Odhad před dispatchem = spentUsd + průměrná cena runu projektu** (průměr cost
   řádků v běžícím okně; žádný cost řádek → odhad = spentUsd). Překročení capu →
   stejný `holdForApproval` flow, jen `gates.evaluate` dostane
   `metrics: { costUsd, capUsd }` a detail nese dolarové znění. Žádná nová
   schvalovací logika.
4. **Fail-closed zůstává** — nečitelný ledger při cost checku drží dispatch stejně
   jako u count checků.

## Kroky

### 1. Kontrakty (`libs/contracts`)

- `ProjectBudgetSchema` += `dailyCostCapUsd` / `weeklyCostCapUsd` /
  `monthlyCostCapUsd` (`z.number().positive().optional()`); aktualizovat JSDoc
  (jednotka je runs NEBO dolary, obě volitelné, `.strict()` zůstává).
- `budget.schema.ts`: nový `CostWindowUsageSchema = { spentUsd: number; capUsd?: number }`;
  `ProjectBudgetStatusSchema` += volitelné `dailyCost` / `weeklyCost` / `monthlyCost`
  (optional = zpětná kompatibilita se staršími klienty i test fixtures).
- Contract testy rozšířit (validní/invalidní capy, status s/bez cost oken).

### 2. Ledger (`apps/api/src/budget/ledger.store.ts`)

- `LedgerEntry` += volitelné `type?: "dispatch" | "cost"` a `costUsd?: number`
  (dispatch řádky dál bez type — nic se nemigruje).
- `countAcross` přeskočí `type === "cost"`. Nové `recordCost(entry)` a
  `sumCostDaily/Weekly/Monthly(projectId, now)` (stejné window helpery). Testy:
  míchané soubory count vs. sum, tolerantní čtení, fail-closed.

### 3. Zápis cost řádku po doběhu

- Najít místo, kde scheduler zjistí terminální stav runu s dostupnou cenou
  (`reconcileOutcome` v `task-scheduler.service.ts`; pro goal runy ekvivalent v
  `goal-runner.service.ts` — pokud tam doběh není sledován, zapsat cost jen z
  scheduler cesty a poznamenat to v kódu). Zapsat
  `{ type: "cost", projectId, taskId, runRef, kind, costUsd }` jen když
  `costUsd != null` a `projectId` existuje. Zápis awaited-best-effort (chyba loguje,
  neshazuje reconcile).

### 4. BudgetService

- `check(projectId)`: po count checcích dolarové checky — pro každé okno s
  nastaveným capem: `spent = sumCostX`, `estimate = spent + avgCostPerRun(okno)`;
  `estimate > cap` → `over("project-daily-cost" | "project-weekly-cost" |
  "project-monthly-cost", detail)` a nově vracet i
  `metrics: { costUsd: estimate, capUsd: cap }` (rozšířit `BudgetCheck` o volitelné
  metrics).
- `status()`: doplnit cost okna (`spentUsd` ze sum, `capUsd` z project.budget).
- Testy: pod capem prochází, nad capem drží s metrics, bez capů se cost check
  nespouští, fail-closed.

### 5. Scheduler → gate

- `task-scheduler.service.ts`: `holdForApproval` přijme volitelné metrics a předá je
  `this.gates.evaluate(floor, { action: SPEND_PAST_CAP, metrics })`; detail approvalu
  nese `$spent/$cap`. Volající místa propagují metrics z `BudgetCheck`. Žádná změna
  `approvals.service.ts`.

### 6. UI

- Najít, kde web renderuje `BudgetStatusSchema` (grep `BudgetStatus` /
  `useBudget*Query` v `apps/web`) a vedle count oken zobrazit cost okna
  (`$X.XX / $Y`), jen když jsou přítomná. Formátování ceny sjednotit s existujícím
  `costUsd` zobrazením z Fáze 03 (`formatCostUsd`, pokud existuje — reuse).
- Settings/Projects formulář budgetu: pole pro tři cost capy vedle run capů
  (`@zibby/forms` vzor stávajících polí).
- i18n klíče cs+en.

## Definition of done

`pnpm lint && pnpm typecheck && pnpm test` zelené; projekt s `dailyCostCapUsd`
překročeným drží dispatch za `spend-past-cap` approvalem s
`metrics: { costUsd, capUsd }`; projekt bez cost capů se chová beze změny; ledger
count čísla se přidáním cost řádků nemění.
