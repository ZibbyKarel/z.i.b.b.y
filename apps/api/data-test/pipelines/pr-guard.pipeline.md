---
name: PR Guard
phases:
  - id: reviewer
    agent: reviewer
    consumes: branch
    produces: review.md
    model: opus
    thinking: high
desc: Reviewer projde diff a připraví push k tvému schválení.
budget: 8
---

# PR Guard

Reviewer projde diff a připraví push k tvému schválení.

## Fáze
1. **reviewer** — `branch` → `review.md`
