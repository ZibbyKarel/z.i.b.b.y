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

## Standing (inherited, still binding)

- 2026-07-08 — `pr.open` is Tier-2 (off the approval floor); the gate is the
  operator's review of an opened PR.
- 2026-07-01 — SSE for live streams; explicit target overrides the classifier.
- North Star I laws: files as truth · contract-first · approval floor structural ·
  index-first memory, no vectors · one interaction grammar · single operator.
