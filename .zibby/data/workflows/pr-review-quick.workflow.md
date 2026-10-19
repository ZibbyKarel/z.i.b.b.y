---
name: PR Review — Quick
phases:
  - id: aggregate
    type: agent
    agent: code-reviewer
    consumes: task.md
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
  Interní linka PR inboxu — spouští ji jen tlačítko „Code-review" u konkrétního
  GitHub PR. Nesměruj sem běžné úkoly: review existujícího kódu je `code-audit`
  nebo `quality-scan`.
department: qa
complexity: standard
---

# PR Review — Quick

Výchozí úroveň tlačítka code-review v PR inboxu: **aggregate → comment**. Read-only vůči
GitHubu: agenti nic nepostují, necommitují ani nepushují.

## Fáze

1. **aggregate** (`code-reviewer`): `task.md` → `review.md`. Řádkové review diffu,
   nálezy se závažností, file:line a návrhem opravy.
2. **comment** (`github-commenter`, `approval: ask`): `review.md` →
   `zibby-pr-review.md`. Přepíše nálezy do textu, který se postne na PR, stylem z
   promptu agenta. Běh tu zaparkuje ke schválení.

## Schválení

Ve frontě schválení je výsledné review. **Připomínky** ho vrátí fázi `comment` s tvou
poznámkou a nová verze se vrátí ke schválení. **Schválit** ho postne na PR jako
review typu, který zvolíš (schválit / vyžádat změny / komentář; předvybráno podle nálezů). **Zamítnout** ho zahodí.
