---
name: Code Audit
phases:
  - id: quality
    type: agent
    agent: code-reviewer
    consumes: task.md
    produces: quality.md
    model: opus
    thinking: high
  - id: security
    type: agent
    agent: security-auditor
    consumes: quality.md
    produces: security.md
    model: opus
    thinking: high
  - id: n-13
    type: agent
    agent: accessibility-auditor
    consumes: security.md
    produces: accessibility-auditor.md
    model: sonnet
    thinking: medium
  - id: performance
    type: agent
    agent: performance-engineer
    consumes: accessibility-auditor.md
    produces: performance.md
    model: sonnet
    thinking: medium
  - id: report
    type: agent
    agent: documentation-engineer
    consumes: performance.md
    produces: audit-report.md
    model: sonnet
    thinking: low
outputs:
  - type: file
    from: audit-report.md
    dest: vault
    to: code-audit-report
desc: >-
  Audituj existující kód bez jeho změny — kvalita, bezpečnost, přístupnost a výkon
  → souhrnná zpráva s prioritami. Audit, security review, code review,
  accessibility, performance, prohlídka kódu.
ownerSubsystem: loom
complexity: deep
---

# Code Audit

Read-only audit existujícího kódu — **nikdy ho nemění**. Čtyři optiky za sebou
(kvalita → bezpečnost → přístupnost → výkon), nakonec sloučení do jedné
prioritizované zprávy.

## Fáze

1. **quality** — `task.md` → `quality.md`: korektnost, čitelnost, code smells.
2. **security** — `quality.md` → `security.md`: zranitelnosti, secrets, authz, vstupy.
3. **accessibility** — `security.md` → `accessibility-auditor.md`: WCAG 2.2
   AA, ARIA, klávesnice, screen reader.
4. **performance** — `accessibility-auditor.md` → `performance.md`: horká místa,
   alokace, dotazy.
5. **report** — `performance.md` → `audit-report.md`: nálezy seřazené dle dopadu,
   s návrhem dalšího kroku (samostatný Delivery běh na opravu).

Žádná `verify` fáze ani smyčka — audit nálezy hlásí, neopravuje. Oprava je vlastní
`delivery` běh, který tahle zpráva nakrmí.
