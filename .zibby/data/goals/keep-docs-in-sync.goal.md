---
name: keep-docs-in-sync
objective: Keep docs/api in sync with the contract schemas in libs/contracts.
maker:
  kind: agent
  id: ai-engineer
verifier:
  kind: checks
  commands:
    - "pnpm typecheck"
maxIterations: 3
desc: Drift between the ts-rest contracts and the prose docs is a recurring papercut.
---

Review the routers and Zod schemas under libs/contracts and update the matching
files in docs/api so every endpoint, field, and enum is documented accurately.
Stop when typecheck passes and no contract is undocumented.
