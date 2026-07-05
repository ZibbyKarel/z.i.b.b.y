# Self-development runbook — ZIBBY as a safe target for its own loop engine

> **Phase 12.8.** ZIBBY may point its Phase 10 loop engine at its **own** monorepo
> only under the conditions below. This runbook is the conclusion of Phase 12 — the
> "MEMORY BOMB" (commit `96d1294`) happened exactly because the loop was let loose on
> this repo without these rules. For the detailed root-cause analysis, see the Phase
> 12 post-mortem (git history around commit `96d1294`).

## The golden rule: **Builder ≠ Subject**

The orchestrator that **drives** self-development (the builder) must not run on the
same tree that it **modifies** (the subject):

- **Builder** = the running ZIBBY API. For self-development, run it from a
  **pinned/built** artifact, NOT `ts-node-dev --respawn` (`apps/api/package.json:6`,
  the `dev` script). `--respawn` restarts on every file write, so under
  self-development `AppModule` would reboot mid-edit (one of the meta-circular
  vectors, see Phase 12.4). Use `pnpm api:start` / `serve` (`ts-node` without
  `--respawn`), ideally from a different checkout than the subject.
- **Subject** = the repo the goal targets. Register it as a **project** with its own
  `path` pointing at a **fresh checkout** (`git clone` / `git worktree add` outside
  the builder's tree). The goal runner cuts its own worktree under
  `ZIBBY_WORKTREE_ROOT` regardless (Phase 12.7), so the builder's working tree is
  never edited.

Builder and subject **must not share** either a working tree or a `ZIBBY_DATA_DIR`.

## Three identities that must stay separate (Phase 12 root-cause analysis)

When the target == ZIBBY, three things collapse into one — Phase 12 pulled each of
them apart:

| Identity       | Collapse                                                                                 | Fix                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Process**    | the verifier's `pnpm test` boots a second `AppModule` → `reconstruct()` → re-dispatches the same goal | 12.1/12.2 (scope the verifier, never full-repo), 12.4 (gate boot re-dispatch), 12.5 (e2e isolation)   |
| **Filesystem** | the worktree + artifacts land inside the watched/tested tree                               | 12.7 (worktrees outside the repo, via `ZIBBY_WORKTREE_ROOT`)                                          |
| **Resources**  | no timeout/kill/cap/reaping → N copies eat RAM                                              | 12.3 (timeout + detached pgid + cap + reaping), 12.9 (await reaping on shutdown), 8.1 (budget)         |

## Resource governance as a dimension of the autonomy contract

The autonomy contract (`CLAUDE.md`'s "Laws") previously only addressed autonomy of
**judgment** (tiers, gate, approval-first). Phase 12 adds autonomy of **execution** —
how much compute a single run may consume — as an equally load-bearing floor:

- **Per-call ceiling:** `goalVerifyTimeoutMs` (12.3, runtime system config) plus an
  output cap; every verifier shell is a detached process group, killed at the
  deadline (`SIGTERM`→`SIGKILL`).
- **Per-run/per-goal budget:** Phase 8.1's `BudgetService` — daily/weekly
  token/run-count caps; exceeding one parks the dispatch behind a Tier-3 approval.
- **OS-level ceiling (recommended, outside the process):** run the subject's
  verifier under a real resource cap — a `memory.max`/`cpu.max` cgroup, a container
  with `--memory`/`--cpus`, or (the strongest isolation) a microVM (Firecracker) /
  gVisor. Shared-kernel containers are weaker (escape risk); for genuinely untrusted
  self-modifying runs, prefer a microVM. The in-process timeout (12.3) is only an
  interim ceiling, not a substitute.

## Defense in depth: the layers ZIBBY already has

No single layer is sufficient — safety is their sum:

1. **Approval gate + Tier 3** (core) — no push/merge/spend-past-cap without the
   operator.
2. **Worktree-per-run outside the repo** (12.7) — the subject's commits never touch
   the builder.
3. **Scoped verifier** (12.1/12.2) — never the full monorepo suite from inside the
   repo.
4. **Reaping + timeout** (12.3/12.9) — no orphans, no hung shells.
5. **Boot gate** (12.4) — a restart never re-dispatches a goal without
   `goalAutoResume: true` (runtime system config).
6. **Budget cap** (8.1) — bounded spend.
7. **Test isolation** (12.5) — `pnpm test` never touches live data or the real
   `claude` binary.

## How to launch a self-development run

```bash
# 1) Builder: a pinned run from a separate checkout (NOT ts-node-dev --respawn),
#    with its own data dir and worktrees outside the subject.
#    (set goalVerifyTimeoutMs in data/system-config.json, or via /settings)
ZIBBY_DATA_DIR=/var/zibby/builder-data \
ZIBBY_WORKTREE_ROOT=/var/zibby/worktrees \
AGENT_RUNNER_MODE=claude \
pnpm --filter @zibby/api serve

# 2) Subject: a fresh checkout of the repo, registered as a project with explicit
#    scoped checks.
git clone <zibby-remote> /var/zibby/subject
#    → register the project { path: "/var/zibby/subject", checks: ["pnpm --filter X test"] }
#    (NEVER leave checks empty — that falls back to the full-repo default, and 12.1 parks it)

# 3) Goal: maker = delivery pipeline, verifier scoped to the subject; run it through
#    the gate.
#    OS ceiling (recommended): run the whole builder process in a container/cgroup
#    with a memory+cpu cap.
```

## Exit-criterion checklist (Phase 12)

A goal targeting the ZIBBY repo must finish or park **without ever**:

- (a) running the full-monorepo suite from inside the repo — **12.1 + 12.2** ✅
- (b) leaving an orphaned child after an API kill — **12.3 + 12.9** ✅
- (c) re-dispatching itself on restart — **12.4** ✅
- (d) exhausting RAM — **12.3 timeout/cap + 8.1 budget + OS ceiling**

and `pnpm test` is fully isolated from live data and the real `claude` binary —
**12.5** ✅.

The 12.1–12.4 blast-radius set **must be green** (it is) before the loop is let
loose on this repo. The invariant guard test (worktree root outside the builder's
tree) is `apps/api/src/shared/self-development.test.ts`.
