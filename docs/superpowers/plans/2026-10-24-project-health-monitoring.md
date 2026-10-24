# Project Health Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each project can name a health URL. ZIBBY GETs it periodically and keeps an up/down status file. Down shows up in the header bell and on the project page, with an operator-clicked **Analyzovat** button that creates an investigation task.

**Architecture:**

- Contracts: an optional `ProjectSchema.healthCheck`, plus a new `projectHealth` resource with three routes (list / analyze / check).
- API: a new `apps/api/src/project-health/` module (store, `checkUrl`, a `ProjectHealthWatcherService` on `TickingWatcherBase`, a controller). It records `project-health-down` / `project-health-recovered` activity on transitions only.
- Web: a `features/project-health` query and mutations, a `ProjectHealthPanel` on project detail, health fields in `ProjectBasicsPanel`, down rows in `NotificationBell`, and `runEvents` invalidation.

**Tech Stack:** Zod 4, ts-rest, NestJS, Next.js 15 / React 19, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-11.md` is the binding source. Exact copy, field names and limits are there.

## Global Constraints

- pnpm only. No `any`, no `forwardRef`, no inline `style` on DOM in `apps/web`. Every visible string goes through next-intl in cs and en, with the spec's exact copy.
- **No autonomous task dispatch on down.** A task is created only by `POST …/analyze`, which is an operator click.
- Health URLs are `http:`/`https:` only. The response body is never read or stored. `error` is at most 500 chars.
- `.zibby/data/` is operator data. Never edit `_projects.json` or any data file. Tests use temp dirs (`PROJECT_HEALTH_DIR` / the existing e2e isolation barrier).
- Validate per file (prettier, eslint) and run only the related tests. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - If the self-knowledge pre-commit gate blocks, run `pnpm self-knowledge:generate`, stage `.zibby/data/vault/knowledge/self-knowledge.md` and retry.
  - If docs-sync names a doc, update it.
  - Never use `--no-verify`.

## Review Focus

- A server that stays down does not re-record activity every tick. Only transitions record. Task 1 test.
- A changed URL resets the status, so the new URL's first result is evaluated fresh. Task 1 test.
- A health check removed or a project deleted removes the status file, so no ghost bell row remains. Task 1 test.
- A slow or hanging endpoint resolves as down via the timeout and never blocks the tick for other projects. Task 1 test (fake fetch that never resolves + fake timers, or a short timeout).
- Analyze on an `up` project returns 409. Analyze creates exactly one task per click with the project id. Task 1 test.

---

### Task 1: Contracts + API

**Files:**

- Modify `libs/contracts/src/projects/project.schema.ts`:
  - add `ProjectHealthCheckSchema` and `healthCheck` on `ProjectSchema`;
  - re-widen `UpdateProjectSchema` with `healthCheck: ….optional().nullable()`.
  - Make the storage layer honour `null` = clear, the same way it does for `teamId`/`companyId`. Check `ProjectsStorageService`.
- Create `libs/contracts/src/project-health/{project-health.schema.ts, project-health.contract.ts, project-health.contract.test.ts, index.ts}`. Wire it into `libs/contracts/src/index.ts` and `app.contract.ts`, following `pins`/`quick-actions`.
- Modify the activity enum (`libs/contracts/src/activity/activity.schema.ts`) and `ACTIVITY_GROUP_OF` (`activity-view.schema.ts`, group `integrations`). Also update any other exhaustive `Record<ActivityKind, …>` that `tsc` finds, in api or web.
- Modify `libs/contracts/src/system/system.schema.ts`: add `projectHealthTickMs`, plus the `WatcherId` member `"project-health"`. Update `apps/api/src/system/system-config.fixture.ts` (`projectHealthTickMs: 0`). Update any settings watcher rows that enumerate `WatcherId`; `tsc` will tell you.
- Create `apps/api/src/project-health/`:
  - `project-health.store.ts` (+ test);
  - `check-url.ts` (+ test);
  - `project-health-watcher.service.ts` (+ test);
  - `project-health.controller.ts`;
  - `project-health.module.ts`, registered in `app.module.ts`;
  - `apps/api/test/project-health.e2e.test.ts`, following `pins.e2e`.
- Create `docs/api/project-health.md`. Add the watcher and knob to the doc that lists system-config knobs or watchers (grep `monitorTickMs` in `docs/`).

**Interfaces (produced, relied on by Tasks 2–3):**

- `ProjectHealthCheck = { url: string; intervalSec: number }`, `ProjectHealthStatus` (fields per spec), `projectHealthContract` with `listProjectHealth`, `analyzeProjectHealth`, `checkProjectHealth`.
- `checkUrl(url: string, fetchImpl: typeof fetch, timeoutMs?: number): Promise<{ ok: boolean; httpStatus?: number; latencyMs: number; error?: string }>`.
- `ProjectHealthWatcherService.tick(now?: Date): Promise<void>` (public, unguarded, like the other watchers), `checkNow(projectId): Promise<ProjectHealthStatus>`, `analyze(projectId): Promise<{ taskId: string }>`. Errors: `ProjectHealthNotFoundError` → 404, `ProjectHealthConflictError` → 409.

- [ ] **Step 1: Failing tests.**
  - contract test: url scheme refine (`ftp:`/`javascript:` rejected), interval bounds 30/3600, default 300; the update accepts `null`.
  - `check-url.test.ts`:
    - 200 → ok with httpStatus;
    - 503 → `!ok`, `error "HTTP 503"`;
    - fetch rejects → `!ok`, error message;
    - timeout → `!ok`, `error "timeout after <n> ms"`.
  - watcher test, with a fake projects source, fake fetch, temp store and activity spy:
    - first check up → status written, no activity;
    - first check down → `project-health-down` recorded once;
    - still down next due tick → no new activity, `sinceAt` unchanged, `checkedAt` advanced;
    - down→up → `project-health-recovered`, `analysisTaskId` cleared;
    - a project not yet due (interval not elapsed) is not fetched;
    - url changed → treated as a first check;
    - health check removed → status file deleted;
    - one project's fetch throwing synchronously does not stop another project's check;
    - `analyze` on down → `createTask` called once with `projectId` and text containing the url and the spec instruction, returns `{ taskId }`, stores `analysisTaskId`;
    - `analyze` on up → `ProjectHealthConflictError`;
    - `analyze` on unknown → `ProjectHealthNotFoundError`.
  - e2e: GET list empty → 200 []; analyze unknown → 404; check on a project without a healthCheck → 404. Follow how other e2e tests seed projects.
- [ ] **Step 2:** Run the related vitest files → FAIL.
- [ ] **Step 3:** Implement.
  - The watcher reads projects via the projects storage service. Read `ResolvedProjectService` only if that is what other watchers use for names.
  - Mirror `MonitorWatcherService` for arming, `onModuleInit`/`onModuleDestroy`, `systemConfig.onChange` re-arm and watcher health registration.
- [ ] **Step 4:** Tests PASS. `pnpm exec tsc -p apps/api/tsconfig.json --noEmit` and `pnpm exec tsc -p apps/web/tsconfig.json --noEmit` are clean (the exhaustive records).
- [ ] **Step 5: Commit** `feat(api): project health monitoring — periodic health checks, transitions as activity, operator-triggered analyze`.

### Task 2: Web — data hooks, project page panel, edit fields, live refresh

**Files:**

- Create `apps/web/features/project-health/queries/{useProjectHealthQuery.ts,index.ts}`. It exports `getProjectHealthQueryKey()`, uses `select: selectApiResponseBody` and `refetchInterval: 60_000`.
- Create `apps/web/features/project-health/mutations/{useAnalyzeProjectHealthMutation.ts,useCheckProjectHealthMutation.ts,index.ts}`. Both invalidate the health key (`onSettled`).
- Modify `apps/web/features/runs/runEvents.tsx`: invalidate `getProjectHealthQueryKey()` on the two activity kinds, plus its test.
- Create `apps/web/features/projects/components/ProjectHealthPanel.tsx` (+ test). Render it on the project detail screen next to the CI/PR panels; find where `ProjectCiStatusChip`/`ProjectPullRequestsPanel` are composed.
  - `export enum ProjectHealthPanelTestId { Root = "project-health-panel", State = "project-health-state", Check = "project-health-check", Analyze = "project-health-analyze", AnalysisLink = "project-health-analysis-link", Empty = "project-health-empty" }`.
- Modify `ProjectBasicsPanel.tsx` (+ test): add a Health URL field and an interval field. Empty URL on save means `healthCheck: null` when one existed, and omitted otherwise. Use the form's existing pattern for optional fields.
- i18n cs/en: namespace `projects.health` (panel and fields).

- [ ] **Step 1: Failing tests:**
  - panel: empty-state copy when no `healthCheck`;
  - up shows the "V pořádku" state and no Analyze button;
  - down shows the error and the Analyze button → mutate `{ params: { projectId }, body: {} }`; its onSuccess `{ status: 200, body: { taskId: "t1" } }` shows `AnalysisLink`;
  - Analyze is disabled while pending;
  - Check calls the check mutation;
  - basics: entering a URL plus interval saves `healthCheck: { url, intervalSec }`; clearing an existing one saves `healthCheck: null`;
  - runEvents: the activity kind `project-health-down` invalidates the health key.
- [ ] **Step 2:** FAIL → implement → PASS. Run the `features/projects`, `features/project-health` and `features/runs` tests. `tsc` on `apps/web` is clean.
- [ ] **Step 3: Commit** `feat(web): project Monitoring panel — health state, check now, Analyze`.

### Task 3: Web — down projects in the notification bell

**Files:**

- Modify `apps/web/features/notifications/components/NotificationBell.tsx` (+ test) and the i18n `notifications` namespace.
- New testids on `NotificationBellTestId`: `HealthItem = "notification-bell-health-item"`, `HealthAnalyze = "notification-bell-health-analyze"`.
- Project names come from the existing projects list query, falling back to the id.

- [ ] **Step 1: Failing tests:**
  - 1 down project + 2 failed runs → the trigger shows 3 and is danger intent;
  - the health row links to `/projects/<id>` and reads "… — nedostupné od …" (cs);
  - its Analyze calls the analyze mutation with that project id;
  - up projects are not listed;
  - with 0 runs and 0 down projects the trigger is ghost with no count;
  - the health rows have no mark-read control.
- [ ] **Step 2:** FAIL → implement → PASS. Run the `features/notifications` tests. `tsc` on `apps/web` is clean.
- [ ] **Step 3: Commit** `feat(web): bell lists down projects with Analyze`.
