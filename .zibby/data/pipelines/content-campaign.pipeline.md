---
name: Content Campaign
desc: 'Postav marketingovou kampaň od průzkumu po hotový, SEO-laděný a redakčně odladěný obsah. Marketing, kampaň, content, launch, go-to-market obsah.'
phases:
  - id: research
    type: agent
    agent: market-researcher
    consumes: task.md
    produces: research.md
    model: sonnet
    thinking: medium
  - id: strategy
    type: agent
    agent: marketing-strategist
    consumes: research.md
    produces: strategy.md
    model: sonnet
    thinking: medium
  - id: write
    type: agent
    agent: copywriter
    consumes: strategy.md
    produces: draft.md
    model: haiku
    thinking: low
  - id: seo
    type: agent
    agent: seo-specialist
    consumes: draft.md
    produces: seo.md
    model: haiku
    thinking: low
  - id: edit
    type: agent
    agent: content-quality-editor
    consumes: seo.md
    produces: campaign.md
    model: sonnet
    thinking: medium
    loop:
      to: write
      maxRetries: 2
      escalate: true
      then: park
---

# Content Campaign

Marketingová linka: **průzkum → strategie → text → SEO → redakce**. Opírá se o skilly
`brand-voice`, `content-engine`, `seo` a `marketing-campaign`.

## Fáze

1. **research** — `task.md` → `research.md`: trh, publikum, konkurence, úhly.
2. **strategy** — `research.md` → `strategy.md`: pozicování, pilíře sdělení, kanály.
3. **write** — `strategy.md` → `draft.md`: koncept obsahu dle strategie a brand voice.
4. **seo** — `draft.md` → `seo.md`: klíčová slova, struktura, meta, interní prolinkování.
5. **edit** — `seo.md` → `campaign.md`: redakční kontrola; slabý draft vrací smyčka
   zpět na **write** (2× s eskalací), pak park.

Publikace je Tier-3: kampaň se připraví až k bráně, odeslání schvaluje operátor.
