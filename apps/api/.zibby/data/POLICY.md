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
  - id: floor-git.push
    source: system
    locked: true
    match:
      - type: action
        action: git.push
    decision: ask
    resolve:
      type: human
  - id: floor-pr.open
    source: system
    locked: true
    match:
      - type: action
        action: pr.open
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
  - id: floor-jira.create_issue
    source: system
    locked: true
    match:
      - type: action
        action: jira.create_issue
    decision: ask
    resolve:
      type: human
  - id: floor-spend-past-cap
    source: system
    locked: true
    match:
      - type: action
        action: spend-past-cap
    decision: ask
    resolve:
      type: human
  - id: floor-pr.merge
    source: system
    locked: true
    match:
      - type: action
        action: pr.merge
    decision: deny
  - id: floor-channel-reply
    source: system
    locked: true
    match:
      - type: action
        action: channel-reply
    decision: notify
---

System policy floor. Agents may only harden these rules.
