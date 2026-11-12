# Project CI — base-branch CI per project (todo-10)

Feeds the Bridge **Project status** widget (`projectStatus`): the CI state of each project's
base branch, down to the individual steps, plus an operator-clicked "Fix CI".

Contract: `libs/contracts/src/project-ci/` (`projectCiContract`). Implementation:
`apps/api/src/project-ci/` (`ProjectCiService`, `ProjectCiController`).

## `GET /api/project-ci/:projectId` → `ProjectCi`

| field         | meaning                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`    | `github` (read), `gitlab` (recognised from `gitRemote`, **not read yet — deferred**, no GitLab adapter exists), `none` (no GitHub link/token) |
| `repoUrl`     | repo root on GitHub / GitLab (the sheet title links here)                                                                                     |
| `branch`      | the base branch = the GitHub repo's `default_branch` (the branch `gh pr create` targets)                                                      |
| `headSha`     | newest commit on the branch that has workflow runs                                                                                            |
| `state`       | `passing` \| `failing` \| `running` \| `pending` \| `skipped` \| `none` — worst-first rollup of the workflows                                 |
| `workflows[]` | one run per workflow on `headSha` (the newest attempt), each with `jobs[]` → `steps[]`, all carrying a `state`                                |

GitHub reads: `GET /repos/{repo}` → `GET /repos/{repo}/actions/runs?branch=…` →
`GET /repos/{repo}/actions/runs/{id}/jobs` per workflow. State mapping: `in_progress` → running,
other non-completed → pending; `success` → passing; `failure` / `timed_out` / `startup_failure` →
failing; any other conclusion (skipped, neutral, cancelled, …) → skipped.

The result is **polled state**: cached in memory per project for 60 s (`PROJECT_CI_CACHE_MS`),
and the web polls every 60 s. A rate limit (HTTP 403/429) or other GitHub failure is an error
(the widget keeps its last data); a missing link is not — it reads as `provider: "none"`.
404 only for an unknown project.

## `POST /api/project-ci/:projectId/fix` → `201 { taskId }`

The operator's "Opravit CI" click on a red base branch. Re-reads CI (bypassing the cache), then
creates one ordinary task through `TaskSchedulerService.createTask` with `output: { type: "pr" }`
and a brief naming the failed workflow / job / steps (job names and logs are marked untrusted
data). The agent commits the fix on its own worktree branch and never pushes; on terminal the
task-output sink opens the PR itself — **Tier-2, act-then-report**. The operator reviews and merges.

- `409` — the branch is not `failing`, or a fix task (`Fix base-branch CI: …`) for the project is
  still in flight.
- `422` — no GitHub link / token.
- `404` — unknown project.

The PR-level "Fix CI" (`POST /api/inbox/prs/fix-ci`, `pr-fix-ci` workflow) fast-forwards an
existing PR head and is not used here: a base branch gets a new PR instead.
