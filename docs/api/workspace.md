# Workspace (per-run git worktree)

`WorkspaceService` (`apps/api/src/workspace/workspace.service.ts`) owns the
per-run git worktree lifecycle: cutting an isolated branch/worktree for a
project-targeted run, checkpointing commits mid-run, and opening the PR once a
gate has approved it. It is pure `git`/`gh` invocation over `execFile`, no
external dependencies.

**No HTTP surface.** There is no `libs/contracts/src/workspace` and no
controller — `WorkspaceService` is internal-only, consumed directly by the
three runners and the task-output pipeline (`grep -rn "WorkspaceService"
apps/api/src` turns up only those call sites, never a route).

## Pieces

| Piece   | File                                        | Role                                                                                            |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Service | `apps/api/src/workspace/workspace.service.ts` | `WorkspaceService` — worktree create/remove, checkpoint commits, PR open, diff/commit log        |
| Module  | `apps/api/src/workspace/workspace.module.ts`  | Leaf module (no DI deps of its own); imported by the agent, pipeline, and goal runners           |

## Callers

- `apps/api/src/agents/agent-runner.service.ts` — cuts a worktree before an
  agent run starts against a git project.
- `apps/api/src/pipelines/pipeline-runner.service.ts` — cuts a worktree per
  pipeline run; also drives `openPr` and `commitLog` for the `pr` output sink.
- `apps/api/src/goals/goal-runner.service.ts` — cuts the worktree the goal
  loop's maker/verifier cycle iterates in.
- `apps/api/src/tasks/task-output.service.ts` — calls `checkpoint`,
  `commitLog`, and `diffstat` when a task's `pr` output is assembled at
  terminal, and `openPr` once the operator has approved the gate.

## Flow

1. **`isGitRepo(dir)`** — a cheap `git rev-parse --git-dir` probe. A runner
   only takes the worktree path when the target project is a git repo;
   otherwise it falls back to a direct checkout (non-git projects never get an
   isolated branch).
2. **`createWorktree({ projectPath, runId, slug, dir })`** — cuts a fresh
   worktree at `dir` off the project's current `HEAD`, on branch
   `zibby/<runId>-<slug>` (the slug is sanitized by the pure, unit-tested
   `sanitizeBranchSlug` helper: lowercase, `[a-z0-9-]` only, capped at 60
   chars, empty input becomes `run`). Returns the `Workspace` record
   (`{ branch, path, baseRef }`) that gets stored on the run aggregate. Throws
   `WorkspaceSetupError` on any git failure — the caller fails the run rather
   than silently falling back to the operator's main checkout.
3. **`checkpoint({ worktreePath, phaseId, summary })`** (Phase 9.3) — commits
   whatever is dirty in the worktree as `zibby-checkpoint(<phaseId>): <summary>`,
   using a synthetic `zibby@local` / `ZIBBY` git identity so it works even in a
   worktree with no configured user. Refuses (logs + returns `null`) unless
   `worktreePath` carries a `.git` worktree marker file — it can never fall
   back to committing the operator's main checkout. A clean tree also returns
   `null`. Never pushes.
4. **`commitLog` / `diffstat`** — `git log --oneline <baseRef>..HEAD` (and, for
   `diffstat`, also `git diff --stat`) since the branch was cut. Feeds the
   resume-context block a resumed/retried phase is prefixed with, and the
   human-readable diff the PR gate shows for the Tier-3 decision. Both are
   best-effort: a missing/cleaned worktree yields an empty string rather than
   throwing.
5. **`openPr({ cwd, branch?, title, bodyFile? | body? })`** — `git push -u
   origin <branch>` then `gh pr create`. This is the actual outward, Tier-3
   action a `pr` output performs — but **only ever called after the operator
   has approved the gate**; the runner never calls it before approval. `branch`
   is passed explicitly when the caller already evicted the worktree (a
   task-output gate pushes from the repo dir at terminal, since the branch ref
   outlives `git worktree remove` — commit ≠ push); otherwise it's derived from
   the worktree's current branch. Returns `{ url }` on success, `null` on any
   failure (a failed PR open is a soft error — the branch's commits are safe).
6. **`removeWorktree({ projectPath, worktreePath })`** — `git worktree remove
   --force` then `git worktree prune`, tolerant of an already-removed
   directory. **Never deletes the branch** — it may carry the PR, and pruning
   branches is the operator's call, not the system's.

## Endpoints

None. `WorkspaceService` has no controller and no ts-rest contract — every
method above is called in-process by the runners.

## Cross-references

- The Builder ≠ Subject rule for self-development runs (a run against ZIBBY's
  own repo works in a worktree that is never the running builder's checkout)
  is documented in `../ops/self-development.md`.
- The `pr` task/pipeline output kind that drives `checkpoint` → `diffstat` →
  (gate approval) → `openPr` is documented in `./tasks.md` and `./pipelines.md`.
