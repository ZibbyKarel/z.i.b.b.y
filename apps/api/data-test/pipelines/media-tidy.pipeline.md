---
name: Media tidy
phases:
  - id: researcher
    agent: researcher
    consumes: watchlist.md
    produces: plan.md
    model: sonnet
    thinking: low
  - id: coder
    agent: coder
    consumes: plan.md
    produces: media
    model: sonnet
    thinking: low
desc: Stáhne a srovná média na Holly.
budget: 5
---

# Media tidy

Stáhne a srovná média na Holly.

## Fáze
1. **researcher** — `watchlist.md` → `plan.md`
2. **coder** — `plan.md` → `media`
