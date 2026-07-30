---
name: Patch
phases:
  - id: code
    type: agent
    agent: fullstack-developer
    consumes: task.md
    produces: implementation.md
    model: sonnet
    thinking: medium
  - id: review
    type: agent
    agent: code-reviewer
    consumes: implementation.md
    produces: review.md
    model: sonnet
    thinking: medium
    loop:
      to: code
      maxRetries: 2
      escalate: true
      then: park
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
  - id: verify
    type: verify
    loop:
      to: code
      maxRetries: 2
      escalate: true
      then: park
  - id: notes
    type: agent
    agent: documentation-engineer
    consumes: review.md
    produces: docs.md
    model: haiku
    thinking: low
outputs:
  - type: pr
    from: docs.md
desc: >-
  Běžná změna v kódu s review a ověřením: implementace → oponentura → kontroly →
  poznámky k PR. Pro práci, která potřebuje druhý pohled a zelené testy, ale ne
  návrh architektury ani dokumentaci — refaktor jedné komponenty, nový endpoint
  do existujícího resource, oprava bugu se skutečnou příčinou, doplnění
  validace, úprava chování napříč dvěma či třemi soubory. Patch, běžná změna,
  úprava, oprava bugu, refaktor, code change with review. Na jednořádkovou
  drobnost stačí `quick-fix`; na víceplošnou feature s designem, testy a
  dokumentací je `delivery`.
ownerSubsystem: forge
complexity: standard
---

# Patch

Prostřední příčka forge: **kód → review ⇄ kód → verify → poznámky**. Má
oponenturu i deterministické kontroly, ale nekupuje si fázi architekta ani
plnou dokumentaci — to je `delivery`.

## Fáze

1. **code** — `task.md` → `implementation.md`: provede změny v cílovém projektu a
   sepíše, co změnil (soubory, rozhodnutí, jak to otestovat). Sám si předběžně
   spustí kontroly repa; `verify` je pak nezávislé potvrzení, ne první kontakt
   s testy.
2. **review** — `implementation.md` → `review.md`: oponentura korektnosti,
   čitelnosti a rizik. Selhání vrací práci na **code** s kontextem, eskalace
   zvedá model/thinking (sonnet/high → opus/high), vyčerpání → park.
3. **verify** — deterministické kontroly projektu (lint, typecheck, testy), bez
   modelu a bez tokenů. Červená vrací práci na **code** (2× s eskalací), pak
   park. `commands` neuvádíme, takže se dědí kontroly projektu.
4. **notes** — `review.md` → `docs.md`: changelog a poznámky pro PR. `docs.md` má
   tvar `# titulek` + tělo — to je vstup pro PR výstup.

## Výstup

Jeden výstup `type: pr` z `docs.md`. Push i otevření PR jsou Tier-3: běh
zaparkuje na schválení operátora. **PR je brána** — všechno před ním se stalo na
větvi `zibby/*` a bránu vynucuje systém (Zákon 3).
