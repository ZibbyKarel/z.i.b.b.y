---
name: Coloring Book
phases:
  - id: concept
    type: agent
    agent: book-creative-director
    consumes: brief.md
    produces: visual-bible.md
    model: sonnet
    thinking: high
  - id: plan
    type: agent
    agent: book-page-planner
    consumes: visual-bible.md
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
  - id: illustrate
    type: agent
    agent: book-illustrator
    consumes: plan.json
    produces: jobs.json
    model: sonnet
    thinking: medium
  - id: produce
    type: tool
    consumes: jobs.json
    produces: produce-report.md
    commands:
      - product-factory produce jobs.json --report produce-report.md
    loop:
      to: illustrate
      maxRetries: 2
      escalate: false
      then: park
  - id: visual-audit
    type: agent
    agent: book-visual-qa
    consumes: produce-report.md
    produces: visual-audit.md
    model: sonnet
    thinking: medium
    qualify: true
    loop:
      to: illustrate
      maxRetries: 2
      escalate: false
      then: park
      driftTo: concept
  - id: render
    type: tool
    consumes: visual-audit.md
    produces: render-report.md
    commands:
      - product-factory render --report render-report.md
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
  - id: finalize
    type: tool
    consumes: listing.md
    produces: book.md
    commands:
      - product-factory finalize listing.md --report book.md
outputs:
  - type: file
    from: book.md
    dest: vault
    to: coloring-book-latest
desc: >-
  Autonomní výroba dětské omalovánky: koncept → plán stran → kontrola plánu →
  prompty → generování a QA obrázků → vizuální audit knihy → PDF (interiér + obálka)
  → preflight KDP → listing. Výstup: složka `book/` v běhu s PDF.
department: pub
complexity: deep
project: publishing
budget:
  maxCostUsd: 15.75
  warnAtPct: 70
---

# Coloring Book

Výrobní linka oddělení **pub**. Vstupem je krátké zadání (téma, věk, počet stran);
výstupem je složka `book/` v adresáři běhu: `interior.pdf`, `cover.pdf`,
`listing.md`, `README.md` a schválené ilustrace. Nic se nepublikuje — nahrání na
tržiště dělá operátor ručně.

## Fáze

1. **concept** (`book-creative-director`) — zadání → `visual-bible.md`: koncept,
   věková pravidla, styl čáry, maskot, obálka.
2. **plan** (`book-page-planner`) — `content-plan.md` s JSON blokem stran.
3. **plan-check** (tool) — `product-factory plan check`: schéma, počet stran,
   duplicitní scény, zakázané značky. Chyba → zpět na **plan** (2×), pak park.
4. **illustrate** (`book-illustrator`) — `jobs.json`, jen prompty.
5. **produce** (tool) — generování (mflux lokálně / fal.ai v cloudu / mock),
   prahování, pixel QA, vision QA, opakování. Zablokované strany → zpět na
   **illustrate** (2×), pak park.
6. **visual-audit** (`book-visual-qa`, qualify) — audit celé knihy; vadné strany
   vrátí přes `product-factory reject` → **illustrate**; mimo koncept → **concept**.
7. **render** (tool) — interiér a obálka v PDF, 8.5×11", 300 DPI.
8. **preflight** (tool) — kontrola KDP (rozměry, DPI, fonty, prázdné strany).
9. **listing** (`listing-specialist`) — text listingu pro KDP.
10. **finalize** (tool) — `README.md` knihy, součet nákladů, cesta ke složce.

## Nastavení

Poskytovatele volí projekt **publishing** (Projekty → publishing → env):
`PF_IMAGE_PROVIDER` = `mflux` | `fal` | `mock`, `PF_VISION_PROVIDER` = `ollama` |
`haiku` | `none`. Klíč `FAL_KEY` patří jen do tajemství projektu. Lidskou kontrolu
po libovolné fázi zapne `approval: ask` u fáze (výchozí je plně autonomní).
Rozpočet běhu hlídá `budget` — při překročení se běh zastaví a čeká na schválení.
