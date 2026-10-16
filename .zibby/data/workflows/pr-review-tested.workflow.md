---
name: PR Review — With Tests
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
  - id: final
    type: agent
    agent: code-reviewer
    consumes: architecture.md
    produces: zibby-pr-review.md
    model: opus
    thinking: high
desc: >-
  Interní linka PR inboxu — spouští ji jen tlačítko „Code-review s testy" u
  konkrétního GitHub PR. Nesměruj sem běžné úkoly: review existujícího kódu je
  `code-audit` nebo `quality-scan`, testy `qa-expert`.
department: qa
complexity: deep
---

# PR Review — With Tests

Nejdůkladnější úroveň tlačítka code-review v PR inboxu (todo-4):
**test → architecture → final**. Read-only vůči GitHubu: nic se nepostuje,
necommituje ani nepushuje.

## Fáze

1. **test** (`test-automator`): `task.md` → `test-report.md`. V pracovním worktree
   běhu checkne PR head (`gh pr checkout --detach`), nainstaluje závislosti a pustí
   vlastní lint / typecheck / testy repa. Zapíše, co běželo a co padlo. Co nešlo
   spustit, řekne výslovně.
2. **architecture** (`architect-reviewer`): `test-report.md` → `architecture.md`.
   Posouzení návrhu nad už checknutým PR headem.
3. **final** (`code-reviewer`): `architecture.md` → `zibby-pr-review.md`. Řádkové
   review diffu, sloučené s výsledky testů (sekce **Tests** první) a nálezy z
   architektury.

## Výstup

Stejně jako `pr-review-thorough`: `zibby-pr-review.md` z fáze `final` se zaparkuje
jako schválení `pr-review` a po schválení odejde jako `COMMENT` review.
