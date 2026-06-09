---
name: Demo Pipe
phases:
  - id: a
    agent: demo-skill
    consumes: a.in
    produces: a.out
    model: sonnet
    thinking: medium
  - id: b
    agent: demo-skill
    consumes: b.in
    produces: b.out
    model: sonnet
    thinking: medium
---

demo pipeline
