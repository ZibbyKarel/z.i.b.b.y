---
policy:
  - id: floor-purchase
    source: system
    locked: true
    match:
      - type: action
        action: purchase
    decision: ask
    resolve:
      type: human
  - id: floor-payment
    source: system
    locked: true
    match:
      - type: action
        action: payment
    decision: ask
    resolve:
      type: human
  - id: floor-git.force_push
    source: system
    locked: true
    match:
      - type: action
        action: git.force_push
    decision: ask
    resolve:
      type: human
  - id: floor-send_email
    source: system
    locked: true
    match:
      - type: action
        action: send_email
    decision: ask
    resolve:
      type: human
  - id: floor-delete
    source: system
    locked: true
    match:
      - type: action
        action: delete
    decision: ask
    resolve:
      type: human
---

System policy floor. Agents may only harden these rules.
