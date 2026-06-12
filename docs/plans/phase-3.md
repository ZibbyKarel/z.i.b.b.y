Phase 3 — Git and the PR gate

Context

ROADMAP.md Phase 3: Law 3 made structural — ZIBBY works on its own branch, prepares
the PR completely, and stops. Three sub-items: 3.1 workspace manager (worktree per
run), 3.2 push/PR as gated actions, 3.3 PR preparation up to the gate.

Builds directly on Phase 2 (docs/plans/phase-2.md): project-targeted claude/verify
stages already spawn with cwd = project.path; the delivery pipeline is seeded with
loops + parking; retries-parked vs approval-parked are distinguishable; verify is a
deterministic stage type.

Verified ground truth that shapes the design:

- The sandbox/spawn split already exists: RunSpec carries `cwd` (sandbox —
  sidecars, logs, intent files) and optional `spawnCwd` (child working dir),
  runner-core.types.ts:50–57. Pipeline claude stages set
  `spawnCwd: project.path` (pipeline-runner.service.ts:714), verify stages too
  (:682); intent coordination is pinned to the sandbox via `ZIBBY_INTENT_DIR`
  (runner-core.ts:292) so moving spawnCwd cannot strand the gate. Agent runs
  never set spawnCwd today — their `project` param is recorded but cosmetic
  (agent-runner.service.ts:117,176).
- `projectPath` is persisted on the pipeline aggregate
  (pipeline-run.schema.ts:80), resolved on start (pipeline-runner.service.ts:209–216)
  and re-resolved from the persisted run on resume/restart (:225–235) — the
  workspace record can ride the same rails.
- Run deletion already removes the sandbox: runner-core.ts:530–572 kills the
  child, then `fs.rm`s the run dir if inside the runs dir (:569–571, traversal-guarded).
  A worktree under the run dir would be rm'd as a plain folder — leaving stale
  `.git/worktrees/*` metadata in the project repo unless git removes it first.
- **No git usage exists in apps/api** — nothing shells out to git today; the only
  "git" reference is the hook's `git clean` destructive pattern.
- Gate floor: `data/POLICY.md` YAML frontmatter, five locked action rules
  (purchase, payment, git.force_push, send_email, delete → all `ask`/human).
  Evaluator is first-match-wins, agent rules before floor, `validateHardenOnly`
  blocks weakening at write time (gate-evaluator.service.ts:82–124). The action
  match condition already supports an optional `branch` qualifier
  (gate.schema.ts:14–19, matcher :130–133) — built for `git.push`, unused so far.
  `deny` is the max decision rank; a locked floor `deny` cannot be weakened.
- The approval hook (claude-approval-hook.mjs) classifies **deletion only**
  (RM_FAMILY + `find -delete` + `git clean`, :47–62), writes
  `intent-request.json` `{ action, context }` where context carries
  `riskType`/`summary`/`consequence`/`preview {kind:"command", shell, cmd}`.
  The web risk vocabulary already includes **"push"** with its own icon/badge
  (apps/web/features/approvals/approval.ts:18,122) — presentation is free.
- The execute-on-approve mechanism **already exists**: Variant B holds the live
  child on the decision file; approve → `core.resume()` writes `allow` → the
  child's pending Bash command executes. "Approving the pr-open gate executes
  `gh pr create`" needs no new machinery if the *agent* runs the command and
  the hook gates it.
- ApprovalRunKindSchema = ["agent", "pipeline-stage"]; IntendedActionSchema
  already has optional `branch` (gate.schema.ts:97) — only the hook→watcher→
  onIntent threading needs to carry it.
- There is **no endpoint to read files from a run dir** — only logs
  (getStageRunLogs, pipelines.contract.ts:63–122). RunDetail branches:
  approval-gated → RunApprovalGate, retries-parked → RunParkedPanel, else log
  panel (RunDetail.tsx:203–220). CodeBlock is the display primitive
  (RunParkedPanel uses it for the failure tail).
- Delivery pipeline phases: architekt → koder → review (loop→koder, park) →
  verify (loop→koder, park) → dokumentator; handoffs plan.md →
  implementation.md → review.md → docs.md; agents in apps/api/data/agents/
  with Czech instructions + output contracts. Koder's instructions do not
  commit anything today.
- e2e seams: fake-claude.mjs (env-driven steps/intents, collects --add-dir),
  demo-stage.mjs (PIPELINE_DEMO_FAIL_PHASES), ZIBBY_DATA_DIR isolation. No
  fake-binary-on-PATH precedent yet (CLAUDE_BIN is an env override, not PATH).

