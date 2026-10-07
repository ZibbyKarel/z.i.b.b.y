---
name: Web QA
phases:
  - id: explore
    type: agent
    agent: ui-ux-tester
    consumes: task.md
    produces: qa-findings.md
    model: sonnet
    thinking: medium
outputs:
  - type: file
    from: qa-findings.md
    dest: vault
    to: web-qa-findings
desc: >-
  Proklikej webový projekt v prohlížeči (Playwright) jako skutečný uživatel —
  hlavní user journeys, okrajové případy, chybové stavy, rozbité odkazy, layout —
  a sepiš strukturované nálezy (závažnost, journey, kroky k reprodukci, očekávané
  vs. skutečné). Jen pro webové projekty (projekt musí mít web.url). Web QA,
  proklikej web, otestuj UI, UX test, e2e průchod, najdi chyby na webu. Na kód
  bez prohlížeče použij `quality-scan` nebo `code-audit`.
department: qa
complexity: standard
requires:
  - web
---

# Web QA

Jedna fáze: **explore** — `ui-ux-tester` dostane v zadání base URL projektu
(`web.url`) a přes Playwright MCP projde web jako netrpělivý uživatel. Výstupem je
`qa-findings.md` ve tvaru, který předepisuje prompt agenta (nálezy F1…Fn se
závažností, journey, kroky k reprodukci, očekávaným a skutečným chováním a důkazem).

## Podmínka

`requires: [web]` — běh proti projektu bez `web.url` (nebo bez projektu) skončí
hned jako `failed` s důvodem v `failedReason`, žádný agent se nespustí.

## Výstup

Jeden výstup `type: file` z `qa-findings.md` do trezoru jako nota `web-qa-findings`.
Doručení vyšle signál `qa-findings` (`from: qa`) a automatizace `signal-qa-findings`
z něj po schválení založí úkol pro Dev. Workflow sám nikdy nemění kód ani neotevírá PR.

`complexity: standard` záměrně: nejlevnější příčku QA (záložní cíl nejistého
směrování) drží `quality-scan`. Web-only workflow by jako záloha selhal na každém
newebovém projektu.
