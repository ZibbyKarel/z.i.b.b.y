---
name: Delivery
phases:
  - id: architekt
    type: agent
    agent: architekt
    consumes: task.md
    produces: plan.md
    model: opus
    thinking: high
  - id: koder
    type: agent
    agent: koder
    consumes: plan.md
    produces: implementation.md
    model: sonnet
    thinking: medium
  - id: review
    type: agent
    agent: code-review
    consumes: implementation.md
    produces: review.md
    model: opus
    thinking: high
    qualify: true
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
      driftTo: architekt
  - id: dokumentator
    type: agent
    agent: dokumentator
    consumes: review.md
    produces: docs.md
    model: sonnet
    thinking: low
  - id: pr-autor
    type: agent
    agent: pr-autor
    consumes: docs.md
    produces: pr-draft.md
    model: sonnet
    thinking: medium
desc: >-
  Postav, oprav nebo implementuj feature či bug v projektu — build, fix,
  implement a feature or bug; deliver, postavit, opravit, implementovat, dodat,
  rozbitý test, failing test.
department: dev
complexity: standard
---

# Delivery

Doručovací smyčka ZIBBY: **Architekt → Kodér ⇄ Code-Review →
Dokumentátor**. Ohraničený stavový automat — opakuje s eskalací, a místo mlácení
hlavou o zeď zaparkuje pro lidskou poznámku.

## Fáze

1. **architekt** — `task.md` → `plan.md`: rozpad zadání na kroky a kontrakt změn.
2. **koder** — `plan.md` → `implementation.md`: provede změny v cílovém projektu,
   spustí vlastní zdokumentované kontroly repa (CLAUDE.md / AGENTS.md / README /
   package skripty) a sepíše shrnutí změn (soubory, rozhodnutí, výsledky kontrol).
3. **review** — `implementation.md` → `review.md`: oponentura; selhání vrací práci
   Kodérovi s kontextem, eskalace zvedá model/thinking, vyčerpání → park. Review je poslední
   kontrola před PR.
4. **dokumentator** — `review.md` → `docs.md`: changelog a poznámky pro PR.
5. **pr-autor** — `docs.md` → `pr-draft.md`: složí titulek + tělo PR, pak se
   pokusí o jediný gated řetězec `git push -u origin <branch> && gh pr create …`.
   Push i otevření PR jsou Tier-3: hook ohlásí `pr.open`, běh zaparkuje na
   schválení. **PR je brána** — vše před ním se už stalo na větvi `zibby/*`.

Handoff je vždy jeden soubor; selhání předává ocas logu jako kontext dalšímu
pokusu (plus případnou poznámku operátora po resume).
