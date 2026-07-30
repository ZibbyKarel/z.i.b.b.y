---
name: Release Prep
phases:
  - id: hygiene
    type: agent
    agent: git-workflow-manager
    consumes: task.md
    produces: hygiene.md
    model: sonnet
    thinking: medium
  - id: build
    type: agent
    agent: build-engineer
    consumes: hygiene.md
    produces: build.md
    model: sonnet
    thinking: medium
  - id: verify
    type: verify
    loop:
      to: build
      maxRetries: 2
      escalate: true
      then: park
  - id: readiness
    type: agent
    agent: deployment-engineer
    consumes: build.md
    produces: readiness.md
    model: opus
    thinking: high
    qualify: true
    loop:
      to: hygiene
      maxRetries: 2
      escalate: true
      then: park
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
  - id: plan
    type: agent
    agent: devops-engineer
    consumes: readiness.md
    produces: release-plan.md
    model: haiku
    thinking: low
outputs:
  - type: file
    from: release-plan.md
    dest: vault
    to: release-prep-plan
desc: >-
  Plná příprava vydání: hygiena větví a tagů → ověření buildu → posudek
  připravenosti k nasazení → plán vydání s rollback krokem. Připrav release,
  příprava vydání, release prep, deploy readiness, připravit nasazení, tag,
  verzování, semver, rollback plán, release checklist, jde to vydat. Končí u
  brány — **nikdy nemerguje ani nedeployuje** (Zákon 3). Na samotný changelog
  stačí `release-notes`.
ownerSubsystem: maestro
complexity: deep
---

# Release Prep

Nejvyšší příčka maestra: **hygiena → build → verify → readiness ⇄ hygiena →
plán**. Pět fází, deterministické ověření buildu a kvalifikační brána
připravenosti. Linka vydání **připraví**, nikdy ho nevydá.

## Zákon 3 — kde tahle linka končí

`release-prep` **nemerguje, netaguje sdílenou větev, nepushuje na shared branch
a nedeployuje.** Nic z toho není fáze téhle pipeline a žádná fáze si to nesmí
domyslet jako „ještě dokončím“. Vše probíhá na běhové větvi `zibby/*`; výsledkem
je dokument, který operátorovi předloží jedno jasné rozhodnutí. Neodvratný krok
(merge, tag, deploy) dělá operátor, ne ZIBBY.

## Fáze

1. **hygiene** — `task.md` → `hygiene.md`: stav větví a tagů, co je skutečně
   sloučené, co viselo mimo, poslední tag, návrh nové verze (semver s
   odůvodněním) a seznam nesrovnalostí, které by vydání blokovaly.
2. **build** — `hygiene.md` → `build.md`: připraví repo do stavu, ze kterého jde
   vydat — verze, lockfile, build skripty, artefakty. Sepíše, co změnil a čím
   si to sám předběžně ověřil. `verify` je pak nezávislé potvrzení, ne první
   kontakt s buildem.
3. **verify** — deterministické kontroly projektu přímo v checkoutu. Žádný model,
   žádné tokeny, jen exit kódy. **Že build prošel, tvrdí exit kód, ne agent.**
   Červená vrací práci na **build** (2× s eskalací), vyčerpání → park.
   `commands` fáze neuvádí, takže se dědí kontroly nastavené na projektu — build
   se jmenuje v každém repu jinak, takže patří do `checks` projektu, ne
   nadrátovaný do uložené pipeline (vlastní `commands` by kontroly projektu
   přebily, ne doplnily).
4. **readiness** — `build.md` → `readiness.md`: posudek připravenosti k nasazení —
   migrace, konfigurace a tajemství, feature flagy, závislosti prostředí,
   rollback cesta, rizika. Fáze je `qualify`: nese `<verdict>`. Cokoli jiného
   než `pass` vrací práci na **hygiene** (2× s eskalací sonnet/high → opus/high),
   pak park. Park je správný konec — „ještě to není k vydání“ je informace pro
   operátora, ne důvod linku natahovat.
5. **plan** — `readiness.md` → `release-plan.md`: plán vydání ve tvaru
   `# titulek` + tělo — pořadí kroků, kdo je dělá, ověření po nasazení a
   rollback. Kroky jsou napsané pro operátora k provedení, ne k automatickému
   spuštění.

## Výstup

Jeden výstup `type: file` z `release-plan.md` do trezoru jako nota
`release-prep-plan`. Záměrně **žádný `type: pr`**: tahle linka nemá co pushovat —
připravuje rozhodnutí, ne změnu kódu k oponentuře.
