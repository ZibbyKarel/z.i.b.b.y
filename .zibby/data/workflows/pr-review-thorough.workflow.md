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
  - id: final
    type: agent
    agent: code-reviewer
    consumes: architecture.md
    produces: zibby-pr-review.md
    model: opus
    thinking: high
desc: >-
  Interní linka PR inboxu — spouští ji jen tlačítko „Důkladné code-review" u
  konkrétního GitHub PR. Nesměruj sem běžné úkoly: review existujícího kódu je
  `code-audit` nebo `quality-scan`.
department: qa
complexity: deep
---

# PR Review — Thorough

Úroveň „důkladné" tlačítka code-review v PR inboxu (todo-4). Dvě optiky nad jedním
PR: **architecture → final**. Read-only: nic se nepostuje, necommituje ani nepushuje.

## Fáze

1. **architecture** (`architect-reviewer`): `task.md` (zadání z inboxu) →
   `architecture.md`. Checkne PR head v pracovním worktree běhu a posoudí návrh:
   hranice modulů, kontrakty, tok dat, chybové stavy, bezpečnost, zpětnou kompatibilitu.
2. **final** (`code-reviewer`): `architecture.md` → `zibby-pr-review.md`. Projde diff
   řádek po řádku a sloučí to s nálezy z architektury do jednoho review.

## Výstup

Žádný `outputs:`. `zibby-pr-review.md` z fáze `final` přečte scheduler při dokončení
běhu a zaparkuje ho jako Tier-3 schválení `pr-review`. Po schválení odejde na GitHub
jako `COMMENT` review.
