---
name: Dependency Scan
phases:
  - id: sweep
    type: agent
    agent: dependency-manager
    consumes: task.md
    produces: dependencies.md
    model: haiku
    thinking: low
  - id: assess
    type: agent
    agent: security-auditor
    consumes: dependencies.md
    produces: dep-report.md
    model: sonnet
    thinking: medium
outputs:
  - type: file
    from: dep-report.md
    dest: vault
    to: dep-scan-report
desc: >-
  Rychlý read-only přehled závislostí projektu: známé CVE, zastaralé a
  neudržované balíčky, konfliktní verze, licenční rizika → krátká zpráva
  s prioritami. Nic neinstaluje ani neupgraduje. Závislosti, dependencies, CVE,
  zranitelné balíčky, npm audit, outdated, licence, supply chain, dep scan.
  Na plný bezpečnostní audit aplikace s validací zranitelností použij
  `security-audit`; samotný upgrade provede `patch` nebo `delivery`.
ownerSubsystem: sentinel
complexity: light
---

# Dependency Scan

Nejlevnější příčka sentinelu: **sweep → assess**. Read-only — **nic
neinstaluje, neupgraduje ani nemění lockfile**. Dvě fáze, protože sběr dat je
mechanický a drahý pohled je potřeba až na jejich vyhodnocení.

## Fáze

1. **sweep** — `task.md` → `dependencies.md`: projde manifesty a lockfile, sesbírá
   verze, známé CVE, zastaralost, duplicitní a konfliktní verze a deklarované
   licence. Surová data s odkazy na poradenství, žádné hodnocení.
2. **assess** — `dependencies.md` → `dep-report.md`: co z toho reálně ohrožuje
   tenhle projekt. Nálezy seřazené podle skutečné exponovanosti (dosažitelnost
   zranitelné cesty, ne jen skóre), u každého navržený krok — upgrade, pin,
   nahrazení, nebo vědomé přijetí rizika. Tvar `# titulek` + tělo.

Žádná `verify` fáze ani smyčka — scan hlásí, neopravuje.

## Výstup

Jeden výstup `type: file` z `dep-report.md` do trezoru jako nota
`dep-scan-report`. Žádný PR: pipeline nemění ani řádek, takže není co pushnout.
Upgrade je samostatný běh forge, který tahle zpráva nakrmí.
