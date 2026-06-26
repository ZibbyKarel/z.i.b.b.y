---
name: Demo Pipe
phases:
  - id: a
    type: agent
    agent: demo-skill
    consumes: a.in
    produces: a.out
    model: sonnet
    thinking: medium
  - id: b
    type: agent
    agent: demo-skill
    consumes: a.out
    produces: b.out
    model: sonnet
    thinking: medium
    loop:
      to: a
      maxRetries: 3
      escalate: true
      then: park
---

demo pipeline
