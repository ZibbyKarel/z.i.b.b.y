# Phase 129 — Company GitHub integration + PR inbox sections and actions

## Why

- `devrel-knowledgebase` has an open PR but the PR inbox never shows it: `inbox.service.ts`
  takes repo + token only from a GitHub integration (`resolveGithubToken`), and that project
  has none. A GitHub integration carries one hard-coded `repo`, so a company-level GitHub
  integration (Phase 128) cannot cover several repos.
- The PR inbox has two buckets (to review / mine). The operator wants GitHub's sections and
  two actions.

## Decisions (2026-10-16)

| # | Decision |
|---|----------|
| G1 | A company-owned GitHub integration carries token + `username` (+ `streams`, `includeTeams`); `repo` becomes optional. The repo of each project is derived from its `gitRemote` (`repoFromGitRemote`). A project-owned GitHub integration keeps `repo` (required there) as an override. |
| G2 | Everything that reads `config.repo` (inbox, project PRs/merge, CI monitor, channel adapter, roadmap sync, merge queue, security scan) resolves the repo per project: project-owned → `config.repo`; company-owned → project's `gitRemote`. A company integration polled by the channel watcher / CI monitor iterates the repos of its inheriting projects. |
| G3 | Migration (extend `migrate:company-integrations`, dry-run default): project-owned GitHub integrations of one company sharing the same token+username merge into `<companyId>-github` (no `repo`), provided each project's `gitRemote` resolves to that integration's `repo`; otherwise skip with a reason. |
| P1 | PR inbox sections (GitHub style): **Needs your review** (`user-review-requested:@me`, always shown), **Needs your team's review** (team-requested, not direct), and for my PRs: **Waiting for review or checks** (no blocker, review pending or CI pending), **Needs action** (changes requested, CI failing, merge conflict, or draft), **Ready to merge** (approved + CI passing + mergeable, not draft). Empty sections are hidden except Needs your review. |
| P2 | **"Do code review"** button on PRs in the two review sections: creates a task with explicit target agent `code-reviewer`, explicit `projectId`, and the PR URL/number. The agent prepares the review; posting to GitHub is a Tier-3 approval ("Post review to GitHub", comment preview), always as `COMMENT`, never `APPROVE` / `REQUEST_CHANGES`. |
| P3 | **"Squash and merge"** button only in Ready to merge: confirm dialog (existing `HoldButton` pattern), reuses `POST /projects/:id/prs/:number/merge` with `merge_method: "squash"`, optional "delete branch after merge" (default on). Operator click only; the `floor-pr.merge: deny` rule for agents is untouched. Footer copy changes from "inbox never merges" to "merges only on your click". |
