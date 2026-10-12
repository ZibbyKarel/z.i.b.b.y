# Spending audit — design

Status: approved in chat 2026-10-12 (operator: "naimplementuj vše").
Department: **fin**. Workflow: `spending-audit`. Run mode: one-off, on demand.

## Goal

Operator uploads N Air Bank PDF statements (or an Air Bank CSV export) covering as long a
period as possible. ZIBBY returns one decision report in the vault:

- recurring payments / subscriptions with keep / cancel / cheaper-alternative recommendation,
- anomalies (duplicates, large purchases, fees, FX, cash, price creep, forgotten trials),
- spending-behaviour advice ("Rohlík + Alza is a lot", "cut down on …") benchmarked against
  income (50/30/20) and the ČSÚ household budget survey for **2 adults + 2 small children**,
- total savings split by certainty tier.

Out of scope: negotiation, browser automation, cancelling anything (all Tier-1; the operator
acts from the report's checklist).

## Approach — hybrid

Agents read PDFs, name merchants, ask questions, research and write prose. **Every number is
computed by a deterministic CLI** (`libs/spend-audit`, bin `spend-audit`, same pattern as
`libs/product-factory`): tool phases run it with `$ZIBBY_RUN_DIR`; it keeps run-wide state in
`$ZIBBY_RUN_DIR/spend/`. No model writes a figure into the report.

## Pipeline

| #   | Phase       | Type                                              | Consumes → Produces              | Notes                                                                                                                                                    |
| --- | ----------- | ------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `extract`   | agent `finance-analyst` (haiku)                   | task.md → `extract.jsonl`        | reads `context/attachments/*`; one `statement` line per statement + one `tx` line per transaction                                                        |
| 2   | `prepare`   | tool `spend-audit prepare`                        | extract.jsonl → `merchants.md`   | zod-validate, reconcile balances per statement, dedupe overlapping statements, anonymise, merchant keys; mismatch → loop to `extract` (2×, then park)    |
| 3   | `classify`  | agent `finance-analyst` (sonnet)                  | merchants.md → `categories.json` | merchant key → display name, category, isService                                                                                                         |
| 4   | `analyze`   | tool `spend-audit analyze`                        | categories.json → `findings.md`  | writes `spend/findings.json`; invalid categories → loop to `classify`                                                                                    |
| 5   | `interview` | agent `finance-analyst` (sonnet), `approval: ask` | findings.md → `needs.md`         | ≤ 15 questions with defaults + fenced ```json decisions; operator answers via "revise with note" (`$ZIBBY_RUN_DIR/interview.note.md`), approve continues |
| 6   | `decide`    | tool `spend-audit decide`                         | needs.md → `research-brief.md`   | validates decisions JSON → `spend/needs.json`; brief holds ONLY service names, prices, requirements (no transactions); invalid → loop to `interview`     |
| 7   | `research`  | agent `market-researcher` (sonnet)                | research-brief.md → `offers.md`  | ≤ 8 items; same-provider cheaper tier, family/shared plans, competitors; URL + checked date + conditions; fenced ```json offers                          |
| 8   | `refute`    | agent `research-skeptic` (opus), `qualify`        | offers.md → `refuted.md`         | re-verifies each offer, sets `verified`; gap → research (2×, then park)                                                                                  |
| 9   | `savings`   | tool `spend-audit savings`                        | refuted.md → `digest.md`         | writes `spend/savings.json`; digest = aggregates + IDs for the writer; invalid offers JSON → loop to `refute`                                            |
| 10  | `advise`    | agent `finance-analyst` (opus)                    | digest.md → `advice.md`          | prose only, every recommendation cites finding IDs `[F-…]`/`[S-…]`; no generic tips                                                                      |
| 11  | `render`    | tool `spend-audit render`                         | advice.md → `report.md`          | tables + numbers from JSON; unknown ID or a Kč figure outside a citation → loop to `advise`                                                              |

Output sink: `report.md` → vault note `spending-audit` with frontmatter `domain: personal`
(grounding never shows it to work runs). Each run replaces the note; per-run history stays in
the run folder.

## Data model (spend/)

`extract.jsonl` lines (agent output, validated by zod):

```
{"kind":"statement","id":"2026-01","from":"2026-01-01","to":"2026-01-31","opening":12345.67,"closing":2345.6,"credits":50000,"debits":-60000.07}
{"kind":"tx","statement":"2026-01","date":"2026-01-03","amount":-299,"currency":"CZK","origAmount":-11.99,"origCurrency":"EUR","type":"card","counterparty":"NETFLIX.COM","account":null,"message":""}
```

`type ∈ card | transfer | direct-debit | standing-order | cash | fee | income | other`.

`prepare` → `spend/transactions.json` (`Tx` + `merchant` key + `household` flag; account
numbers replaced by `acct-<sha1 8>`), `spend/statements.json`, `merchants.md` (table: key,
sample raw counterparty, count, total).

`categories.json`: `{ "<merchantKey>": { "name": "Netflix", "category": "<CategoryId>", "service": true } }`.

Categories (fixed enum, each mapped to a 50/30/20 bucket and a COICOP division):
groceries, food-delivery, restaurants, eshop, household-goods, kids, clothing, housing,
energy, telco, streaming, software-cloud, other-subscriptions, transport-fuel,
transport-ride, transport-public, health, education, leisure, travel, insurance, financial,
gifts-charity, cash, household-transfer, savings-investment, income, other.

## Analyses (`analyze`, all deterministic, unit-tested)

| ID prefix      | Rule                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R-` recurring | same merchant, ≥ 3 payments (yearly ≥ 2); median interval in 6–8 / 27–33 / 85–95 / 355–375 days; amount spread < 15 %. Active = last payment newer than 1.5× cadence before period end |
| price creep    | current vs first price of an active recurring payment                                                                                                                                  |
| trial          | recurring first seen within last 90 days, or first amount < 50 % of current                                                                                                            |
| `D-` duplicate | same merchant + amount, ≤ 3 days apart, merchant not recurring; refund of same amount within 30 days → resolved                                                                        |
| `L-` large     | > max(5 000 Kč, p99 of debits) or > 3× the category's monthly median                                                                                                                   |
| `C-` category  | monthly series, 3-month rolling mean, YoY (≥ 13 months), trend slope %/year                                                                                                            |
| micro          | debits < 200 Kč — count + sum per category and merchant                                                                                                                                |
| top            | top 10 merchants by sum and by count, orders/month                                                                                                                                     |
| fees / FX      | sum of `fee` type, volume of non-CZK payments                                                                                                                                          |
| opaque         | cash + household transfers, share of debits                                                                                                                                            |
| cashflow       | income (excl. own transfers), debits, savings rate, fixed (recurring + direct debit + standing order) vs variable, 50/30/20 split                                                      |
| benchmark      | category vs ČSÚ per person × 4; flagged when > 120 % **and** > 1 000 Kč/month over                                                                                                     |

ČSÚ data: static `libs/spend-audit/data/csu-benchmark.json` with year, source URL, household
type and per-person monthly values per COICOP division.

## Savings tiers (`savings`)

- **certain** — cancellations the operator confirmed (annualised) + confirmed duplicates (one-off refund).
- **verified** — best verified offer per item: `(current − offer) × 12` (24-month figure includes
  activation fee and post-promo price).
- **target** — for flagged categories: down to benchmark, or the operator's own target from `needs.json`.
- **possible** — unanswered items and unverified offers.

Headline = certain + verified. Target shown separately.

## Interfaces (fenced JSON blocks the CLI parses)

`needs.md` → ```json `{ "decisions": [{ "id": "R-netflix", "decision": "keep|cancel|cheaper|unknown", "requirements": "" }], "duplicates": [{ "id": "D-1", "confirmed": true }], "categories": [{ "id": "C-food-delivery", "decision": "cut|ok", "targetMonthly": 1500 }] }`.

`offers.md` / `refuted.md` → ```json `{ "offers": [{ "item": "R-netflix", "provider": "", "plan": "", "monthly": 0, "activationFee": 0, "promoMonthly": null, "promoMonths": null, "url": "", "checkedAt": "YYYY-MM-DD", "conditions": "", "missing": "", "verified": false }] }`.

## Platform changes

1. **Workflow attachments** — `TaskSchedulerService.dispatch` passes `runAttachments` to
   `WorkflowRunnerService.start`, which copies them into `<run>/context/attachments/` (already
   symlinked into every stage) and appends their relative paths to the first phase input.
2. **Vault sink frontmatter** — the `file`/`vault` output parses the source's frontmatter
   (gray-matter) and passes it to `createNote`/`updateNote`, so a report can declare
   `domain: personal`.
3. **gitignore** — `.zibby/data/vault/knowledge/spending-audit*.md` (the knowledge tier is tracked).
4. **fin mandate** extended with the operator's personal finances; new agent
   `finance-analyst` + employee in `fin`.

## Privacy

PDFs stay local (`tasks/attachments`, gitignored). Only `extract` is instructed to open them;
this is an instruction-level guarantee (the attachments folder is visible to every stage).
After `prepare` all agents see anonymised data; `research` sees only the brief. Report is a
personal-domain note, gitignored.

## Testing

Vitest in `libs/spend-audit` over synthetic fixtures: recurring + cadence, price creep,
trial, duplicate with refund, overlapping statements, reconcile mismatch, household transfer,
savings tiers, render ID check. Contract test that `spending-audit.workflow.md` parses.
API unit tests for attachments → `context/attachments` and vault sink frontmatter.
