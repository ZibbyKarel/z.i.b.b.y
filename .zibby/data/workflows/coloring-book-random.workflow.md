---
name: Coloring Book Random
phases:
  - id: plan
    type: agent
    agent: coloring-planner
    consumes: brief.md
    produces: content-plan.md
    model: sonnet
    thinking: medium
  - id: plan-check
    type: tool
    consumes: content-plan.md
    produces: plan.json
    commands:
      - product-factory plan check content-plan.md
    loop:
      to: plan
      maxRetries: 2
      escalate: true
      then: park
  - id: jobs
    type: tool
    consumes: plan.json
    produces: jobs-report.md
    commands:
      - product-factory jobs --report jobs-report.md
  - id: produce
    type: tool
    consumes: jobs-report.md
    produces: produce-report.md
    commands:
      - PF_IMAGE_PROVIDER=openai PF_VISION_PROVIDER=none product-factory produce "$ZIBBY_RUN_DIR/book/jobs.json" --rounds 2 --report produce-report.md
  - id: render
    type: tool
    consumes: produce-report.md
    produces: render-report.md
    commands:
      - PF_SINGLE_SIDED=true product-factory render --report render-report.md
  - id: preflight
    type: tool
    consumes: render-report.md
    produces: preflight.md
    commands:
      - product-factory preflight --report preflight.md
  - id: listing
    type: agent
    agent: listing-specialist
    consumes: preflight.md
    produces: listing.md
    model: haiku
    thinking: low
    openaiModel: gpt-6-luna
    include:
      - book/plan.json
  - id: finalize
    type: tool
    consumes: listing.md
    produces: book.md
    commands:
      - product-factory finalize listing.md --report book.md
  - id: review
    type: agent
    agent: book-reviewer
    consumes: book.md
    produces: review.md
    model: haiku
    thinking: low
    qualify: true
    loop:
      to: produce
      maxRetries: 1
      escalate: false
      then: park
    approval: ask
desc: >-
  Rychlá omalovánka „každá strana jiné téma“: plán stran (bez opakujících se
  postav) → kontrola plánu → prompty přímo ze scén → generování obrázků přes
  OpenAI Images API + pixel QA → PDF (interiér + obálka) → preflight KDP → listing
  → schválení operátorem nad hotovým PDF. Výstup: složka `book/` v běhu s PDF.
department: pub
complexity: standard
budget:
  maxCostUsd: 5
  warnAtPct: 70
project: publishing
---

# Coloring Book Random

Zjednodušená výrobní linka oddělení **pub**: každá strana má **jiné, samostatné téma**
(liška, maják, dort, traktor…), nejsou tu opakující se postavy, a proto ani problém
s jejich konzistencí. Vstupem je volný text (věk, počet stran, téma knížky); výstupem je
složka `book/` v adresáři běhu: `interior.pdf`, `cover.pdf`, `listing.md`, `README.md`
a schválené ilustrace. Nic se nepublikuje — nahrání na tržiště dělá operátor ručně.
Příběhovou variantu s postavami řeší workflow **Coloring Book**.

## Fáze

1. **plan** (`coloring-planner`) — zadání → `content-plan.md` s JSON blokem: `characters: []`,
   každá strana jiné téma, `scene` rovnou jako úplný prompt pro obrázek (jeden velký
   motiv, pár velkých tvarů, tlusté čáry, jednoduché pozadí, žádný text), plnobarevná
   obálka bez „titulkových kamarádů“.
2. **plan-check** (tool) — `product-factory plan check`: schéma, počet stran,
   duplicitní scény, zakázané značky. Chyba → zpět na **plan** (2×), pak park.
3. **jobs** (tool) — `product-factory jobs`: `book/jobs.json` rovnou z plánu (prompt
   strany = její `scene`, prompt obálky = `cover.scene`), takže není potřeba illustrator.
4. **produce** (tool) — `PF_IMAGE_PROVIDER=openai PF_VISION_PROVIDER=none`: generování
   přes OpenAI Images API (`PF_OPENAI_*`, výchozí kvalita `medium`), prahování, pixel QA,
   2 kola. Zablokované strany fázi shodí (bez návratu na agenta — žádný illustrator tu není).
5. **render** (tool) — interiér a obálka v PDF, 8.5×11", 300 DPI, s `PF_SINGLE_SIDED=true`:
   omalovánky se tisknou jednostranně (prázdná zadní strana každé stránky), aby fixy
   neprosakovaly na další obrázek.
6. **preflight** (tool) — kontrola KDP (rozměry, DPI, fonty, prázdné strany).
7. **listing** (`listing-specialist`) — text listingu pro KDP. Běží přes OpenAI
   (`openaiModel: gpt-6-luna`, jen text). Dostane `preflight.md` a přiložený
   `book/plan.json`.
8. **finalize** (tool) — `README.md` knihy, součet nákladů, cesta ke složce.
9. **review** (`book-reviewer`, qualify, `approval: ask`) — běh zaparkuje a čeká na
   operátora s hotovým `interior.pdf` a `cover.pdf`. „Schválit“ ukončí běh; „Požádat
   o změny“ s poznámkou se převede na `product-factory reject` (0 = titulka) a běh se
   vrací na **produce** (1×): `produce` znovu vygeneruje jen odmítnuté strany ze stejného
   `book/jobs.json` (promptů ze scén), ostatní schválené zůstanou. Chce-li operátor jiné
   téma strany, upraví poznámka `scene` v `book/plan.json` (a `book/jobs.json`).

## Nastavení

Poskytovatel obrázků je v příkazech fixně `openai`; klíč `OPENAI_API_KEY` se bere
z Nastavení → AI modely → OpenAI (přijde do prostředí běhu). Ladit lze `PF_OPENAI_QUALITY`
(`low` | `medium` | `high`), `PF_OPENAI_IMAGE_MODEL` a `PF_OPENAI_SIZE` v env projektu
**publishing**. Rozpočet běhu hlídá `budget` — při překročení se běh zastaví a čeká na schválení.
