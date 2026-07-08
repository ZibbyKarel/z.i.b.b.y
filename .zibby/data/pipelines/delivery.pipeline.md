---
name: Delivery
phases:
  - id: architekt
    type: agent
    agent: architect
    consumes: task.md
    produces: plan.md
    model: opus
    thinking: high
  - id: koder
    type: agent
    agent: fullstack-developer
    consumes: plan.md
    produces: implementation.md
    model: sonnet
    thinking: medium
  - id: review
    type: agent
    agent: code-reviewer
    consumes: implementation.md
    produces: review.md
    model: opus
    thinking: high
    loop:
      to: koder
      maxRetries: 3
      escalate: true
      then: park
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
  - id: n-9
    type: agent
    agent: test-automator
    consumes: review.md
    produces: test-automator.md
    model: sonnet
    thinking: medium
  - id: dokumentator
    type: agent
    agent: documentation-engineer
    consumes: test-automator.md
    produces: docs.md
    model: sonnet
    thinking: low
desc: >-
  Postav, oprav nebo implementuj feature či bug v projektu — build, fix,
  implement a feature or bug; deliver, postavit, opravit, implementovat, dodat,
  rozbitý test, failing test.
avatar: assets/delivery.png
ownerSubsystem: forge
---

# Delivery

Doručovací smyčka ZIBBY: **Architekt → Kodér ⇄ Code-Review → Dokumentátor**.
Kvalitu si hlídá sám Kodér — než předá práci, spustí kontroly projektu
(lint/typecheck/testy) a opraví je do zelené; není pro to zvláštní fáze.
Ohraničený stavový automat — opakuje s eskalací, a místo mlácení hlavou o zeď
zaparkuje pro lidskou poznámku.

## Fáze

1. **architekt** — `task.md` → `plan.md`: rozpad zadání na kroky a kontrakt změn.
2. **koder** — `plan.md` → `implementation.md`: provede změny v cílovém projektu,
   pak **spustí kontroly kvality projektu** (lint/typecheck/testy podle konvencí
   repa) a opraví je do zelené, než označí práci za hotovou. Co spustil a s jakým
   výsledkem zapíše do shrnutí; co nedokázal dotáhnout do zelené, přizná.
3. **review** — `implementation.md` → `review.md`: oponentura; selhání vrací práci
   Kodérovi s kontextem, eskalace zvedá model/thinking, vyčerpání → park.
4. **dokumentator** — `review.md` → `docs.md`: changelog a poznámky pro PR
   (`docs.md` má tvar `# titulek` + tělo — to je vstup pro PR výstup).

## Výstup

Co se stane s hotovou prací **nedělá žádný agent** — je to výstup nakonfigurovaný
na úrovni pipeline (`outputs`). Tato pipeline má jeden výstup `type: pr`: systém
z `docs.md` složí titulek + tělo a otevře PR jediným gated řetězcem
`git push -u origin <branch> && gh pr create …`. Push i otevření PR jsou Tier-3:
běh zaparkuje na schválení. **PR je brána** — vše před ním se už stalo na větvi
`zibby/*`, a bránu vynucuje systém, ne dobrá vůle agenta.

Handoff je vždy jeden soubor; selhání předává ocas logu jako kontext dalšímu
pokusu (plus případnou poznámku operátora po resume).
