---
name: Build Feature
phases:
  - id: architect
    agent: architect
    consumes: task.md
    produces: design.md
    model: opus
    thinking: high
  - id: coder
    agent: coder
    consumes: design.md
    produces: branch
    model: sonnet
    thinking: medium
  - id: tester
    agent: tester
    consumes: branch
    produces: test-report.md
    model: sonnet
    thinking: medium
    loop:
      to: coder
      maxRetries: 3
      escalate: true
      then: fail
  - id: doc
    agent: doc
    consumes: branch
    produces: README.md
    model: sonnet
    thinking: low
desc: 'Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.'
budget: 25
---

# Build Feature

Spec → implementace → testy → docs, se zpětnou smyčkou u Testera.

## Fáze
1. **architect** — `task.md` → `design.md`
2. **coder** — `design.md` → `branch`
3. **tester** — `branch` → `test-report.md`
4. **doc** — `branch` → `README.md`
