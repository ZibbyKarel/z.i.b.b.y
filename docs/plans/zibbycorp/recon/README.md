# ZibbyCorp recon — read with these corrections

Seven Sonnet research reports written 2026-09-24 before the operator's decisions. They
are **inputs, not specs**. Where a report disagrees with `../DECISIONS.md`, the decision
wins. Known overrides:

| Report says | Overridden by |
|---|---|
| "Agents form a shared pool; departments borrow agents per subtask" (05 §6, 06, IA doc) | **D-002** — every agent belongs to exactly one department. No borrowing, no "roles this department borrows" table, no pool-availability query. |
| "Old mythological names stay in code; corporate names are a display mapping" (05 §6, 06) | **D-004** — full rename in code + data migration. |
| "Chains need a new `ChainWalkerService` / `ChainsStorageService`" (06 §3.2) | **D-005** — chains are built on the existing `HandoffService`, no new service. |
| "Teams has no home in the design" (05 §4, 06 §5) | **D-003** — Teams stays, becomes a WORK sub-tab. |
| "Integrations may move to department scope" (06 §5) | **D-011** — integrations stay project-scoped; the department tab is a derived read-only view. |

| File | Scope |
|---|---|
| `01-design-system.md` | Current DS inventory, tokens, conventions, gaps |
| `02-web-routes.md` | Current routes, shell, features, settings tabs, e2e coverage |
| `03-backend-domain.md` | Contracts, entities, storage, dispatch, persona names, laws |
| `04-docs-process.md` | Arc/plan conventions, night-run loop, gates, lessons |
| `05-design-shell-org.md` | Design: shell + ORG screens → mapping + gaps |
| `06-design-work.md` | Design: WORK screens → mapping + gaps |
| `07-design-activity-policy-knowledge-ledger-system.md` | Design: remaining sections → mapping + gaps |
