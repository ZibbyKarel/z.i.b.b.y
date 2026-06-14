---
name: Product Discovery
desc: 'Od tržního signálu k product specu připravenému pro Delivery: trh → uživatel → PRD → technický plán. Produkt, discovery, PRD, spec, nová feature od nuly.'
phases:
  - id: market
    type: agent
    agent: market-researcher
    consumes: task.md
    produces: market.md
    model: sonnet
    thinking: medium
  - id: user
    type: agent
    agent: ux-researcher
    consumes: market.md
    produces: user.md
    model: sonnet
    thinking: medium
  - id: prd
    type: agent
    agent: product-manager
    consumes: user.md
    produces: prd.md
    model: opus
    thinking: high
  - id: techplan
    type: agent
    agent: architekt
    consumes: prd.md
    produces: tech-plan.md
    model: opus
    thinking: high
---

# Product Discovery

Od signálu k zadání: **trh → uživatel → PRD → technický plán**. Výstup `tech-plan.md`
je přímý vstup pro `delivery` pipeline. Skilly `product-lens` a `product-capability`
jsou referencí.

## Fáze

1. **market** — `task.md` → `market.md`: poptávka, segmenty, konkurence, příležitost.
2. **user** — `market.md` → `user.md`: potřeby uživatelů, jobs-to-be-done, bolesti.
3. **prd** — `user.md` → `prd.md`: rozsah, success kritéria, ne-cíle, priority.
4. **techplan** — `prd.md` → `tech-plan.md`: rozpad na kroky a kontrakt změn —
   ready pro Delivery.

Discovery navrhuje; samotnou stavbu spustí operátor přes `delivery`.
