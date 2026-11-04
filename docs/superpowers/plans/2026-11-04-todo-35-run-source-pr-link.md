# Run detail source-PR link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run born from a PR action (code review, rebase, address comments, fix CI) shows a link in its run-detail header to ZIBBY's in-app PR detail (`/dashboard/inbox/pull-requests?pr=<url>`).

**Architecture:** The PR-action services already stamp `prReview` / `prRebase` / `prAddressComments` / `prFixCi` (each with `repo`, `number`, `url`) on the scheduled task. The task-run read model (`task-runs.service.ts`) joins them into one new optional read-only field `sourcePr` on `TaskRun`; the web header renders it as a link through the existing `prListHref(url)`.

**Tech Stack:** Zod + ts-rest contracts, NestJS, Next.js/React 19, next-intl, vitest.

**Spec:** `docs/superpowers/specs/todo-35.md`

## Global Constraints

- Contract-first: `libs/contracts` change lands before api/web.
- Link target is in-app (`prListHref` from `apps/web/features/inbox/inbox.ts`), never github.com.
- UI strings in both `apps/web/i18n/messages/cs.json` and `en.json`; no inline `style`, no `any`.
- Keep the web change inside `RunDetailHeader` (item 43 is editing run-detail log ordering in parallel).

## Review Focus

- A task carrying more than one PR stamp (should not happen; pick by fixed precedence review > rebase > address-comments > fix-ci) — pinned in Task 2.
- A run with no owning task / task without PR stamps — `sourcePr` absent, header renders no link — pinned in Tasks 2 and 3.
- A still-queued/held PR task (scheduled row) — must carry `sourcePr` too — pinned in Task 2.
- Compact (sheet) header — link still visible, since it lives on the meta line shown in both modes — pinned in Task 3.
- PR URL with special characters — `prListHref` already URI-encodes; test asserts the encoded href.

---

### Task 1: Contract field `sourcePr`

**Files:**

- Modify: `libs/contracts/src/tasks/task-run.schema.ts` (after `roadmapItemLabel`)
- Test: `libs/contracts/src/tasks/task-run.schema.test.ts`

**Interfaces:**

- Produces: `TaskRunSourcePrSchema = z.object({ kind: z.enum(["review","rebase","address-comments","fix-ci"]), repo: z.string().min(1), number: z.number().int().positive(), url: z.string().min(1) })`, exported type `TaskRunSourcePr`; `TaskRunSchema.sourcePr: TaskRunSourcePrSchema.optional()`.

- [ ] Test `TaskRunSchema — sourcePr`: minimal run parses with `sourcePr` undefined; a run with `{kind:"rebase",repo:"acme/api",number:7,url:"https://github.com/acme/api/pull/7"}` round-trips; `kind:"merge"` fails.
- [ ] Run `pnpm exec vitest run libs/contracts/src/tasks/task-run.schema.test.ts` → FAIL, implement, → PASS. Commit.

### Task 2: API enrichment

**Files:**

- Modify: `apps/api/src/tasks/task-runs.service.ts` (`enrichRunWithTask`, `scheduledTaskToView`)
- Test: `apps/api/src/tasks/task-runs.service.test.ts` (new `describe("source PR enrichment")` next to the roadmap back-ref block)

**Interfaces:**

- Consumes: `TaskRunSourcePr` (Task 1).
- Produces: module-private `sourcePrOf(task: ScheduledTask): TaskRunSourcePr | undefined` — first present of `prReview`→`review`, `prRebase`→`rebase`, `prAddressComments`→`address-comments`, `prFixCi`→`fix-ci`, copying `repo`/`number`/`url`.

- [ ] Tests: dispatched task with `prRebase` → run `sourcePr` equals `{kind:"rebase",repo,number,url}`; task without stamps → undefined; queued task with `prReview` → scheduled row carries `sourcePr.kind === "review"`; task with both `prReview` and `prFixCi` → `kind === "review"`.
- [ ] FAIL → implement → PASS (`pnpm exec vitest run apps/api/src/tasks/task-runs.service.test.ts`). Commit.

### Task 3: Header link

**Files:**

- Modify: `apps/web/features/runs/components/RunDetailHeader.tsx`, `apps/web/i18n/messages/{cs,en}.json` (`runs.detail.sourcePr`)
- Test: `apps/web/features/runs/components/RunDetailHeader.test.tsx`

**Interfaces:**

- Consumes: `run.sourcePr` (Task 1), `prListHref` from `../../inbox` (or `../../inbox/inbox`).
- Produces: `RunDetailHeaderTestId.SourcePrLink = "run-detail-source-pr-link"`.

- [ ] Tests: with `sourcePr` set, `SourcePrLink` shows `acme/api#7`, has accessible name from `runs.detail.sourcePr`, and click → `push("/dashboard/inbox/pull-requests?pr=https%3A%2F%2Fgithub.com%2Facme%2Fapi%2Fpull%2F7")`; also rendered when `compact`; absent without `sourcePr`.
- [ ] Implement: on the meta line after the project link, `<Sep />` + `Pressable` (same pattern as `ProjectLink`) with `aria-label={t("detail.sourcePr", {ref})}` and label `` `${repo}#${number} →` `` in `type="code"`. i18n: en `"Source PR {ref}"`, cs `"Zdrojový PR {ref}"`.
- [ ] FAIL → implement → PASS (`pnpm exec vitest run <test> --project web-components`). Commit.
