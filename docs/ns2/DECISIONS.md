# NS2 — Operator Decision Log

> Append-only. Every operator ruling that shapes the federation implementation lands
> here with its date, so no successor session re-litigates a settled question.

## 2026-07-17 — kickoff rulings

1. **Parked branches:** delete — the arcs were merged into main by hand. (Executed:
   20 branches verified patch-equivalent and deleted; 5 kept with unmerged patches —
   list in `docs/ns2/PROGRESS.md`.)
2. **PR tier:** unify — PRs may open automatically (Tier-2) everywhere; **new
   per-project setting decides draft vs. ready PR** (`prOpenMode`, default `ready`).
   Merge remains the operator's, `pr.merge` locked deny.
3. **`discovery/` module:** delete.
4. **New subsystems:** approved to design beyond the original 8 — seated by this
   arc: **codex** (memory), **ledger** (budget/limits) in F1; **hearth** (personal
   domain) in F8.
5. **Main branch:** leave untouched; all implementation on branch `north-star-2`;
   operator merges via PR.
6. **Working mode:** orchestrator (Fable) plans/reviews/delegates only — no direct
   coding, no long-file reads; Opus for plans, Sonnet for implementation; durable
   progress in `docs/ns2/`; operator wants only status tables printed, no
   mid-implementation questions.

## 2026-07-30 — F9 ruling: subsystem-only dispatch

1. **The global switchboard assigns SUBSYSTEMS ONLY.** _"Každý agent a pipeline by
   měl být přiřazen do některého ze subsystémů. Nesmíme mít volné agenty a
   pipeliny."_ Concrete agents/pipelines leave the stage-1 catalog entirely; the
   subsystem that owns the units picks the unit.
2. **No free units.** Every stored agent and pipeline carries an `ownerSubsystem`.
   Enforced on the write path (both create endpoints 422) and structurally — an
   unowned unit is unroutable because nothing offers it.
3. **Every dispatchable subsystem carries a complexity ladder** — agents plus two
   to three pipelines ordered cheapest/shortest → most expensive/deepest, so a
   task can be graded onto a single agent, a cheap pipeline, or a deep one.
   Non-dispatchable by design: **beacon** (the Tier-3 surface-and-wait contract,
   not a work-doer) and **ledger** (a budget/limits service).
4. **Fleet policy is prune, not widen.** The federation is organised by ZIBBY's
   operational domains; the seeded fleet was organised by software-industry job
   titles. Widening mandates to absorb all 61 seeded agents would have given forge
   ~35 units and merely moved the stage-1 problem down a level.

## Standing (inherited, still binding)

- 2026-07-08 — `pr.open` is Tier-2 (off the approval floor); the gate is the
  operator's review of an opened PR.
- 2026-07-01 — SSE for live streams; explicit target overrides the classifier.
- North Star I laws: files as truth · contract-first · approval floor structural ·
  index-first memory, no vectors · one interaction grammar · single operator.
