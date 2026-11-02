---
distilledAt: '2026-10-30T02:00:40.892Z'
runs: 29
learnings: 8
title: Destilace paměti — 2026-10-30
tags:
  - git
  - mcp
  - permissions
  - rebase
  - scheduled-runs
  - slack
  - squash-merge
  - stacked-prs
updated: '2026-10-30'
---
Poznatky destilované z dokončených běhů (2026-10-30).

## Rebase a stacked PR branch with --onto after its base was squash-merged

When a PR branch is stacked on a lower PR that was squash-merged into the base branch, a plain `git rebase origin/<base>` replays every already-merged commit and conflicts on each one. Find the last commit of the squashed stack, confirm the squash commit's files match that boundary, then run `git rebase --onto origin/<base> <last-stack-commit>` so only the remaining work is replayed.

## Scheduled and non-interactive runs need explicit MCP tool allowlists

Scheduled or unattended runs execute in don't-ask permission mode, so MCP tools that are not allowlisted are denied outright. This includes Slack read and send tools. Such runs must allowlist the specific MCP tools in `.claude/settings.json` before they can do their job. Also, MCP servers can return HTTP 401 at startup when their tokens expire, and those tokens need refreshing.

## shoptet-partner-cli is a CLI scaffolding repo, not a frontend or docs repo

The shoptet-partner-cli repository is a Node/oclif CLI toolchain for Shoptet partner addon scaffolding. It has no frontend, Docusaurus, sidebar, or cms4 code. Tasks for the Developers' Portal frontend or cms4 (Docusaurus, sidebar, feedback widget, classname cleanup, PHP controllers) cannot be implemented there. Patch workflows routed to this repo end in a no-op or a blocked state, so route such tasks to the correct repository.

## Git worktrees lack vendor/.env, so PHP tests cannot run locally there

New git worktrees of the cms repo do not include `vendor/` or `.env`. PHP tests and PHPStan therefore cannot run locally inside a worktree. Rely on CI for those checks, or copy the required files in before running them.

## PHPStan custom rule forbids static methods unless baselined

The custom PHPStan rule `shoptet.forbidStaticMethod` flags static method declarations. Each static method needs a `phpstan-baseline` entry, the same as its sibling static methods. Keep `@phpstan-pure` on pure methods even when it looks redundant, because removing it trips this rule. When a baselined error's message changes, update the baseline `rawMessage` to match.

## Promoting a path to PHPStan level 10 means updating phpstan.neon excludePaths

Paths analysed at level 10 are listed under `excludePaths.analyse` in `phpstan.neon`, in the list commented as generated or analysed at lvl10. A path that is promoted to level 10 but missing from that list gets analysed at both L8 and L10. When promoting an area, add all of its paths to that list.

## Slack channel ingest scope is limited to DMs and @-mentions

The Slack channel integration ingests only the operator's direct messages and @-mentions. It does not ingest general channel traffic. Chat can read Slack through the claude.ai connector.

## Coloring-book books are 24–30 interior pages and pass a preflight gate

The coloring-book workflow targets an interior of 24–30 pages, counting the title page. Each book must pass `book/preflight.json` with no errors before the human approval step. Reviewers send changes back as short notes such as per-page or cover edits.
