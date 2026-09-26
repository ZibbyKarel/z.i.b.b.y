# ZC-00 baseline — pre-change health snapshot

Captured 2026-09-24, on `feat/zibbycorp` @ `8e5586b5` (working tree has two uncommitted
items pre-dating this run — see "Pre-existing uncommitted state" below). All commands run
via `rtk proxy <cmd>` from repo root; exit codes trusted over `rtk`'s own summarized text.

## 1. TypeScript — per project

| Project | Command | Exit | Notes |
|---|---|---|---|
| apps/api | `tsc -p apps/api/tsconfig.json --noEmit` | **0** | clean |
| apps/web | `tsc -p apps/web/tsconfig.json --noEmit` | **2** | 7 errors, all in one family — see below |
| libs/contracts | `tsc -p libs/contracts/tsconfig.json --noEmit` | **0** | clean |
| libs/design-system | `tsc -p libs/design-system/tsconfig.json --noEmit` | **0** | clean |
| libs/forms | `tsc -p libs/forms/tsconfig.json --noEmit` | **2** | pre-existing config issue — see below |

### apps/web — 7 pre-existing errors (typed-routes / `/teams`)

All `TS2322`/`TS2345`, "not assignable to `RouteImpl<...>`" — Next.js typed-routes rejecting
literal `/teams` paths (missing/stale route typegen, not part of this arc):

- `apps/web/features/chat/components/ChatToolDock.tsx:106`
- `apps/web/features/teams/DetailScreen.tsx:80,135,176`
- `apps/web/features/teams/Screen.tsx:25,26`
- `apps/web/state/config.ts:29`

### libs/forms — pre-existing config error (not a code error)

`TS6059`: `libs/forms/vitest.setup.ts` is not under `rootDir` `libs/forms/src` — the
tsconfig's `include` pulls in the vitest setup file outside `rootDir`. Config issue in
`libs/forms/tsconfig.json`, unrelated to subsystem/department code.

## 2. `pnpm test` (vitest, all projects)

**Exit 0.** 600 test files passed, 1 skipped (601 total); 5760 tests passed, 17 skipped.
No failures. (Duration ~131s.)

## 3. `pnpm check:lint`

