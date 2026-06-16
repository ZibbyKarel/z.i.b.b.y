# M5 — Self-Modification Front-End („I want X" → PR)

**Závislosti:** [M4 — Self-Learning](M4-self-learning.md) (GapDetector čte z vault)

**Proč jako pátý:** engine existuje; chybí pouze proaktivní front door a zpevněný gate.

## Reality (co existuje)

Goals + maker/verifier + worktree isolation (builder ≠ subject) jsou reálné a testované.
Gate floor již routuje `pr.open → ask` a `pr.merge → deny` strukturálně, takže self-mod PR
nemůže být auto-merged.

## Gap (co chybí)

- Žádný `GapDetector`
- Žádný natural-language „I want X → plan → PR" flow
- Žádný explicitní hardcoded Tier-3 marker na self-modification
- Žádný post-merge auto test report

## Build

- **`GapDetector` agent:** skenuje aktivitu + vault pro opakující se manuální kroky →
  `vault/suggestions/automation-gaps.md` → briefing: „Zaznamenal jsem X — zautomatizovat?".
- **Zpevnit self-mod:** strukturální pravidlo, že jakýkoliv PR **proti vlastnímu repo ZIBBY**
  je vynuceně Tier 3 (belt-and-suspenders nad pr.open/pr.merge floor), s PR description template
  (co / proč / blast radius).
- **„I want X" flow:** classifier označí self-modification → plan (povrchí ke schválení) → delivery
  pipeline against own repo → PR → po approve+merge automaticky spustí suite a reportuje.

## Output

Operátor přidává capabilities přirozeným jazykem; každá self-change je gatovaná a auditovatelná
end-to-end.
