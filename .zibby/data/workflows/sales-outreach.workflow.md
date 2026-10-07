---
name: Sales Outreach
phases:
  - id: leads
    type: agent
    agent: lead-researcher
    consumes: task.md
    produces: leads.md
    model: haiku
    thinking: low
  - id: angle
    type: agent
    agent: competitive-analyst
    consumes: leads.md
    produces: angle.md
    model: sonnet
    thinking: medium
  - id: sequence
    type: agent
    agent: sdr
    consumes: angle.md
    produces: sequence.md
    model: haiku
    thinking: low
  - id: polish
    type: agent
    agent: content-quality-editor
    consumes: sequence.md
    produces: outreach.md
    model: sonnet
    thinking: medium
    qualify: true
    loop:
      to: sequence
      driftTo: angle
      maxRetries: 2
      escalate: true
      then: park
desc: >-
  Od cílového seznamu po hotovou outbound sekvenci: research → konkurence →
  sekvence → redakce. Sales, outbound, prospecting, cold outreach, oslovení
  leadů.
department: com
complexity: standard
---

# Sales Outreach

Obchodní linka: **leady → úhel → sekvence → redakce**. Opírá se o skilly
`lead-intelligence` a `investor-outreach`.

## Fáze

1. **leads** — `task.md` → `leads.md`: ICP, cílový seznam, obohacení, skóre fit/timing.
2. **angle** — `leads.md` → `angle.md`: diferenciace a relevantní háček vůči konkurenci.
3. **sequence** — `angle.md` → `sequence.md`: vícekroková personalizovaná sekvence
   (e-mail + LinkedIn + call).
4. **polish** — `sequence.md` → `outreach.md`: redakce tónu a délky. Je to **brána**
   (`qualify`): `pass` = hotová sekvence; `gap` (slabá sekvence) vrací na
   **sequence**, `drift` (míjí úhel) až na **angle**; chybějící verdikt = `gap`.
   2× s eskalací, pak park.

Vlastní odeslání komukoli je Tier-3 — sekvence se připraví k bráně, kontakt schvaluje
operátor. ZIBBY nikdy neoslovuje reálné lidi autonomně.
