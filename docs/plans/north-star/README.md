# North Star — Execution Plan

Tento adresář obsahuje ROADMAP.md rozdělenou po jednotlivých milnících.
Kanonická vize je `apps/api/data/vault/north-star.md`.

Plán je rebaselined proti **code-level auditu** ze dne 2026-06-16.

## Milníky

| Soubor | Milník | Stav |
| --- | --- | --- |
| [state-audit.md](state-audit.md) | State Audit — co skutečně existuje | ✅ Reference |
| [M1-project-profile.md](M1-project-profile.md) | M1 — Project Profile (operační atom) | ❌ Gap |
| [M2-inbound-autonomy.md](M2-inbound-autonomy.md) | M2 — Inbound Autonomy (kanály → klasifikátor → tier) | ❌ Gap |
| [M3-briefing-standup.md](M3-briefing-standup.md) | M3 — Narrative Briefing + Standup Cheat Sheets | 🟡 Partial |
| [M4-self-learning.md](M4-self-learning.md) | M4 — Self-Learning + Nightly Consolidation | ❌ Absent |
| [M5-self-modification.md](M5-self-modification.md) | M5 — Self-Modification Front-End | ❌ Gap |
| [M6-research.md](M6-research.md) | M6 — Research / Intelligence Layer | ❌ Absent |
| [M7-multi-project-budget.md](M7-multi-project-budget.md) | M7 — Multi-Project + USD Budget Governance | 🟡 Partial |
| [M8-hardening.md](M8-hardening.md) | M8 — Hardening + Telemetry | 🟡 Partial |

## Doporučené pořadí

1. M1 — Project Profile (základ; vše ostatní závisí na profilu)
2. M2 — Inbound Autonomy (největší praktický přínos; odemkne already-built channel runtime)
3. M3 — Narrative Briefing + Standup (denní hodnota od prvního dne)
4. M4 — Self-Learning + Nightly Consolidation (kumulativní hodnota; „second brain")
5. M5 — Self-Modification Front-End (engine existuje; levné dokončit)
6. M6 — Research / Intelligence (proaktivní hodnota)
7. M7 — Multi-Project + USD Budget (když bude více než jedna mise)
8. M8 — Hardening + Telemetry (průběžné, prolíná všemi milníky)

## Architektonické principy (nesmí být porušeny)

- **Files are source of truth** — žádná black-box databáze; vše na disku, čitelné člověkem.
- **Approval-first is law** — zakódováno na dispatch/gate floor, ne v konfigu.
- **Contract-first development** — ts-rest kontrakt v `libs/contracts` před implementací.
- **Index-first memory** — žádný vector RAG; MOC soubory a atomické Markdown poznámky.
- **Polling, not SSE** — frontend polling je non-negotiable constraint.
- **Per-project gate floor** — pravidla lze pouze zpřísnit, nikdy neuvolnit pod globální floor.
- **Single operator** — hloubka nad šíří; jeden vault, jedna identita.
