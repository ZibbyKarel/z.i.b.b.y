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
outputs:
  - type: pr
    from: fix.md
desc: >-
  Nejlevnější kódová cesta pro jednořádkovou nebo drobnou změnu na jedné ploše:
  přejmenování, oprava textu či překlepu, změna konstanty, malý zjevný bug,
  úprava jednoho souboru. Bez architekta, bez oponentury, bez dokumentace — jen
  provedení a vlastní kontroly repa. Rename, typo, copy fix,
  one-liner, drobnost, maličkost, quick fix, malá oprava. Pro běžnou změnu, která
  potřebuje review, použij `patch`; pro víceplošnou práci s designem a testy
  `delivery`.
department: dev
complexity: light
---

# Quick Fix

Nejspodnější kódová příčka forge nad samostatným agentem: **fix**. Jedna
fáze, žádná oponentura, žádná dokumentace. Je pro změny, kde by review byla
dražší než sama změna — a přesto se nikdy nedoručuje neověřeně.

## Fáze

1. **fix** — `task.md` → `fix.md`: provede změnu v cílovém projektu a napíše
   `fix.md` ve tvaru `# titulek` + tělo (co se změnilo, které soubory, proč) —
   to je vstup pro PR výstup. Drží se jedné plochy; když se zadání ukáže jako
   víceplošné, řekne to ve `fix.md` a nechá práci na `patch` nebo `delivery`
   místo tichého rozšíření rozsahu. Před předáním spustí **vlastní zdokumentované
   kontroly cílového repa** (CLAUDE.md / AGENTS.md / README / package skripty) a
   výsledky zapíše do `fix.md`.

## Výstup

Jeden výstup `type: pr` z `fix.md`: systém složí titulek + tělo a otevře PR
gated řetězcem `git push -u origin <branch> && gh pr create …`. Push i otevření
PR jsou Tier-3 — běh zaparkuje na schválení. **PR je brána**, a vynucuje ji
systém, ne dobrá vůle agenta (Zákon 3).
