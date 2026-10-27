---
name: Coloring Book
phases:
  - id: concept
    type: agent
    agent: creative-director
    consumes: brief.md
    produces: visual-bible.md
    model: sonnet
    thinking: high
  - id: plan
    type: agent
    agent: book-editor
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
  - id: cast
    type: tool
    consumes: plan.json
    produces: cast-report.md
    commands:
      - product-factory cast --report cast-report.md
    loop:
      to: plan
      maxRetries: 1
      escalate: false
      then: park
  - id: illustrate
    type: agent
    agent: illustrator
    consumes: cast-report.md
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
    agent: kids-book-qa
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
  - id: review
    type: agent
    agent: book-reviewer
    consumes: book.md
    produces: review.md
    model: haiku
    thinking: low
    qualify: true
    loop:
      to: illustrate
      maxRetries: 1
      escalate: false
      then: park
    approval: ask
desc: >-
  Autonomní výroba dětské omalovánky: koncept → plán stran → kontrola plánu →
  referenční listy postav → prompty → generování a QA obrázků → vizuální audit knihy → PDF (interiér +
  obálka) → preflight KDP → listing → schválení operátorem nad hotovým PDF.
  Výstup: složka `book/` v běhu s PDF.
department: pub
complexity: standard
budget:
  maxCostUsd: 15.75
  warnAtPct: 70
project: publishing
---

# Coloring Book

Výrobní linka oddělení **pub**. Vstupem je volný text — popis knížky vlastními slovy, např. „omalovánky pro
Natálku o tom, jak navštívila farmapark, jednoduché pro tříleté děti“ (se jménem
dítěte vznikne osobní knížka, kde je dítě hlavní postavou — publikuje se stejně jako
každá jiná);
výstupem je složka `book/` v adresáři běhu: `interior.pdf`, `cover.pdf`,
`listing.md`, `README.md` a schválené ilustrace. Po úspěšném běhu se složka
`book/` navíc zkopíruje do `~/Workspace/zibby-publishing/books/<běh>/`. Nic se nepublikuje — nahrání na
tržiště dělá operátor ručně.

## Fáze

1. **concept** (`creative-director`) — zadání → `visual-bible.md`: koncept,
   věková pravidla, styl čáry, **postavy** (každá, která je na víc než jedné straně,
   s absurdně konkrétní specifikací: počty očí, prstů, knoflíků, antének, oblečení,
   tvar), obálka včetně barev titulku a postaviček, které si s titulkem hrají.
2. **plan** (`book-editor`) — `content-plan.md` s JSON blokem stran.
3. **plan-check** (tool) — `product-factory plan check`: schéma, počet stran,
   duplicitní scény, zakázané značky. Chyba → zpět na **plan** (2×), pak park.
4. **cast** (tool) — `product-factory cast`: každá opakující se postava se nakreslí
   **jednou** jako referenční list (`book/characters/<id>/approved.png`), pixel QA +
   vision QA proti specifikaci (sedí počty?). Pak barevné „samolepky“ postaviček pro
   titulek (`cover-art/buddy-N.png`, vyříznuté z bílého pozadí). Neprojde → zpět na
   **plan** (1×, zjednodušit specifikaci/pózu), pak park.
5. **illustrate** (`illustrator`) — `jobs.json`, jen prompty. Vzhled opakujících se
   postav nepopisuje — ten dodá referenční obrázek a specifikace z plánu.
6. **produce** (tool) — generování (mflux lokálně / fal.ai v cloudu / mock),
   prahování, pixel QA, vision QA, opakování. Strana nebo obálka s opakující se postavou
   dostane jako referenci obrázek s jejími listy (FLUX.2 klein edit), takže postava
   vypadá všude stejně. U obálky se navíc hlídá, že zóna titulku a odznaků je klidné
   pozadí (`busy-zone`). Zablokované strany → zpět na
   **illustrate** (2×), pak park.
7. **visual-audit** (`kids-book-qa`, qualify) — audit celé knihy; vadné strany
   vrátí přes `product-factory reject` → **illustrate**; mimo koncept → **concept**.
8. **render** (tool) — interiér a obálka v PDF, 8.5×11", 300 DPI. Obálka je
   **plnobarevná**: přední strana `book/cover-front.png` = ilustrace + hravý barevný
   titulek (Luckiest Guy, každé písmeno jinou barvou, natočené, s obrysem a stínem) +
   postavičky sedící na titulku / visící z něj + kulaté odznaky v řadě vpravo dole;
   barevný hřbet a záda; vnitřek zůstává černobílý, titulní strana
   interiéru je jen text. Barvy a odznaky obálky určuje `cover` v plánu, který
   vychází ze sekce „OBÁLKA“ v zadání.
9. **preflight** (tool) — kontrola KDP (rozměry, DPI, fonty, prázdné strany).
10. **listing** (`listing-specialist`) — text listingu pro KDP.
11. **finalize** (tool) — `README.md` knihy, součet nákladů, cesta ke složce.
12. **review** (`book-reviewer`, qualify, `approval: ask`) — poslední krok: běh
    zaparkuje a čeká na operátora s hotovým `interior.pdf` a `cover.pdf`. „Schválit“
    ukončí běh; „Požádat o změny“ s poznámkou ji agent převede na `product-factory
reject` (0 = titulka) a kniha se vrací přes **illustrate** → produce → render →
    … → review. Navazující workflow pak bude knihu publikovat na Amazon KDP.

## Nastavení

Poskytovatele volí projekt **publishing** (Projekty → publishing → env):
`PF_IMAGE_PROVIDER` = `mflux` | `fal` | `mock`, `PF_VISION_PROVIDER` = `ollama` |
`haiku` | `none`. Klíč `FAL_KEY` patří jen do tajemství projektu. Lidskou kontrolu
po libovolné fázi zapne `approval: ask` u fáze (výchozí je plně autonomní).
Rozpočet běhu hlídá `budget` — při překročení se běh zastaví a čeká na schválení.
