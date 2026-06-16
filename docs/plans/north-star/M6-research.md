# M6 — Research / Intelligence Layer

**Závislosti:** [M3 — Briefing + Standup](M3-briefing-standup.md) (delivery vehicle), [M4 — Self-Learning](M4-self-learning.md) (nightly job)

**Proč jako šestý:** proaktivní, world-facing hodnota — „ZIBBY přináší svět operátorovi."
Plně greenfield, závisí na briefingu (M3) a nočním jobu (M4) jako delivery vehicles.

## Reality (co existuje)

Nic. Žádné research agenty, žádná operator research konfigurace.

## Gap

Celá vrstva chybí.

## Build

- **`ResearchAgent`** s pod-watchery:
  - `TrendWatcher` (RSS/HN/PH)
  - `TechWatcher` (libs/CVEs)
  - `FinanceWatcher` (přehled pouze, nikdy rady) — volitelné
  - `CompetitorWatcher` — volitelné
- **Operator-level research konfigurace** v hlavním profilu (interests, sources, finance_watch) —
  ne per-projekt.
- **Output:**
  - Denní digest složený do morning briefingu
  - On-demand „co je trending v X?" přes existující voice/task path
  - Týdenní „3 app nápady" generátor (bonus) kombinující trendy s operator skills z vaultu

## Output

Morning briefing získá intelligence sekci; ZIBBY povrchuje relevantní signál bez vyžádání.
