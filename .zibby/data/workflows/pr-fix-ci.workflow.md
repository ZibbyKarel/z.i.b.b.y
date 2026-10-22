---
name: PR Fix CI
phases:
  - id: fix
    type: agent
    agent: fullstack-developer
    consumes: task.md
    produces: zibby-pr-fix-ci.md
    model: sonnet
    thinking: high
desc: >-
  Interní linka PR inboxu — spouští ji jen tlačítko „Fix CI" u konkrétního
  GitHub PR. Nesměruj sem běžné úkoly: červené CI zařazuje `ci-triage`, opravy
  kódu dělá `patch` nebo `quick-fix`.
department: dev
complexity: standard
---

# PR Fix CI

Tlačítko **Fix CI** v PR inboxu: jedna fáze **fix** (`fullstack-developer`): `task.md` →
`zibby-pr-fix-ci.md`. Agent v pracovním worktree běhu checkne PR head, přes `gh` přečte
selhávající checky, u každého najde první skutečnou chybu a rozliší, jestli jde o kód
(oprava jako samostatný commit `fix(ci): …`), nebo ne (flaky test, infra, secrets — bez
změny). Checky nikdy nezeslabuje. Opravené příkazy pustí lokálně a zapíše report, jehož
první řádek je `Fixed: all|partial|checks failed|not code|aborted`. Agent nic nepushuje
a CI znovu nespouští.

## Push

Push dělá ZIBBY, **jen fast-forward, nikdy force**:

- **`Fixed: all` na vlastním PR operátora** — pushne hned, rozhodnutím bylo kliknutí.
- **Cokoli jiného s novými commity** — push čeká ve frontě schválení (Tier 3) s reportem.
  **Schválit** pushne, **Zamítnout** zahodí.
- **Žádné nové commity** — `failed`, nic se nepushne.
