---
name: Research
phases:
  - id: scan
    type: agent
    agent: search-specialist
    consumes: task.md
    produces: sources.md
    model: haiku
    thinking: low
  - id: analyze
    type: agent
    agent: research-analyst
    consumes: sources.md
    produces: analysis.md
    model: sonnet
    thinking: medium
  - id: compete
    type: agent
    agent: competitive-analyst
    consumes: analysis.md
    produces: landscape.md
    model: sonnet
    thinking: medium
  - id: synthesize
    type: agent
    agent: data-researcher
    consumes: landscape.md
    produces: report.md
    model: opus
    thinking: high
    loop:
      to: scan
      maxRetries: 2
      escalate: true
      then: park
  - id: refute
    type: agent
    agent: research-skeptic
    consumes: report.md
    produces: refuted.md
    model: opus
    thinking: high
    qualify: true
    loop:
      to: synthesize
      maxRetries: 2
      escalate: true
      then: park
      driftTo: scan
desc: >-
  Hloubkový výzkum tématu z více zdrojů → citovaná syntéza. Research, deep dive,
  market sizing, due diligence, rešerše, průzkum, co je nového v…
department: rnd
complexity: standard
---

# Research

Doručovací smyčka pro výzkum: **sběr → analýza → konkurence → syntéza → oponentura**. Skilly
`deep-research`, `market-research` a `exa-search` jsou referenční hřiště pro to,
jak zdroje hledat a citovat.

## Fáze

1. **scan** — `task.md` → `sources.md`: najdi a posbírej relevantní zdroje s odkazy.
2. **analyze** — `sources.md` → `analysis.md`: vytěž fakta, rozpory, mezery.
3. **compete** — `analysis.md` → `landscape.md`: kdo, co, jak — srovnání a pozice.
4. **synthesize** — `landscape.md` → `report.md`: rozhodnutí-orientovaná, **citovaná**
   zpráva. Když podklady nestačí, smyčka vrací běh zpět na **scan** (2× s eskalací),
   pak zaparkuje pro operátora.
5. **refute** — `report.md` → `refuted.md`: **skeptik** (`research-skeptic`) se
   aktivně snaží závěry vyvrátit — hledá protiargumenty, vyvracející zdroje, slabé
   důkazy a mezery — a vrátí zprávu doplněnou o sekci _Protiargumenty a slabá místa_.
   Je to **brána** (`qualify`): `pass` pustí zprávu dál (do Knowledge), `gap`
   (závěr na existujících podkladech neobstojí) ji vrátí **synthesize** k přepsání,
   `drift` (podklady jsou jednostranné) vrací až na **scan** pro nové zdroje.
   Chybějící verdikt = `gap` (fail-closed); 2× s eskalací, pak park.

Každé tvrzení nese zdroj; výsledným artefaktem je `refuted.md` — rešerše pro rozhodnutí, která přežila oponenturu, ne „research theater".
