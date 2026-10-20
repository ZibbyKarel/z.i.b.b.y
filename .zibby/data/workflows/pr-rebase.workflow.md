---
name: PR Rebase
phases:
  - id: rebase
    type: agent
    agent: rebase-resolver
    consumes: task.md
    produces: zibby-pr-rebase.md
    model: sonnet
    thinking: medium
desc: >-
  Interní linka PR inboxu — spouští ji jen tlačítko „Rebase" u konkrétního
  GitHub PR. Nesměruj sem běžné úkoly: práci s větvemi a gitem dělá
  `git-workflow-manager`.
department: dev
complexity: standard
---

# PR Rebase

Tlačítko **Rebase** v PR inboxu: jedna fáze **rebase** (`rebase-resolver`): `task.md` →
`zibby-pr-rebase.md`. Agent v pracovním worktree běhu checkne PR head, rebasne ho na
`origin/<base>`, konflikty vyřeší tak, aby zůstal záměr obou stran, jen po vyřešených konfliktech pustí rychlé checky (typecheck dotčeného balíčku a lint konfliktních souborů — testy nechává na CI v GitHubu) a zapíše report. Agent nic nepushuje.

## Push

Push dělá ZIBBY (`git push --force-with-lease` na head větev PR, nikdy na base):

- **Bez konfliktů** (report začíná `Conflicts: none`) — pushne hned, rozhodnutím bylo
  kliknutí na Rebase.
- **Vyřešené konflikty se zelenými rychlými checky** (`Conflicts: <n> files`) — pushne taky
  hned (todo-17).
- **Přerušený rebase nebo neprošlé checky** (`Conflicts: aborted`, `…, checks failed`) —
  force-push čeká ve frontě schválení (Tier 3) s reportem. **Schválit** pushne, **Zamítnout**
  zahodí.
