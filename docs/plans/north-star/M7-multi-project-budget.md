# M7 — Multi-Project Isolation + USD Budget Governance

**Závislosti:** [M1 — Project Profile](M1-project-profile.md) (per-project gate policy), [M4 — Self-Learning](M4-self-learning.md) (CostTracker)

**Proč jako sedmý:** záleží, jakmile existuje více než jedna mise; run-count polovina již existuje.

## Reality (co existuje)

Per-project run-count caps (daily/weekly), globální account ceiling a concurrency queue jsou reálné.
Per-project gate policy přistane v M1.

## Gap (co chybí)

- Budget je **run-count only** — žádné USD cost tracking (`budget.json` a ledger jsou prázdné)
- Žádné 80/90/100% thresholds
- Žádný multi-project velín
- Žádné cross-project learning

## Build

- **Real-time USD cost tracking** per projekt per den (CostTracker z M4 píše ledger).
- **Thresholds:** auto-hold při 80% monthly cap, alert při 90%, hard stop při 100%; briefing ukazuje
  yesterday's spend + projected month-end.
- **Project data isolation:** agent v projektu A nemůže číst data projektu B (enforced na grounding
  + workspace seam).
- **Multi-project velín:** jeden dashboard, per-project health / aktivita / pending approvals /
  budget utilization.
- **Cross-project intelligence:** aplikovat learnings (např. konvence) z A do B kde pravidla povolují.

## Output

ZIBBY spouští několik misí paralelně s izolovanými pravidly a reálnou kontrolou nákladů.
