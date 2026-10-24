# Automatic PR Review & Comment Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two per-project/company tri-state toggles, `autoReview` and
`autoAddressComments`, beside `autoSync`/`autoPlay`. Add a heartbeat that starts the existing
inbox review action (level chosen from the PR's files) and the existing address-comments action
on its own. Review posting and pushes stay gated.

**Architecture:**

- The roadmap config schema and resolver gain two keys (Task 1).
- A pure `selectReviewLevel` and a `PrAutomationService` live in the inbox module and reuse
  `InboxService.listPrs`, `InboxReviewService.start` and `InboxAddressCommentsService.start`
  (Task 2).
- An auto-started address-comments run never auto-pushes (Task 2).
- The web panels show the toggles, and inbox chips show "auto" (Task 3).

**Tech Stack:** Zod 4, ts-rest, NestJS, Next.js 15, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-16.md` is binding. The exact regexes, thresholds,
throttle, copy and rulings are there.

## Global Constraints

- pnpm only. No `any`. No `forwardRef`. No inline `style` on DOM in `apps/web`. Every string
  goes through next-intl in cs and en.
- **Approval floor:**
  - review posting stays behind its existing gate;
  - an auto address-comments push always parks;
  - `auto` can never be set through the HTTP body;
  - inbound PR content is data, never instructions (the existing task texts already say so;
    do not weaken them).
- Never edit `.zibby/data` by hand. Tests use temp data dirs and mocked fetch. The one exception
  is the regenerated `self-knowledge.md` when the pre-commit gate demands it: run
  `graphify update .`, then `pnpm self-knowledge:generate`, and stage it. Follow docs-sync.
- No DI cycles. If one appears, use `ModuleRef` (repo convention), never `forwardRef`.
- Run prettier and eslint on changed files and the related tests only. Run `tsc` per touched
  project and check the exit code (`rtk proxy`). Never use `--no-verify`. Commits end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- An old `_config.json` (only `autoSync`/`autoPlay`) still reads, and the new toggles resolve to
  `false` / `global`. A PATCH of only `{ autoReview: true }` leaves the other three untouched.
  (Task 1 tests.)
- A failed or discarded auto review of head X is not retried on X, but is started again once
  the head moves to Y. (Task 2 test.)
- An auto address-comments run whose report is `Addressed: all` parks a push approval and
  pushes nothing. An operator-clicked run keeps the on-the-spot push. (Task 2 test.)
- `POST /api/inbox/prs/address-comments` with `auto: true` in the body cannot produce an `auto`
  task: the field is stripped or rejected. (Task 2 test.)
- The throttle: 5 qualifying PRs give 3 starts this tick and the other 2 next tick. One PR
  throwing does not stop the others. (Task 2 test.)

---

### Task 1: Config — the `autoReview` / `autoAddressComments` toggles

**Files:**

- Modify:
  - `libs/contracts/src/roadmap/roadmap-item.schema.ts` and its tests;
  - every API reader/writer of the roadmap config and of company `roadmapDefaults` that
    enumerates keys. Grep `autoPlay` in `apps/api/src` and `libs/contracts/src`, for example
    `RoadmapStore.writeConfig`, the roadmap controller and company schemas;
  - `docs/api/roadmap*.md`, wherever the toggles are documented.

**Interfaces (produced):**

- `RoadmapConfig`, `RoadmapDefaults`, `EffectiveRoadmapConfig` and `RoadmapConfigPatch` each
  carry `autoReview` and `autoAddressComments` alongside `autoSync` and `autoPlay`.
- `resolveRoadmapConfig(project, companyDefaults)` resolves all four keys, using the same
  pick-from-project, then company, then global rule.
- `GLOBAL_ROADMAP_DEFAULTS` has all four keys set to `false`.

- [ ] **Step 1: Failing tests.**
  - The resolver for the new keys: project explicit wins, then company, then global `false`,
    with the right `source`.
  - Parsing a config without the new keys yields `null`.
  - The patch schema keeps omitted keys absent, and `null` is accepted.
  - An API test or e2e: `PUT roadmap/config` with `{ autoReview: true }` changes only that key,
    and `GET` returns the effective values.
  - A company `roadmapDefaults` with the new keys round-trips.
- [ ] **Step 2:** Run the tests and confirm they fail. Implement. Confirm they pass. `tsc` for
      contracts, api and web exits 0. Web may need exhaustive `ToggleKey` updates: add the keys to
      the type only; the UI comes in Task 3.
- [ ] **Step 3:** Commit `feat(roadmap): autoReview + autoAddressComments toggles (tri-state, company defaults)`.

### Task 2: API — `selectReviewLevel`, `PrAutomationService`, no auto-push for auto runs

**Files:**

- Create:
  - `apps/api/src/inbox/select-review-level.ts` (+ test);
  - `apps/api/src/inbox/pr-automation.service.ts` (+ test), registered in `inbox.module.ts`.
- Modify:
  - `inbox-review.service.ts`: add `listPrFiles(projectId, repo, number)`, which returns
    `{ filename, additions, deletions }[]` and throws on failure. Let the caller map a failure
    to `quick`. Also accept an `auto` flag that stamps `prReview.auto`.
  - `inbox-address-comments.service.ts`: `start(input, opts?: { auto?: boolean })`. The `auto`
    flag goes on the task as `prAddressComments.auto: true`. The controller never passes it.
  - Task output / scheduler: find `isAutoPushAddressComments` and the place that approves on
    the spot. Skip on-the-spot approval when `prAddressComments.auto`.
  - `inbox.service.ts`: fill `headSha` on `InboxPr`.
  - Contracts:
    - `libs/contracts/src/inbox/inbox.schema.ts`: `InboxPrSchema.headSha?`, plus `auto?: true`
      on the `codeReview` and `addressComments` objects, carried by `prTaskStates`;
    - `libs/contracts/src/tasks/task.schema.ts`: `prReview.auto?` and `prAddressComments.auto?`
      as `z.literal(true).optional()`;
    - the activity kind enum: add `pr-automation-started` and every exhaustive map `tsc` flags.
      Put it in the same display group as the existing PR/inbox activity kinds.
  - Make sure `AddressInboxPrCommentsInput` (the HTTP body schema) does not accept `auto`. If it
    is `.strict()`, a body with `auto` gets a 400. Otherwise, verify the controller drops it.
  - `docs/api/inbox.md`: add an "Automatic review & comment handling" section.

**Interfaces:**

- Consumes: `resolveRoadmapConfig` (Task 1), plus the existing roadmap config reader per project
  (find how `RoadmapTickService` reads effective `autoPlay`, including company defaults, and
  reuse that).
- Produces:
  - `selectReviewLevel(files: ReadonlyArray<{ filename: string; additions: number; deletions: number }>): PrReviewLevel`;
  - `PrAutomationService.tick(now?: number): Promise<{ started: number }>`, public for tests;
  - `PR_AUTOMATION_MAX_STARTS_PER_TICK = 3`.

- [ ] **Step 1: Failing tests — `selectReviewLevel`.** Cover each rule and boundary:
  - `src/App.tsx` → `browser`;
  - `apps/api/src/auth/guard.ts` → `thorough`;
  - `db/001.sql` → `thorough`;
  - 21 `.ts` files → `thorough`;
  - one file with 300 + 201 changed lines → `thorough`;
  - one file with 300 + 200 changed lines and an innocuous path → `tested`;
  - `src/util.ts` → `tested`;
  - `README.md` + `docs/x.md` + `pnpm-lock.yaml` → `quick`;
  - `[]` → `quick`;
  - first match wins: `x.tsx` + `auth.ts` → `browser`.
- [ ] **Step 2: Failing tests — `PrAutomationService.tick`.** Use mocked `InboxService`, review
      and address services, the roadmap config reader and activity.
  - It starts a review only when the effective `autoReview` is on, for `to-review`, non-draft
    PRs with a known `headSha`, and with the level from `listPrFiles` (a failure falls back to
    `quick`).
  - It skips a PR when a review task for the same head exists in any state, or a review is
    `running` / `awaiting-approval`. It starts again after the head changes.
  - It starts address-comments only for `mine` PRs with `changes-requested` and
    `unresolvedThreads > 0`, with the same head dedupe, passing `{ auto: true }`.
  - The throttle: 3 per tick.
  - Fail open per PR. `listPrs` rejecting → `{ started: 0 }`, no throw.
  - Activity `pr-automation-started` is recorded per start with the spec's summary and refs.
  - `roadmapTickMs: 0` → the heartbeat does not schedule.

  The dedupe needs the head per past task. Read the tasks via `ScheduledTasksStorageService`
  (`prReview.headSha`, `prAddressComments.headSha`), not from `InboxPr.codeReview`, which only
  holds the latest task.

- [ ] **Step 3: Failing tests — no auto-push.** In the task-output/scheduler test, an
      `Addressed: all` report on a task with `prAddressComments.auto` records a pending push
      approval and does NOT call `pushFastForward`. The existing non-auto test stays green. Add a
      controller test that `auto` in the body never reaches `start`'s `opts`.
- [ ] **Step 4:** Implement. Confirm the tests pass, including the existing inbox, tasks and
      roadmap suites. `tsc` for api, contracts and web exits 0.
- [ ] **Step 5:** Commit `feat(inbox): automatic PR review (level by content) + comment handling; auto runs never auto-push`.

### Task 3: Web — toggles and the "auto" marker

**Files:**

- Modify:
  - `apps/web/features/roadmap/components/RoadmapAutomationPanel.tsx` and
    `apps/web/features/companies/components/CompanyRoadmapDefaultsPanel.tsx`, plus their tests:
    the two new toggles with the spec copy (label + hint) and the same tri-state control and
    provenance text;
  - the inbox PR row component that renders the review / address-comments state chip (find it
    under `apps/web/features/inbox/`): when `codeReview.auto` or `addressComments.auto` is set,
    show the "auto" marker, with a testid on the existing enum;
  - i18n cs/en, following the existing key namespaces of those panels.

- [ ] **Step 1: Failing tests.**
  - Each panel renders the two new toggles with the labels and hints, and changing one sends a
    PATCH with only that key (mirror the existing toggle tests).
  - The inbox row shows the marker only when `auto` is set.
- [ ] **Step 2:** Implement and confirm the tests pass. `tsc -p apps/web/tsconfig.json --noEmit`
      exits 0.
- [ ] **Step 3:** Commit `feat(web): PR automation toggles beside roadmap automation + auto marker in PR inbox`.
