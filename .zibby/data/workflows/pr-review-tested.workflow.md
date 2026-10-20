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
  - id: aggregate
    type: agent
    agent: code-reviewer
    consumes: architecture.md
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
  Interní linka PR inboxu — spouští ji jen tlačítko „Code-review s testy" u
  konkrétního GitHub PR. Nesměruj sem běžné úkoly: review existujícího kódu je
  `code-audit` nebo `quality-scan`, testy `qa-expert`.
department: qa
complexity: deep
---

# PR Review — With Tests

Nejdůkladnější úroveň tlačítka code-review v PR inboxu: **test → architecture →
aggregate → comment**. Read-only vůči GitHubu: agenti nic nepostují, necommitují ani
nepushují.

## Fáze

1. **test** (`test-automator`): `task.md` → `test-report.md`. V pracovním worktree
   běhu checkne PR head (`gh pr checkout --detach`), nainstaluje závislosti a pustí
   vlastní lint / typecheck / testy repa. Zapíše, co běželo a co padlo. Co nešlo
   spustit, řekne výslovně.
2. **architecture** (`architect-reviewer`): `test-report.md` → `architecture.md`.
   Posouzení návrhu nad už checknutým PR headem.
3. **aggregate** (`code-reviewer`): `architecture.md` → `review.md`. Řádkové review diffu,
   sloučené s výsledky testů a nálezy z architektury do jedné agregace.
4. **comment** (`github-commenter`, `approval: ask`): `review.md` →
   `zibby-pr-review.md`. Přepíše agregaci do textu, který se postne na PR, stylem z
   promptu agenta. Běh tu zaparkuje ke schválení. Dokument má shrnutí a pod ním jeden blok `### cesta:řádek (Závažnost)` na nález; ZIBBY ho postne jako jedno review s inline komentáři na řádcích (řádek mimo diff GitHub odmítne, pak se postne jako jeden komentář).

## Schválení

Stejně jako `pr-review-thorough`: **Připomínky** vrátí review fázi `comment`,
**Schválit** ho postne na PR jako review typu, který zvolíš (schválit / vyžádat změny / komentář), **Zamítnout** ho zahodí. Nálezy se postnou jako inline komentáře na řádcích, shrnutí jako tělo review.
