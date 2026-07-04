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
desc: >-
  Audituj existující kód bez jeho změny — bezpečnost, kvalita a výkon → souhrnná
  zpráva s prioritami. Audit, security review, code review, performance,
  prohlídka kódu.
---

# Code Audit

Read-only audit existujícího kódu — **nikdy ho nemění**. Tři optiky za sebou
(bezpečnost → kvalita → výkon), nakonec sloučení do jedné prioritizované zprávy.

## Fáze

1. **security** — `task.md` → `security.md`: zranitelnosti, secrets, authz, vstupy.
2. **quality** — `security.md` → `quality.md`: korektnost, čitelnost, code smells.
3. **performance** — `quality.md` → `performance.md`: horká místa, alokace, dotazy.
4. **report** — `performance.md` → `audit-report.md`: nálezy seřazené dle dopadu,
   s návrhem dalšího kroku (samostatný Delivery běh na opravu).

Žádná `verify` fáze ani smyčka — audit nálezy hlásí, neopravuje. Oprava je vlastní
`delivery` běh, který tahle zpráva nakrmí.
