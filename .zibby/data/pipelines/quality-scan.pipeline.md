---
name: Quality Scan
phases:
  - id: scan
    type: agent
    agent: architect-reviewer
    consumes: task.md
    produces: findings.md
    model: sonnet
    thinking: medium
  - id: smells
    type: agent
    agent: error-detective
    consumes: findings.md
    produces: risks.md
    model: haiku
    thinking: low
  - id: report
    type: agent
    agent: qa-expert
    consumes: risks.md
    produces: quality-report.md
    model: sonnet
    thinking: low
outputs:
  - type: file
    from: quality-report.md
    dest: vault
    to: quality-scan-report
desc: >-
  Rychlé read-only přečtení kvality jedné oblasti kódu — modulu, feature,
  adresáře — bez jakékoli změny. Struktura a hranice, code smells, riziková
  místa, chybějící testy → krátká zpráva s prioritami. Projdi, mrkni na, jak
  na tom je, kvalita kódu, code smells, technický dluh, quality scan, prohlídka
  modulu. Na plný audit včetně bezpečnosti, přístupnosti a výkonu použij
  `code-audit`; na skutečnou opravu `patch` nebo `delivery`.
ownerSubsystem: loom
complexity: light
---

# Quality Scan

Nejlevnější příčka loomu: **scan → smells → report**. Read-only — **nikdy nemění
kód**. Odlehčená verze `code-audit` bez bezpečnostní, přístupnostní a výkonové
optiky, pro rychlou odpověď na „jak je ta oblast na tom".

## Fáze

1. **scan** — `task.md` → `findings.md`: struktura a hranice oblasti, závislosti,
   odchylky od konvencí repa, místa, kde návrh nesedí s použitím.
2. **smells** — `findings.md` → `risks.md`: konkrétní riziková místa — tichá
   selhání, chybějící ošetření chyb, kopírovaný kód, mrtvý kód, díry v testech.
3. **report** — `risks.md` → `quality-report.md`: nálezy seřazené podle dopadu,
   ve tvaru `# titulek` + tělo, s návrhem dalšího kroku u každého (`quick-fix`,
   `patch`, `delivery`, nebo plný `code-audit`).

Žádná `verify` fáze ani smyčka — scan nálezy hlásí, neopravuje. Oprava je
samostatný běh forge, který tahle zpráva nakrmí.

## Výstup

Jeden výstup `type: file` z `quality-report.md` do trezoru jako nota
`quality-scan-report`. Výsledkem je informace, ne kód — pipeline nikdy neotevírá
PR, protože nemá co pushnout.
