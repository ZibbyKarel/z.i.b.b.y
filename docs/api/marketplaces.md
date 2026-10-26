# Marketplaces (Claude Code plugin marketplaces)

The **marketplaces** module connects Claude Code plugin marketplaces to ZIBBY and
installs their plugins at **user scope** through the `claude plugin` CLI, so an
installed plugin is available in the operator's terminal `claude` sessions and in every
ZIBBY run. Design: `docs/plans/2026-10-26-marketplaces.md`.

## Pieces

| Piece      | File                                                       | Role                                                                                                                                                         |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract   | `libs/contracts/src/marketplaces/marketplace.schema.ts`    | `MarketplaceSchema`, `MarketplaceSummarySchema`, `MarketplaceDetailSchema`, `MarketplacePluginSchema`, `AddMarketplaceInputSchema`, `MarketplaceSkillSchema` |
| Contract   | `libs/contracts/src/marketplaces/marketplaces.contract.ts` | `marketplacesContract` under `/api/marketplaces` + `/api/marketplace-skills`                                                                                 |
| Store      | `apps/api/src/marketplaces/marketplaces.store.ts`          | ZIBBY's record `data/marketplaces.json` (`$MARKETPLACES_FILE`), re-read per call                                                                             |
| Catalog    | `apps/api/src/marketplaces/marketplace-catalog.ts`         | reads `marketplace.json` + plugin components and `installed_plugins.json` (`$CLAUDE_PLUGINS_DIR`)                                                            |
| CLI        | `apps/api/src/marketplaces/marketplace-cli.ts`             | `MarketplaceCli` — the only `claude plugin` / `git` seam (env via `agentBaseEnv`); tests use a fake                                                          |
| Service    | `apps/api/src/marketplaces/marketplaces.service.ts`        | add / update / install / uninstall / remove, dev links                                                                                                       |
| Controller | `apps/api/src/marketplaces/marketplaces.controller.ts`     | 404 unknown marketplace/plugin, 400 bad source, 409 duplicate id, 502 CLI failure (its stderr)                                                               |

## Rules

- Only marketplaces in ZIBBY's record are managed; others in Claude are untouched.
  Adding one Claude already knows from the same source/path **adopts** it.
- `-y` / `--accept-command` is never passed: a marketplace-declared command fails the
  install and the CLI's message is shown.
- **Dev mode** links each installed plugin's cache `installPath` to its dir in a git
  checkout (a local path as-is, or a git URL cloned into `$MARKETPLACES_CLONE_DIR`,
  default `~/.zibby/marketplaces`). Removals are guarded: a link is only replaced inside
  `<CLAUDE_PLUGINS_DIR>/cache/`, a link is swapped for an empty dir before
  `claude plugin uninstall`, only a managed clone is pulled or deleted (inside the clone
  root). The operator's own checkout is never modified or deleted.
- Runs: `ClaudeRunCommandService` appends `--plugin-dir` for every installed plugin of
  every managed marketplace (see `docs/api/runner.md`).
