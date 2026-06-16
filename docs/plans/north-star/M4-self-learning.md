# M4 — Self-Learning + Nightly Consolidation

**Závislosti:** [M3 — Briefing + Standup](M3-briefing-standup.md) (delivery vehicle pro learnings)

**Proč jako čtvrtý:** toto je to, co dělá ZIBBY _second brain_ spíše než executor —
„do rána ví více než věděl večer." Skutečně greenfield.

## Reality (co existuje)

Approvals a append-only activity log jsou reálné a dotazovatelné. Nic je nezpětně čte
pro learning. Složka `patterns/` ve vaultu neexistuje.

## Gap (co chybí)

- Žádné approval-signal capture
- Žádný `PatternExtractor`
- Žádný nightly job
- Žádné Q&A learning capture

## Build

- **Approval-signal capture:** hook každé gate resolve → strukturovaný záznam v
  `vault/patterns/approval-patterns.md` (projekt, akce, kontext, rozhodnutí, time-to-decide).
- **`PatternExtractor` (nightly):** skenuje 30 dní signálů; ≥ N opakování vzoru → navrhne
  pravidlo v `vault/patterns/suggestions.md`; morning briefing ho povrchí jako
  „Mám návrh autonomního pravidla — schválit?".
- **Nightly heartbeat** (rozšířit existující scheduler, ~23:00): PatternExtractor → BriefingPrep →
  VaultConsolidator (sloučí daily notes do `knowledge/`) → CostTracker (napájí M7).
- **Explicit learning:** když ZIBBY se zeptá a operátor odpoví, zapsat `Q/A/context` do vaultu
  pro extractor ke konsolidaci.
- Vytvořit chybějící vault strukturu (`patterns/`, `suggestions/`) a `MEMORY.md` /
  index MOC, který north-star odkazuje, ale který není na disku.

## Output

Po ~2 týdnech provozu ZIBBY navrhne první autonomní pravidla; briefing získá reálnou
sekci „What I learned".
