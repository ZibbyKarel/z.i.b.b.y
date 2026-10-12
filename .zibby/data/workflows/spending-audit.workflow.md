---
name: Spending Audit
phases:
  - id: extract
    type: agent
    agent: finance-analyst
    consumes: task.md
    produces: extract.jsonl
    model: haiku
    thinking: low
  - id: prepare
    type: tool
    consumes: extract.jsonl
    produces: merchants.md
    commands:
      - spend-audit prepare extract.jsonl
    loop:
      to: extract
      maxRetries: 2
      escalate: true
      then: park
      escalation:
        - model: sonnet
          thinking: medium
  - id: classify
    type: agent
    agent: finance-analyst
    consumes: merchants.md
    produces: categories.json
    model: sonnet
    thinking: low
  - id: analyze
    type: tool
    consumes: categories.json
    produces: findings.md
    commands:
      - spend-audit analyze categories.json
    loop:
      to: classify
      maxRetries: 2
      escalate: true
      then: park
  - id: interview
    type: agent
    agent: finance-analyst
    consumes: findings.md
    produces: needs.md
    model: sonnet
    thinking: medium
    approval: ask
  - id: decide
    type: tool
    consumes: needs.md
    produces: research-brief.md
    commands:
      - spend-audit decide needs.md
    loop:
      to: interview
      maxRetries: 2
      escalate: true
      then: park
  - id: research
    type: agent
    agent: market-researcher
    consumes: research-brief.md
    produces: offers.md
    model: sonnet
    thinking: medium
  - id: refute
    type: agent
    agent: research-skeptic
    consumes: offers.md
    produces: refuted.md
    model: opus
    thinking: high
    qualify: true
    loop:
      to: research
      maxRetries: 2
      escalate: true
      then: savings
  - id: savings
    type: tool
    consumes: refuted.md
    produces: digest.md
    commands:
      - spend-audit savings refuted.md
    loop:
      to: refute
      maxRetries: 2
      escalate: true
      then: park
  - id: advise
    type: agent
    agent: finance-analyst
    consumes: digest.md
    produces: advice.md
    model: opus
    thinking: high
  - id: render
    type: tool
    consumes: advice.md
    produces: report.md
    commands:
      - spend-audit render advice.md
    loop:
      to: advise
      maxRetries: 2
      escalate: true
      then: park
outputs:
  - type: file
    from: report.md
    dest: vault
    to: spending-audit
desc: >-
  Analýza výdajů z bankovních výpisů (Air Bank PDF nebo CSV export) → přehled
  předplatných a služeb, duplicitních plateb, velkých nákupů, poplatků a útraty po
  kategoriích vs. ČSÚ, doptání co reálně potřebuješ, ověřené levnější alternativy a
  celkové úspory. Kde ušetřit, rozbor výpisu, kolik utrácím, předplatná, zrušit
  předplatné, osobní finance, spending audit.
department: fin
complexity: standard
budget:
  maxCostUsd: 12
  warnAtPct: 70
---

# Spending Audit

Jednorázový rozbor výdajů z bankovních výpisů → rozhodovací report s úsporami. **Čísla
počítá jen `spend-audit` CLI** (tool fáze); agenti čtou výpisy, pojmenovávají obchodníky,
ptají se a píší doporučení. Nic se neruší ani neodesílá — vše je Tier-1, report končí
checklistem, který provede operátor. Návrh: `docs/plans/spending-audit/DESIGN.md`.

## Fáze

1. **extract** — výpisy z příloh (`context/attachments/`) → `extract.jsonl` (výpisy + transakce).
2. **prepare** — validace, kontrola zůstatků každého výpisu, odstranění překryvů,
   anonymizace účtů, klíče obchodníků → `merchants.md`. Nesedí-li zůstatek, vrací na
   **extract** s rozdílem (2× s eskalací, pak park).
3. **classify** — obchodník → název, kategorie, zda jde o službu → `categories.json`.
4. **analyze** — opakované platby, zdražení, triály, duplicity, velké nákupy, kategorie a
   trend, mikrovýdaje, poplatky, cizí měna, hotovost, cashflow, 50/30/20 a srovnání s ČSÚ
   (domácnost se 2 dětmi, na osobu ×4) → `findings.md`.
5. **interview** — max. 15 otázek s výchozími odpověďmi → `needs.md`. Běh **zaparkuje**:
   odpověz poznámkou (_revise_, např. „3 zrušit, 7 ano, 12 chci omezit na 1500“), fáze se
   přepíše s tvými odpověďmi a zaparkuje znovu; **approve** pustí běh dál.
6. **decide** — ověří rozhodnutí → `research-brief.md` (jen názvy služeb, ceny a
   požadavky — žádné transakce).
7. **research** — levnější tarif u stejného poskytovatele, rodinné/sdílené tarify,
   konkurence; zdroj + datum ověření → `offers.md`.
8. **refute** — skeptik každou nabídku znovu ověří (`verified`); neprojde-li ani po 2
   pokusech, pokračuje se s neověřenými nabídkami (počítají se jen jako „možná“).
9. **savings** — úspory po stupních jistá / ověřená / cíl / možná → `digest.md`.
10. **advise** — konkrétní doporučení s odkazy na nálezy → `advice.md`.
11. **render** — tabulky a čísla z dat + doporučení → `report.md`; neznámý odkaz nebo
    nepodložená částka vrací na **advise**.

Výstup: poznámka `spending-audit` ve vaultu s `domain: personal` (práce ji nevidí, git ji
ignoruje). Historie běhů zůstává ve složce běhu.
