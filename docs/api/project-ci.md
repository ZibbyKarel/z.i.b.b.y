# Project CI — base-branch CI per project (todo-10)

Feeds the Bridge **Project status** widget (`projectStatus`): the CI state of each project's
base branch, down to the individual steps, plus an operator-clicked "Fix CI".

Contract: `libs/contracts/src/project-ci/` (`projectCiContract`). Implementation:
`apps/api/src/project-ci/` (`ProjectCiService`, `ProjectCiController`).

## `GET /api/project-ci/:projectId` → `ProjectCi`

| field         | meaning                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`    | `github` (read), `gitlab` (recognised from `gitRemote`, **not read yet — deferred**, no GitLab adapter exists), `none` (no GitHub link/token)                                               |
| `repoUrl`     | repo root on GitHub / GitLab (the sheet title links here)                                                                                                                                   |
| `branch`      | the base branch = the GitHub repo's `default_branch` (the branch `gh pr create` targets)                                                                                                    |
| `headSha`     | newest commit on the branch that has workflow runs                                                                                                                                          |
| `state`       | `passing` \| `failing` \| `running` \| `pending` \| `cancelled` \| `skipped` \| `none` \| `error` — worst-first rollup of the workflows; `error` = the repo could not be read (see `error`) |
| `workflows[]` | one run per workflow on `headSha` (the newest attempt), each with `jobs[]` → `steps[]`, all carrying a `state`                                                                              |

GitHub reads: `GET /repos/{repo}` → `GET /repos/{repo}/actions/runs?branch=…` →
`GET /repos/{repo}/actions/runs/{id}/jobs` per workflow. State mapping: `in_progress` → running,
other non-completed → pending; `success` → passing; `failure` / `timed_out` / `startup_failure` →
failing; `cancelled` → cancelled; any other conclusion (skipped, neutral, …) → skipped.

The result is **polled state**: cached in memory per project for 60 s (`PROJECT_CI_CACHE_MS`),
and the web polls every 60 s. The jobs of a **completed** run are immutable and fetched once; only
in-progress runs refetch their jobs. An unreachable repo is not an HTTP error: it returns `200` with
`state: "error"` and `error` ("rate limited" only for 429 or a 403 with `x-ratelimit-remaining: 0`,
otherwise "no access"), and is cached for the same 60 s. A missing link reads as
`provider: "none"`. `fixTaskId` names an open fix task for `headSha` (never cached). 404 only for
an unknown project.

## `POST /api/project-ci/:projectId/fix` → `201 { taskId }`

The operator's "Opravit CI" click on a red base branch. Re-reads CI (bypassing the cache), then
creates one ordinary task through `TaskSchedulerService.createTask` with `output: { type: "pr" }`
and a brief naming the failed workflow / job / steps (job names and logs are marked untrusted
data). The agent commits the fix on its own worktree branch and never pushes; on terminal the
task-output sink opens the PR itself — **Tier-2, act-then-report**. The operator reviews and merges.

The task is stamped `ScheduledTask.baseFixCi = { projectId, headSha }`. Clicks on one project are
serialised by an in-memory per-project lock, so a double click creates one task.

- `409` — the branch is not `failing`, or an open task (no outcome, not dead) with `baseFixCi` for
  this project and `headSha` exists.
- `422` — no GitHub link / token.
- `404` — unknown project.

The PR-level "Fix CI" (`POST /api/inbox/prs/fix-ci`, `pr-fix-ci` workflow) fast-forwards an
existing PR head and is not used here: a base branch gets a new PR instead.
