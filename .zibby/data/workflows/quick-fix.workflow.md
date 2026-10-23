---
name: Quick Fix
phases:
  - id: fix
    type: agent
    agent: fullstack-developer
    consumes: task.md
    produces: fix.md
    model: sonnet
    thinking: low
  - id: review
    type: agent
    agent: code-reviewer
    consumes: fix.md
    produces: review.md
    model: sonnet
    thinking: medium
    qualify: true
    loop:
      to: fix
      maxRetries: 2
      escalate: true
      then: park
      escalation:
        - model: sonnet
          thinking: high
        - model: opus
          thinking: high
outputs:
  - type: pr
    from: fix.md
desc: >-
  Nejlevnější kódová cesta pro jednořádkovou nebo drobnou změnu na jedné ploše:
  přejmenování, oprava textu či překlepu, změna konstanty, malý zjevný bug,
  úprava jednoho souboru. Bez architekta a bez dokumentace — jen provedení,
  vlastní kontroly repa a rychlá oponentura. Rename, typo, copy fix,
  one-liner, drobnost, maličkost, quick fix, malá oprava. Pro běžnou změnu přes víc
  souborů použij `patch`; pro víceplošnou práci s designem a testy
  `delivery`.
department: dev
complexity: light
---

# Quick Fix

Nejspodnější kódová příčka forge nad samostatným agentem: **fix → review**.
Žádný architekt, žádná dokumentace. Je pro drobné změny — a přesto se nikdy
nedoručuje bez druhého pohledu: review je hodnotící brána a poslední kontrola
před PR.

## Fáze

1. **fix** — `task.md` → `fix.md`: provede změnu v cílovém projektu a napíše
   `fix.md` ve tvaru `# titulek` + tělo (co se změnilo, které soubory, proč) —
   to je vstup pro PR výstup. Drží se jedné plochy; když se zadání ukáže jako
   víceplošné, řekne to ve `fix.md` a nechá práci na `patch` nebo `delivery`
   místo tichého rozšíření rozsahu. Před předáním spustí **vlastní zdokumentované
   kontroly cílového repa** (CLAUDE.md / AGENTS.md / README / package skripty) a
   výsledky zapíše do `fix.md`.
2. **review** — `fix.md` → `review.md`: oponentura změny a **brána**
   (`qualify: true`). Runner čte verdikt (`<verdict>pass|gap|drift</verdict>`),
   chybějící tag je `gap` (fail-closed). `gap`/`drift` vrací práci fázi **fix**
   (2× s eskalací modelu), vyčerpání → park. `pass` pustí práci na PR.

## Výstup

Jeden výstup `type: pr` z `fix.md` (poslední pokus fáze fix): systém složí titulek + tělo a otevře PR
gated řetězcem `git push -u origin <branch> && gh pr create …`. Push i otevření
PR jsou Tier-3 — běh zaparkuje na schválení. **PR je brána**, a vynucuje ji
systém, ne dobrá vůle agenta (Zákon 3).
