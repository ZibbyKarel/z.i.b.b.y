---
name: PR Review — Thorough + Browser
phases:
  - id: test
    type: agent
    agent: test-automator
    consumes: task.md
    produces: test-report.md
    model: sonnet
    thinking: medium
  - id: architecture
    type: agent
    agent: architect-reviewer
    consumes: test-report.md
    produces: architecture.md
    model: opus
    thinking: high
  - id: browser
    type: agent
    agent: ui-ux-tester
    consumes: architecture.md
    produces: browser-report.md
    model: sonnet
    thinking: medium
  - id: aggregate
    type: agent
    agent: code-reviewer
    consumes: browser-report.md
    produces: review.md
    model: opus
    thinking: high
  - id: comment
    type: agent
    agent: github-commenter
    consumes: review.md
    produces: zibby-pr-review.md
    model: sonnet
    thinking: medium
    approval: ask
desc: >-
  Interní linka PR inboxu — spouští ji jen volba „Thorough + browser" tlačítka
  code-review u konkrétního GitHub PR. Nesměruj sem běžné úkoly: proklikání webu je
  `web-qa`, review existujícího kódu `code-audit` nebo `quality-scan`.
department: qa
complexity: deep
---

# PR Review — Thorough + Browser

Nejdůkladnější úroveň code-review v PR inboxu: **test → architecture → browser →
aggregate → comment**. Read-only vůči GitHubu: agenti nic nepostují, necommitují ani
nepushují.

## Fáze

1. **test** (`test-automator`): `task.md` → `test-report.md`. Checkne PR head a pustí
   lint / typecheck / testy repa.
2. **architecture** (`architect-reviewer`): `test-report.md` → `architecture.md`.
3. **browser** (`ui-ux-tester`): `architecture.md` → `browser-report.md`. Spustí aplikaci
   z PR headu lokálně a přes Playwright MCP proklikne změněné user journeys. Screenshoty
   uloží do složky běhu (`screenshots/`), na GitHub je nenahrává. Bez webového UI to
   jednou větou řekne a review pokračuje.
4. **aggregate** (`code-reviewer`): `browser-report.md` → `review.md`.
5. **comment** (`github-commenter`, `approval: ask`): `review.md` → `zibby-pr-review.md`.

## Proč ne `requires: [web]`

`web.url` projektu ukazuje na nasazený `main`, ne na PR. Fáze browser proto testuje PR
head spuštěný lokálně a projekt bez `web.url` review nezablokuje.

## Schválení

Stejně jako `pr-review-tested`.