Decisions taken (defaults chosen, flag if you disagree):

1. Action vocabulary follows the **existing floor naming**, not the roadmap's
   bare names: `git.push` (branch-qualified), `pr.open`, `pr.merge` — consistent
   with `git.force_push` already on the floor and with the branch matcher that
   was built for `git.push`. Floor additions: git.push → ask, pr.open → ask,
   pr.merge → deny (locked). git.force_push stays as is.
2. One worktree **per run**, not per stage: all stages of a pipeline run share
   `<runDir>/worktree` so koder's commits are visible to review/verify. Branch
   `zibby/<runId>-<slug>` (slug from pipeline id / task title, sanitized to
   [a-z0-9-], capped). Created from the checkout's current HEAD — no
   fetch/pull, no network.
3. Non-git project path → **fall back to Phase 2 direct-checkout cwd** (logged
   warning). This keeps every existing Phase 2 fixture/e2e working unchanged
   (they aren't git repos) and makes worktrees an additive behavior. A *git*
   project where worktree creation fails (dirty lock, bad HEAD) → run fails
   with a readable error; silently touching the main checkout of a git project
   is exactly what 3.1 exists to prevent.
4. Cleanup: run delete calls `git worktree remove --force` (then
   `git worktree prune` as tolerant fallback) **before** the existing sandbox
   rm. The **branch is never deleted** — it may carry the PR; pruning branches
   is the operator's call (Law: no irreversible deletes).
5. Agent runs join the model: a resolvable `project` gets a worktree +
   `spawnCwd` too (their first spawnCwd ever — runner-core already supports
   it). Unresolvable project string → today's behavior, unchanged. This is
   what makes the roadmap's "agent run lands commits on its own branch" e2e
   honest, and it upgrades the cosmetic project label into a real target.
6. One clear decision at the end (North Star): the prepare-pr phase issues
   `git push -u origin <branch> && gh pr create …` as **one Bash call**; the
   hook classifies a chain by its most severe segment with rank
   pr.merge > git.force_push > pr.open > git.push > delete, so the chain
   announces a single `pr.open` intent → one approval covers push+PR. Approve
   → the held child executes both.
7. No new "on approve, run command" mechanism — the gate-held child *is* the
   executor (Variant B). The PR draft must therefore exist **before** the gh
   attempt: the prepare-pr agent writes pr-draft.md first, then attempts the
   gated chain.

Implementation order: 3.1 → 3.2 → 3.3. (3.2 is independent of 3.1 but 3.3
needs both; landing 3.1 first means 3.2's gates e2e can already assert
branch-shaped intents.)

---

3.1 Workspace manager

New apps/api/src/workspace/ module (WorkspaceService + WorkspaceModule, no new
deps — `execFile("git", …)` with explicit cwd; promisified, ~10s timeouts):

- `isGitRepo(path)` — `git rev-parse --git-dir` probe.
- `createWorktree({ projectPath, runId, slug, dir })` →
  `git worktree add -b zibby/<runId>-<slug> <dir> HEAD` run in projectPath;
  returns `{ branch, path }`. Branch-name sanitizer (lowercase, [a-z0-9-],
  collapse runs, trim, cap ~60 chars) as an exported pure helper.
- `removeWorktree({ projectPath, worktreePath })` —
  `git worktree remove --force` + tolerant `git worktree prune` (worktree dir
  already rm'd → prune still clears the metadata). Never touches branches.
- `diffstat({ worktreePath, baseRef })` — `git diff --stat <base>...HEAD` +
  `git log --oneline <base>..HEAD` (consumed by 3.3). Base = the HEAD captured
  at worktree creation (store it in the workspace record).

Contracts: shared optional `workspace: z.object({ branch, path, baseRef })` on
PipelineRunSchema and AgentRunSchema (new common schema in libs/contracts).

Pipeline runner: in start(), after project resolution — git project →
createWorktree under `${run.cwd}/worktree`, persist `workspace` on the
aggregate (writeAggregate); stage builders use `workspace.path ?? project.path`
for spawnCwd (claude :714 and verify :682 branches). resumeParked/reconstruct
re-read `workspace` from run.json — the worktree outlives parking (no child,
durable, same as retries-parked itself).

Agent runner: launch() resolves `project` against ProjectsStorage (id, then
name — same rule as pipeline-runner.service.ts:212); resolvable + git →
worktree under the run sandbox, `spawnCwd` set, `workspace` persisted in the
run record extras. Sandbox stays the intent/artifact home (ZIBBY_INTENT_DIR
unchanged).

Deletion: both delete paths call workspace.removeWorktree before
core.delete()'s sandbox rm (order matters — rm-first strands git metadata).
Tolerant of already-gone worktrees.

Delivery agents start committing: koder.md gains an explicit handoff-contract
step — "commit your changes on the current branch (you are on a dedicated
zibby/* branch); never push" — review/verify then see committed work and the
3.3 diffstat has something to show. (Plain `git add/commit` is ungated — local
and reversible.)

Tests: unit workspace.service.test.ts against a temp fixture git repo
(init → createWorktree → branch exists → commit in worktree → main checkout
untouched → removeWorktree → metadata pruned; non-git path; sanitizer matrix;
failure surfaces readable error). e2e: extend pipelines.e2e + agents e2e with
a git-init'ed fixture project — run lands commits on `zibby/<runId>-*`, main
ref unchanged, delete removes the worktree and keeps the branch; restart while
retries-parked keeps workspace in run.json. Phase 2 non-git fixtures assert
the direct-checkout fallback still applies (decision 3).

3.2 Push/PR as gated actions

Floor (data/POLICY.md + the data-test copy used by e2e):

- `floor-git.push` — match action git.push (no branch qualifier = any branch),
  decision ask, resolve human.
- `floor-pr.open` — ask/human. `floor-pr.merge` — **deny**, locked. All
  source: system, locked: true. validateHardenOnly already guarantees an agent
  rule can't weaken these; nothing in the evaluator changes (action is a free
  string).

Hook (claude-approval-hook.mjs): extract the classification into a pure
`classify(command)` → `{ action, branch?, riskType, summary, consequence,
preview } | null`, exported so it's unit-testable (the file stays a
zero-dependency .mjs; `main()` runs behind an entry-point guard):

- git push: `git` + optional global opts (`-C <path>`, `-c k=v`,
  `--git-dir=…`, `--work-tree=…`) + `push`. `--force`/`-f`/`--force-with-lease`/
  `+refspec` → reclassify as the existing `git.force_push`. Extract the target
  branch from the refspec/args when present → intent `branch` (floor matches
  any; operators can add per-branch hardening — the matcher already supports it).
- gh: `gh` + optional `-R/--repo …` + `pr create` → pr.open; `pr merge` →
  pr.merge. Also `gh api … pulls … -X PUT`-style merges are out of scope
  (denylist honesty — note it in the file header like the rm comment does).
- Chains: split on `&&`/`||`/`;`/`|` (the parseTargets splitter already
  exists), classify each segment, announce the most severe by the rank in
  decision 6. Subshell/`$(…)` boundaries are covered the same way RM_FAMILY's
  leading class does it.
- riskType: git.push/git.force_push/pr.open → "push" (presentation exists),
  pr.merge → "push" with a merge-specific summary. Czech summary/consequence
  strings per action, preview stays `{ kind: "command", shell, cmd }`.
- intent-request.json gains optional `branch`; runner-core's watcher and both
  onIntent paths (agent-runner.service.ts:178–245, onStageIntent
  pipeline-runner.service.ts:551–614) thread it into the IntendedAction
  (schema field already exists).

Tests: classifier unit tests (new claude-approval-hook.test.ts importing
`classify`): plain push, `git -C /x push`, `git --git-dir=… push`, force
variants → git.force_push, refspec branch extraction, `gh pr create`,
`gh -R o/r pr merge`, chain picks most severe, `git pushover`/`echo "git push"`
non-matches, existing rm corpus still classifies delete. Gates e2e (fake-claude
FAKE_CLAUDE_INTENT with the new actions): push intent → run parks on approval,
approve → continues; pr.merge intent → denied outright, child exits on the
deny path; harden-only e2e: replaceAgentGates with an allow on pr.merge → 422
violation. gate-evaluator unit: branch-qualified rule matches/misses.

3.3 PR preparation (build up to the gate)

Pipeline + agents (apps/api/data + data-test copies):

- delivery.pipeline.md gains a final phase `pr-autor` (type agent, consumes
  docs.md, produces pr-draft.md, sonnet/medium) after dokumentator. New
  apps/api/data/agents/pr-autor.md: assemble PR title + body from the handoff
  set (plan.md, implementation.md, review.md, docs.md — absolute paths in the
  sandbox), write pr-draft.md (`# <title>` + body with sections Změny /
  Ověření / Rizika), **then** attempt the single gated chain
  `git push -u origin <branch> && gh pr create --title … --body-file
  pr-draft.md` (decisions 6–7). The hook announces pr.open → ask → run parks
  as approval-parked; approve → the held child pushes and opens the PR; deny →
  stage error → pipeline failure path. The PR *is* the gate — everything
  before it already happened on the zibby/* branch.

Diffstat for the Tier 3 card: when onStageIntent evaluates an `ask` for
pr.open/git.push on a run with a `workspace`, the runner calls
workspace.diffstat() and writes `<runRoot>/diffstat.txt` before
requestApproval — the decision surface is assembled at park time, not on
demand.

Artifact endpoint: new `getPipelineRunArtifact` in pipelines.contract.ts —
GET /pipelines/runs/:pipelineRunId/artifacts/:name with an explicit allowlist
(pr-draft.md, diffstat.txt, plan.md, implementation.md, review.md, docs.md),
resolved traversal-safe inside the run dir (resolveSafeFile pattern), 404 when
absent. No generic file browser — the allowlist is the API.

Web (apps/web/features/runs/):

- New RunPrGatePanel: when the pending approval's action is pr.open (or
  git.push), RunDetail renders it above RunApprovalGate — pr-draft.md and
  diffstat.txt via a new useRunArtifactQuery (CodeBlock, maxHeight md; HudPanel
  titled from i18n). Missing artifacts → panel simply omits the block (agent
  runs gated on push have a diffstat but no draft).
- i18n keys runs.prDraft, runs.prDiffstat (cs + en).

Tests: unit for diffstat write-on-park bookkeeping and the artifact-name
allowlist/traversal rejection; e2e: fixture git project + delivery run where
fake-claude announces pr.open — run parks, diffstat.txt exists, artifact
endpoint serves draft + diffstat, approve → fake-claude executes the recorded
command via a `gh` **shim on PATH** (new test/fixtures/bin/gh that appends its
argv to gh-invocations.json; fake-claude gains an env knob — execute the
announced command after an allow decision, with fixtures/bin prepended to
PATH) — assert the exact `gh pr create --title … --body-file …` invocation
landed and nothing ran before approval; deny variant → no invocation recorded.
Web-components: RunPrGatePanel renders draft + diffstat and hides on missing
artifacts. Classifier rank test: the full chain announces pr.open (not
git.push).

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit
(rtk typecheck lies) → pnpm test → pnpm exec vitest run --project
web-components.

Phase exit: pnpm e2e green on a clean tree (the 2 quarantined pipeline e2e
tests stay quarantined — verify on a clean worktree, never stash/pop). Then
the manual proof per the roadmap exit criterion: a delivery run against a real
registered git project ends with commits on `zibby/<runId>-*`, a pr-draft.md +
diffstat on the run card, and exactly one pending approval; nothing reached
the remote before it; approving executes the push + `gh pr create`; the main
checkout's working tree and refs are untouched throughout.

Watch-outs:

- Deletion order is load-bearing: `git worktree remove` must run before the
  sandbox `fs.rm` (runner-core.ts:569–571) or the project repo accumulates
  stale .git/worktrees metadata. Keep the cleanup in the services that own the
  workspace record, not in runner-core (which stays git-agnostic).
- The worktree shares the project's repo config — its .claude settings/hooks
  execute in spawned stages, same trust posture as Phase 2's direct checkout
  (operator-registered projects only; the approval hook via --settings + the
  locked floor ride along regardless).
- The hook is in the spawn path of every real run: classify() must stay
  zero-dependency, synchronous, and fail-open to `null` (unclassified → not
  gated → Claude's own permissions) exactly like today's non-destructive path.
  A classifier bug that throws would block all Bash — wrap main()'s
  classification like the existing JSON-parse guard.
- POLICY.md exists twice (data/ and the e2e data dir) — floor edits must land
  in both or gates e2e silently tests the old floor.
- fake-claude is shared by every run-starting e2e — new env knobs
  (execute-on-allow, PATH prepend) must default off so existing suites are
  untouched.
- `git push` inside the *operator's own* interactive claude session is not
  ZIBBY's concern — the floor only governs runs spawned through RunnerCore
  with the hook installed. Don't try to gate anything else.
- Phase 2's verify/claude stages keep working against non-git fixture
  projects via the direct-checkout fallback — don't git-init existing
  fixtures; add new git fixtures beside them.
