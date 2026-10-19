---
name: PR Rebase
phases:
  - id: rebase
    type: agent
    agent: rebase-resolver
    consumes: task.md
    produces: zibby-pr-rebase.md
    model: opus
    thinking: high
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
`origin/<base>`, konflikty vyřeší tak, aby zůstal záměr obou stran, pustí typecheck a
testy dotčených souborů a zapíše report. Agent nic nepushuje.

## Push

Push dělá ZIBBY (`git push --force-with-lease` na head větev PR, nikdy na base):

- **Bez konfliktů** (GitHub hlásil PR jako mergeable a report začíná `Conflicts: none`)
  — pushne hned, rozhodnutím bylo kliknutí na Rebase.
- **Vyřešené konflikty** — force-push čeká ve frontě schválení (Tier 3) s reportem.
  **Schválit** pushne, **Zamítnout** zahodí.
