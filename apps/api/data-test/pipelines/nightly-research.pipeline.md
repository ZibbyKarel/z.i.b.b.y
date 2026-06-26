---
name: Nightly Research
phases:
  - id: researcher
    agent: researcher
    consumes: topic.md
    produces: sources.md
    model: sonnet
    thinking: medium
  - id: architect
    agent: architect
    consumes: sources.md
    produces: knowledge.md
    model: opus
    thinking: high
desc: 'Researcher nasbírá zdroje, Architekt je zsyntetizuje do poznámky.'
budget: 15
---

# Nightly Research

Researcher nasbírá zdroje, Architekt je zsyntetizuje do poznámky.

## Fáze
1. **researcher** — `topic.md` → `sources.md`
2. **architect** — `sources.md` → `knowledge.md`
