---
name: PR Address Review Comments
phases:
  - id: address
    type: agent
    agent: fullstack-developer
    consumes: task.md
    produces: zibby-pr-address-comments.md
    model: sonnet
    thinking: high
  - id: reply
    type: agent
    agent: github-commenter
    consumes: zibby-pr-address-comments.md
    produces: zibby-pr-replies.json
    model: sonnet
    thinking: medium
desc: >-
  Interní linka PR inboxu — spouští ji jen tlačítko „Address review comments" u
  konkrétního GitHub PR. Nesměruj sem běžné úkoly: opravy kódu dělá `patch` nebo
  `quick-fix`.
department: dev
complexity: standard
---

# PR Address Review Comments

Tlačítko **Address review comments** v PR inboxu: jedna fáze **address**
(`fullstack-developer`): `task.md` → `zibby-pr-address-comments.md`. Agent v pracovním
worktree běhu checkne PR head, přečte nevyřešená review vlákna (`gh api graphql`),
opraví, co je v rozsahu PR, každou opravu jako samostatný commit, pustí rychlé checky
a zapíše report. Druhá fáze **reply** (`github-commenter`, agent, který píše na GitHub
hlasem operátora): `zibby-pr-address-comments.md` → `zibby-pr-replies.json`, krátká
odpověď na každé opravené vlákno („Good catch, fixed in abc1234."); u opravených vláken
přidá `resolve: true` a ZIBBY je po odpovědi resolvne. Po pushi ZIBBY znovu vyžádá review
od těch, kdo požadovali změny. Agenti nic nepushují, nic nepostují a vlákna neresolvují.

## Push a odpovědi

Push dělá ZIBBY, **jen fast-forward, nikdy force** (`git push origin <sha>:refs/heads/<head>`),
a teprve po úspěšném pushi postne odpovědi do vláken (jen do nevyřešených vláken tohoto PR),
resolvne opravená vlákna (`done in` v reportu) a znovu vyžádá review od těch, kdo požadovali
změny:

- **`Addressed: all`** (vše opraveno, checky zelené) — pushne a všechno výše udělá hned,
  rozhodnutím bylo kliknutí (Tier 2, výsledek je v outcome úkolu a v briefingu).
- **Cokoli jiného s novými commity** (`partial`, `checks failed`) — push i odpovědi čekají
  ve frontě schválení (Tier 3) s reportem. **Schválit** pushne, odpoví, resolvne opravená
  vlákna a znovu vyžádá review, **Zamítnout** zahodí.
- **Žádné nové commity** — `failed`, nic se nepushne ani nepostne.

## Obsazení

Linka patří `dev`, a běžec obsazuje každou fázi zaměstnancem oddělení linky. Proto má
`github-commenter` (jinak v `qa`) i zaměstnance v `dev` — stejný agent, stejný prompt.