**Exit 1** — 170 errors, 3332 warnings, but **every file with an `error` line is outside
source**: all 35 flagged files are under `.claude/skills/impeccable/scripts/**` (a plugin's
own scripts) or `.design-match/.cdn-cache/**` (gitignored CDN cache — matches the known
gotcha in project memory: "`check:lint` red from a gitignored `.design-match/.cdn-cache`,
not your code"). Zero errors under `apps/`, `libs/`, or `tools/`. The 3332 warnings are
overwhelmingly `@typescript-eslint/no-unused-expressions` (2863) and `no-unused-vars` (467)
scattered across the repo (pre-existing, not blocking).

## 4. `pnpm check:deps`

**Exit 0.** node v25.8.1, pnpm 10.33.0, git 2.54.0, claude 2.1.281 (authenticated), gh
2.89.0 (authenticated), playwright chromium installed. All green.

## 5. `CI=true pnpm e2e` (Playwright)

Ran to completion in the background (~3.5 min, well under the 15-minute skip threshold).
`rtk proxy CI=true pnpm e2e`, **exit 1**: **8 passed, 2 failed** (10 tests, 1 worker,
retries included):

| Spec | Result |
|---|---|
| `e2e/approval.spec.ts:14` — confirm a pending approval | ✓ pass |
| `e2e/briefing.spec.ts:25` — generating a briefing appends it to the chat transcript | **✘ fail** (all 3 attempts) |
| `e2e/channels.spec.ts:26` — a triaged inbound message surfaces an approval; approving it handles the item | **✘ fail** (all 3 attempts) |
| `e2e/memory-graph.spec.ts` (4 tests: renders+navigates, search, knowledge-tier filter, daily-tier filter) | ✓ pass (all 4) |
| `e2e/pipeline-edit.spec.ts:11` — open a pipeline and enter edit | ✓ pass |
| `e2e/pipeline-run.spec.ts:11` — open a pipeline, see its progress | ✓ pass |

**Failure detail:**
- `briefing.spec.ts:35` — `getByTestId("chat-briefing-message-card")` never becomes
  visible (20s timeout, "element(s) not found").
- `channels.spec.ts:35` — `getByTestId("inbox-panel")` never becomes visible (20s
  timeout, "element(s) not found") on `/projects/demo-project?tab=integrations`.

**This does not match the operator-supplied "known pre-existing reds" list below** — this
run found `memory-graph` and `pipeline-run` fully green, and instead found `briefing` and
`channels` red. **Re-verified with a second, isolated run of just these two specs**
(`playwright test e2e/briefing.spec.ts e2e/channels.spec.ts`, still `CI=true` so 2 retries
apply): `briefing.spec.ts` failed **3/3** attempts, `channels.spec.ts` failed its attempts
too — same assertions, same testids not found. **Deterministic, not flaky.** These are
real baseline reds, not a one-off timing fluke, and predate any rename-arc code change
(nothing has landed yet on this branch beyond docs/recon). Treat both as **additional
baseline reds**, on top of — not instead of — the operator's original list; the operator's
list's other two items (`pipelines.e2e`, `runner-core.test.ts`) were re-checked and are
green (see below), while `memory-graph`/`pipeline-run` were also green both times.

## Known pre-existing reds (per task brief / project memory) — re-checked, both now green

The task brief and project memory named three expected pre-existing reds. This run
**re-checked all three and found none of them red today**:

- `apps/api` `pipelines.e2e` (`apps/api/test/pipelines.e2e.test.ts`) — **19/19 passed**
  in `pnpm test` (line: `✓ |api| test/pipelines.e2e.test.ts (19 tests) 9179ms`). The
  memory note's "2 pre-existing fails (env leak / demo timeout)" did not reproduce.
- `runner-core.test.ts` (`apps/api/src/runner/runner-core.test.ts`) — **35/35 passed**
  (`✓ |api| src/runner/runner-core.test.ts (35 tests) 2810ms`).
- Playwright `memory-graph` + `pipeline-run` specs — **all 6 tests passed** in §5.

So `pnpm test` (§2) is genuinely fully green with zero failures, not "green modulo known
reds" — those known reds are apparently flaky (order/environment-dependent) rather than
deterministic, or have since been fixed and the memory note is stale. **This run's actual
baseline reds are only the two new Playwright failures in §5** (`briefing.spec.ts`,
`channels.spec.ts`), plus the two pre-existing TypeScript items (apps/web typed-routes,
libs/forms rootDir config) and the two gitignored-dir lint findings — nothing else.

## Pre-existing uncommitted state (found at the start of this ZC-00 run, not created by it)

Two things were already sitting in the working tree before this recon started — both
appear to be preparatory work for the ZibbyCorp rename that predates this session:

1. **`docs/plans/zibbycorp/DECISIONS.md` is modified (uncommitted):** it already contains a
   **D-016** entry ("No legacy read tolerance; the migration covers everything —
   supersedes the D-004 tolerance clause") that is not reflected in `PART-0.md`'s ZC-01
   spec. D-016 says: no `legacy.ts` in contracts, `DepartmentIdSchema` stays a plain
   `z.enum` (not `z.preprocess`-wrapped), and the department registry's `color` field is
   **kept until ZB-13** (PART-0 ZC-01 says it's dropped immediately). Later phases (ZC-01
   especially) should follow D-016, which supersedes PART-0's tolerance-layer text.
2. **`tools/migrate/zibbycorp-map.mjs` is untracked** (new, uncommitted): a small
   dependency-free module exporting `DEPARTMENT_ID` (persona → new id) and `FUNCTION_WORD`
   (persona → neutral compound-word prefix) maps, plus a generic `rewrite()`/`rewritePath()`
   codemod helper. This inventory's script (`tools/migrate/rename-inventory.mjs`) imports
   `DEPARTMENT_ID`/`FUNCTION_WORD` from it directly, so the "proposed replacement" column in
   the rename inventory is generated from the same source a future codemod would use — no
   independent second copy of the mapping.

This baseline run did not commit, stage, or modify either of these — they're flagged here
so ZC-01 doesn't rediscover them from scratch.

## Concurrent activity detected mid-run (important for whoever reads this next)

While this ZC-00 baseline/inventory work was in progress, **another process modified files
in this same working tree**, live:

- `docs/plans/zibbycorp/PROGRESS.md` changed: ZC-00 and ZC-03 flipped to
  `🟦 subagent` / `🟦 subagent (script + dry-run)`, and a new "Execution notes" section
  was added describing a **codemod-based** rename (not the hand-authored ZC-01..ZC-04
  file-by-file approach in PART-0.md): a shared `tools/migrate/zibbycorp-map.mjs` map plus
  a new `tools/migrate/zibbycorp-codemod.mjs` that rewrites `apps`, `libs`, `tools`, `e2e`
  and does the `git mv`s, dry-run by default. Its dry-run reportedly found "364 files
  edited, 84 moved."
- `tools/migrate/zibbycorp-codemod.mjs` appeared on disk (untracked, 1.9K) partway through
  this session — confirmed present and readable; it is dry-run-only as written (no `--apply`
  run recorded), so no source files have actually been rewritten by it yet.

**This ZC-00 task did not touch, run, or rely on that codemod**, and did not edit
`PROGRESS.md` (to avoid clobbering the concurrent writer's in-flight edits). Whoever
picks up ZC-01 next should reconcile with whatever that concurrent process has since
done — check `git status` and `PROGRESS.md` again before assuming this document's
"nothing landed yet" framing (§5 above, and D-016's note) still holds.
