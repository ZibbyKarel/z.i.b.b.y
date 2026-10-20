---
name: PR Review — Thorough
phases:
  - id: architecture
    type: agent
    agent: architect-reviewer
    consumes: task.md
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
  Interní linka PR inboxu — spouští ji jen tlačítko „Důkladné code-review" u
  konkrétního GitHub PR. Nesměruj sem běžné úkoly: review existujícího kódu je
  `code-audit` nebo `quality-scan`.
department: qa
complexity: deep
---

# PR Review — Thorough

Úroveň „důkladné" tlačítka code-review v PR inboxu: **architecture → aggregate →
comment**. Read-only vůči GitHubu: agenti nic nepostují, necommitují ani nepushují.

## Fáze

1. **architecture** (`architect-reviewer`): `task.md` → `architecture.md`. Checkne PR
   head v pracovním worktree běhu a posoudí návrh: hranice modulů, kontrakty, tok dat,
   chybové stavy, bezpečnost, zpětnou kompatibilitu.
2. **aggregate** (`code-reviewer`): `architecture.md` → `review.md`. Projde diff řádek po
   řádku a sloučí to s nálezy z architektury do jedné agregace.
3. **comment** (`github-commenter`, `approval: ask`): `review.md` →
   `zibby-pr-review.md`. Přepíše agregaci do textu, který se postne na PR, stylem z
   promptu agenta. Běh tu zaparkuje ke schválení. Dokument má shrnutí a pod ním jeden blok `### cesta:řádek (Závažnost)` na nález; ZIBBY ho postne jako jedno review s inline komentáři na řádcích (řádek mimo diff GitHub odmítne, pak se postne jako jeden komentář).

## Schválení

Ve frontě schválení je výsledné review. **Připomínky** ho vrátí fázi `comment` s tvou
poznámkou a nová verze se vrátí ke schválení. **Schválit** ho postne na PR jako
review typu, který zvolíš (schválit / vyžádat změny / komentář; předvybráno podle nálezů). **Zamítnout** ho zahodí. Nálezy se postnou jako inline komentáře na řádcích, shrnutí jako tělo review.
