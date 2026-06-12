Phase 6 — Accountability: activity log and the butler's briefing

▎ First implementation step: save this plan verbatim as docs/plans/phase-6.md
▎ and commit it ("phase 6 plan"), matching the phase-1/2/3/4/5 workflow.

Context

ROADMAP.md Phase 6 (lines 345–382): "what's happening / what happened" answered
from the record, and the default report is a briefing, not a firehose (Law 5).
Three sub-items: 6.1 activity log on disk (append-only
data/activity/<date>.jsonl + real ActivityFeed), 6.2 briefing generator
(GET /api/briefing + scheduled morning automation + vault persistence), 6.3
notification discipline (three notification kinds, in-app badge over the
existing SSE channel). Exit criterion: after a seeded "overnight" scenario,
/overview shows the North Star's example briefing shape, every line traceable
to a file.

Dependencies are satisfied: Phases 1–5 are implemented (phase-5.md verification
marked complete 2026-06-12). The channel sections of the briefing have real
data to draw from (channel items, kind-"channel" approvals); parked runs,
approvals, task outcomes and the vault write API all exist. Phase 6 adds **no
new actuation** — it is a read/record layer over machinery that already acts.

Verified ground truth that shapes the design:

- **Trace correlation is in place and free to use.** `TraceContextService`
  (shared/logging/trace-context.service.ts) wraps one AsyncLocalStorage of
  `TraceStore { traceId, runId? }` (:15–18); `run(store, fn)` (:32),
  `snapshot()` → `Partial<TraceStore>` (:37), `getTraceId()`/`getRunId()`
  (:41/:45). HTTP requests get a traceId from the trace middleware
  (trace.middleware.ts — `x-trace-id` honored or randomUUID, echoed back);
  background work re-enters scopes: task tick (task-scheduler.service.ts:153),
  agent onIntent re-establishes `{ traceId, runId }`
  (agent-runner.service.ts:269), channel watcher tick
  (channel-watcher.service.ts:89), automations tick
  (scheduler.service.ts:62). `LoggingModule` is `@Global()`
  (logging.module.ts:21) — LoggerService + TraceContextService inject anywhere
  without imports. A new ActivityLogService reads `trace.snapshot()` and every
  entry is correlated for free. (Memory: project_api_observability.)
- **Every activity emission point already exists as a code seam:**
  task created/dispatched/outcome — task-scheduler.service.ts `createTask`
  (:113), `dispatch` (:183), outcome write-back ("task outcome written" log,
  :241); approvals — approvals.service.ts `requestApproval` (:57), `approve`
  (:88), `reject` (:100), shared `decide` (:125); gate decisions — the single
  choke point `GateEvaluatorService.evaluate(rules, action)`
  (gate-evaluator.service.ts:82, first-match-wins, already logs the decision);
  channel actions — channel-triage-flow.service.ts `handle` (:78),
  `dispatchTier1` (:98), `handleTier2` (:130), `parkForApproval` (tier 3),
  resume/cancel for kind "channel"; run transitions — both runners expose
  `onRunStatus(listener)` (agent-runner.service.ts:396,
  pipeline-runner.service.ts:870) and `RunRecorderService` already proves the
  subscribe-from-above pattern (run-recorder.service.ts:52–58: onModuleInit
  subscribes, TERMINAL sets filter, bootstrap sweep for missed ones).
- **Parked runs are queryable.** PipelineRun `status: "done" | "parked" |
  "failed" | "running"` with `parkedReason: "approval" | "retries"` +
  `parked: { phaseId, attempts, failureFile, note? }`
  (pipeline-run.schema.ts:24/:47/:51); the runner sets parked at
  pipeline-runner.service.ts:536/:683; `list()` keeps parked runs visible past
  the 30-min cutoff (:349 — `finished = status !== "running" && status !==
  "parked"`), `listAll()` is full history. Pending approvals:
  `GET /api/approvals?status=pending` (approvals.controller.ts:33,
  approvals.service.ts:79).
- **Automations can host the morning briefing — but targets are closed.**
  `TargetSchema` is a discriminated union of `pipeline | agent` only
  (automation.schema.ts:15–18); `SchedulerService.tick(now)` is wall-minute
  idempotent and directly drivable by tests (scheduler.service.ts:52–69,
  automations.e2e pattern), `dispatch()` is the switch a new target type
  extends (:86–99). Cron is 5-field, evaluated in Europe/Prague (:5).
- **Vault write API (Phase 4) is ready for briefing persistence.**
  `appendDaily(text)` → `daily/<YYYY-MM-DD>.md`, `- HH:MM text` lines
  (vault.service.ts:154); `createNote({ tier, id, title?, body, frontmatter? })`
  (:187, DuplicateNoteError on collision — ids unique across the whole vault),
  `updateNote` (:202 area, body replaced only when provided, tier/id
  immutable), `updateIndex(mocId, target, label?)` idempotently ensures a
  `- [[target]]` line and auto-creates a missing MOC in knowledge/ (:236–239).
  `MemoryTierSchema = z.enum(["memory", "daily", "knowledge"])`
  (memory.schema.ts:4). RunRecorder's marker-first claim (:82) is the
  at-most-once pattern to copy for "don't double-record".
- **SSE is additive and the web tolerates unknown scopes.**
  events.controller.ts merges `fromRunStatus("agent-runs" | "pipeline-runs")`,
  the `"channel-items"` scope from `ChannelEventsService` (a plain RxJS
  Subject — channel-events.service.ts:19–28 is the 20-line pattern to copy)
  and `heartbeats()` (:28–49). The web `RunEventsProvider`
  (apps/web/features/runs/runEvents.tsx:47–96) switches on `scope` and
  silently ignores unknown values (proven by the Phase-5 "channel-items"
  merge, comment at events.controller.ts:39); it is invalidation-only — no
  toast/badge exists anywhere yet.
- **The "demo ActivityFeed" is real code, never mounted.**
  features/overview/components/ActivityFeed/ActivityFeed.tsx renders
  `ActivityEvent { id, t, icon: "run"|"wait"|"ok"|"edit", text, sub }`
  (apps/web/domain.ts:36–44) via Stack/Icon/Typography/Divider, `limit = 5`;
  only its own test imports it — /overview's Screen.tsx renders
  `SummaryWidget` + a starter panel and nothing else. SummaryWidget
  (features/overview/SummaryWidget.tsx:94–119) hardcodes "00" for running
  agents and approvals. The RightRail
  (components/layout/RightRail/RightRail.tsx) already shows approvals queue +
  ParkedRunsPanel + RunningAgentsPanel — the briefing card complements, not
  duplicates, it.
- **Badge plumbing exists in the DS.** Sidebar renders `ListItemBadge` for
  `NavItem.badge?: number` (components/layout/Sidebar/Sidebar.tsx:36; DS
  List.tsx:55–70, `ListTestId.Badge = "list-item-badge"`). DS has Alert
  (severity info/ok/warn/error, AlertTestId), Tag/Chip/StatusDot/Stat/Panel —
  no Toast and no Timeline; ActivityFeed stays an app-level composite
  (InboxPanel precedent, which has its own testid enum —
  features/integrations/components/InboxPanel.tsx:15–18).
- **JSONL is new ground.** No .jsonl exists in the repo. File helpers:
  `writeFileAtomic` (file-utils.ts:38–47), `collisionResistantId(prefix)`
  (:67–71), `dataDir(...)` (ZIBBY_DATA_DIR-overridable); the vault already
  uses plain `fs.appendFile` for daily notes (vault.service.ts:160) — append
  with O_APPEND is the right tool for a log, atomic-rename is not.
- **Contract/module recipe** (unchanged house pattern): Zod schema + c.router
  contract + contract test in libs/contracts/src/<resource>/, registered in
  app.contract.ts (currently 20 resource keys, :32–53) + index.ts; NestJS
  module with `<RESOURCE>_DIR` DI token factory (`env ?? dataDir("x")`),
  controller via `@TsRestHandler` + `makeErrorMapper`. Reusable schemas:
  `TaskOutcomeSchema { status: "done"|"error", summary, finishedAt }`
  (task.schema.ts:125), `RunStatusSchema` (common.schema.ts:19–26),
  `ApprovalSchema` (approval.schema.ts:23–38), `ChannelItemSchema`
  (channel.schema.ts:50–72).
- **e2e conventions:** per-suite mkdtemp dirs exported as `<RESOURCE>_DIR` (or
  one `ZIBBY_DATA_DIR` root — channels.e2e.test.ts:45–57), every tick knob
  ("AUTOMATION_TICK_MS", "TASK_TICK_MS", "CHANNEL_TICK_MS") set to "0" and the
  service's `tick(now)` driven directly via `app.get(...)`,
  CLAUDE_BIN=fake-claude.mjs. **Not every suite sets ZIBBY_DATA_DIR** —
  automations.e2e sets only specific *_DIR envs, so a new always-on activity
  writer would leak files into the repo's real data/ from those suites (see
  watch-outs). .gitignore data section: root .gitignore:9–21 (data-test/,
  data/**/runs, approvals, tasks, vault/daily, credentials, channels +
  whitelist for agents/automations/skills).
- i18n: catalogs apps/web/i18n/messages/{cs,en}.json; overview.* keys exist
  ("activity": "Recent activity" / "Nedávná aktivita", "noActivity" already
  present — the demo's keys are reusable). Playwright: e2e/global-setup.ts
  already seeds a gated agent run, a channel fixture that triages to a pending
  approval, and a wiki vault — a briefing has nonzero sections for free.
- Module graph: nothing imports ChannelsModule or RunRecorderModule (they sit
  "above"); ApprovalsModule is a primitive (runners register into it);
  AutomationsModule imports AgentsModule + PipelinesModule. A global
  ActivityLogModule (LoggingModule twin) + an ActivityRecorderModule above the
  runners (RunRecorderModule twin) + a BriefingModule above
  approvals/pipelines/channels/memory creates no cycle; AutomationsModule
  gains one import (BriefingModule) for the new target type — BriefingModule
  must therefore never import AutomationsModule.

Decisions taken (defaults chosen, flag if you disagree)

1. **ActivityEntrySchema (libs/contracts/src/activity/) is closed and flat:**
   `{ id (collisionResistantId("act")), at: datetime, kind: ActivityKind,
   summary: string (one human-readable line, the feed renders it verbatim),
   traceId?: string, runId?: string, refs: ActivityRefsSchema }`.
   `ActivityKindSchema = z.enum(["task-created", "task-dispatched",
   "task-outcome", "run-started", "run-finished", "pipeline-started",
   "pipeline-finished", "pipeline-parked", "approval-requested",
   "approval-approved", "approval-rejected", "gate-decision", "channel-item",
   "channel-triage", "channel-reply", "channel-approval", "channel-ignored",
   "briefing-generated"])`. `ActivityRefsSchema = z.object({ taskId?, runRef?,
   pipelineId?, agentId?, approvalId?, integrationId?, itemId?, action?,
   decision?, status?, noteId? }).strict()` — all optional strings, closed so
   no payload smuggling (Law 4 hygiene applies to the record too). No free
   `meta` bag; if a kind needs a new ref, the schema grows explicitly.
2. **Storage is append-only JSONL, one file per day:**
   data/activity/<YYYY-MM-DD>.jsonl, one `JSON.stringify(entry) + "\n"` per
   `fs.appendFile` call (O_APPEND, single write syscall per entry — the
   vault-daily precedent, NOT writeFileAtomic: read-modify-rename would race
   concurrent emitters and is O(file) per entry). Rotation = the date in the
   filename; nothing rewrites old files, ever. The reader is tolerant
   per-line (`safeJson` + schema.safeParse, skip bad lines, never throw) so a
   torn final line after a crash costs one entry, not the day. Date and `at`
   come from an injectable `now` (the scheduler `tick(now)` precedent) so the
   day-boundary unit test is deterministic. `.gitignore` +=
   `apps/api/data/activity`.
3. **Two modules, mirroring the logging/recorder split.**
   `ActivityLogModule` is `@Global()` (the LoggingModule twin): provides
   `ACTIVITY_DIR` token (env ?? dataDir("activity")), `ActivityLogService`
   (`record(input)` — stamps id/at/trace snapshot, appends, emits SSE;
   `list({ date?, kinds?, limit? })` — reads one day file newest-first;
   `readSince(iso)` — for the briefing, reads today + yesterday files and
   filters), and `ActivityEventsService` (Subject, the ChannelEventsService
   twin). Global because emitters span seven modules — import edges would be
   pure noise. `ActivityRecorderModule` (the RunRecorderModule twin, imports
   AgentsModule + PipelinesModule, registered near it in app.module.ts)
   subscribes `onRunStatus` for both runners and records run transitions —
   runner internals stay untouched.
4. **Recorder dedup is in-memory, best-effort.** ActivityRecorderService keeps
   a `Map<runRef, status>` and records only on change ("run-started" on first
   sight of "running", "run-finished" on terminal, "pipeline-parked" on
   parked). No marker files, no bootstrap sweep: the activity log is an
   accountability record, not a transactional store — a restart mid-run at
   worst re-logs one transition (harmless duplicate line, the feed dedups
   nothing). This is deliberately weaker than RunRecorder's claim() because
   the cost of a duplicate is one log line, not a corrupted vault note.
5. **Direct emission points (one `activity.record()` call each, summary
   strings operator-readable, refs filled from scope):**
   - task-scheduler.service.ts: createTask (:113 — "task-created"; when it
     dispatches immediately also "task-dispatched" with target+runRef),
     scheduled-task tick fire path, outcome write-back (:241 area —
     "task-outcome" with status+summary).
   - approvals.service.ts: requestApproval (:57), decide (:125 — one site
     covers approve+reject; kind from the new status).
   - gate-evaluator.service.ts: evaluate (:82, beside the existing log line) —
     "gate-decision" with refs `{ action: action.action, decision,
     ruleId-as-status }`. One choke point covers agent intents, pipeline
     stages and channel replies; the runId in scope tells them apart.
   - channel-triage-flow.service.ts: handle (:78 — "channel-triage" with the
     verdict tier/category), dispatchTier1 (:98 — "task-dispatched" rides the
     task path already; record "channel-item" → handled linkage via refs),
     handleTier2 send (— "channel-reply"), parkForApproval ("channel-approval"),
     cancel ("channel-ignored"). Item ingestion ("channel-item") is recorded in
     channel-watcher.service.ts where a NEW item persists — NOT on every empty
     poll (noise discipline starts at the source).
   - briefing.service.ts: generate ("briefing-generated" with noteId).
   LoggerService diagnostics stay untouched and parallel (roadmap: "the
   existing LoggerService keeps being diagnostics").
6. **Read contract** (libs/contracts/src/activity/activity.contract.ts):
   `GET /api/activity` query `{ date?: YYYY-MM-DD, kinds?: comma-list,
   limit?: number (default 50, max 500) }` → 200 `ActivityEntry[]`
   newest-first, defaulting to today; 422 on bad date. Read-only — there is
   deliberately no write endpoint (entries are born only inside the API
   process; a client can never forge the record). Register `activity:` in
   app.contract.ts + index.ts + contract test.
7. **SSE gains an `"activity"` scope:** `{ scope: "activity", kind, at }`
   merged in events.controller.ts from ActivityEventsService (EventsModule
   needs no import — the module is global). Web RunEventsProvider adds a case
   invalidating `getActivityQueryKey()` (and `getBriefingQueryKey()` when
   `kind === "briefing-generated"`). Unknown-scope tolerance is already
   proven; still verify before merge (the Phase-5 rule).
8. **Web feed = mount the existing component, swap its data shape.**
   ActivityFeed gets an `ActivityFeedTestId` enum (InboxPanel precedent),
   props move to the contract `ActivityEntry[]` with a pure
   `activityIcon(kind): ActivityIcon` mapper (task*/run-started → "run",
   *-parked/approval-requested/gate-decision-ask → "wait",
   *-finished/approved/reply → "ok", everything else → "edit") and a relative
   time formatter for `at`. Mounted on /overview Screen under SummaryWidget
   via new `features/overview/queries/useActivityQuery.ts`
   (+ getActivityQueryKey export, selectApiResponseBody, no refetchInterval —
   SSE invalidates). `ActivityEvent` in domain.ts: delete if the impl-time
   grep confirms only ActivityFeed+test consume it (expected), else leave and
   mark deprecated. While in SummaryWidget: wire the two hardcoded "00" stats
   (running agents count from useRunsQuery data, pending approvals from
   useApprovalsQuery) — two lines, the queries are already mounted on the
   page, and "always accountable" shouldn't ship over fake zeros.
9. **Briefing is template-first, deterministic, pure-read on GET.**
   `BriefingSchema` (libs/contracts/src/briefing/): `{ generatedAt, since,
   headline: string, nothingNeedsYou: boolean, needsYou:
   BriefingNeedsYouItem[] ({ kind: "approval" | "parked", id, summary, at,
   refs }), didForYou: BriefingDidItem[] ({ kind, summary, at } — from
   activity entries: task-outcome, channel-reply, run-finished,
   approval-approved), watching: BriefingWatchItem[] ({ integrationId,
   newItems: number, lastReceivedAt? }), counts: { runsFinished, runsFailed,
   parked, approvalsPending, channelItemsNew } }`. Assembly
   (BriefingService.assemble(now)): pending approvals (ApprovalsService.list)
   + parked runs (PipelineRunnerService.listAll filtered parked) + channel
   items in state new/triaged (channel item store) + activity entries since
   the cursor (didForYou + counts). Sorting and section membership are pure
   functions — snapshot-testable. "nothing needs you" = empty needsYou; it is
   a valid, first-class output.
10. **One optional claude pass for the butler voice, never blocking:**
    `ClaudeCliBriefer` copies the ClaudeCliRouter/Triager shape exactly — 8 s
    timeout, `--model haiku`, `--output-format json`, **the same
    `process.env.VITEST` guard**, envelope unwrap + fence-tolerant parse,
    output validated against `z.object({ headline: z.string().max(200)
    }).strict()`. Input = the deterministic sections (counts + first lines),
    which are operator-system data, not inbound channel text — but any item
    summaries that originated from channel content are already
    sanitized/capped upstream; the briefer never sees raw item text.
    Fallback (and the test-mode constant): deterministic headline from
    counts ("2 things need you — 1 approval, 1 parked run." / "Nothing needs
    you."). i18n note: headline is generated in the operator's default locale
    (cs) — keep the deterministic fallback translatable via a small key set
    rendered web-side instead of server text? No — the briefing is a vault
    artifact, server-side cs strings are the product (flag if you want en).
11. **GET is pure, POST persists.** `GET /api/briefing` → 200 Briefing
    (assemble(now), zero side effects, the card calls this).
    `POST /api/briefing/generate` → 201 `{ briefing, noteId }`: assemble →
    butler-voice pass → render markdown → vault persist → advance cursor →
    `activity.record("briefing-generated")` → SSE. Vault persistence: note id
    `briefing-<YYYY-MM-DD>`, tier "daily", body = rendered markdown sections,
    frontmatter `{ generatedAt, since }`; second generate the same day =
    `updateNote` (createNote throws DuplicateNoteError → catch and update);
    plus `appendDaily("briefing generated → [[briefing-<date>]]")` so the
    daily note links it (roadmap: "persist each briefing to the vault
    (daily/ link)"). Cursor: data/activity/last-briefing.json
    `{ generatedAt }` (writeFileAtomic; tolerant read → since = start of
    today). The briefing is itself on disk twice: vault note (prose) +
    activity entry (record).
12. **The morning automation is a new target type, not a fake agent run:**
    `TargetSchema` gains `z.object({ type: z.literal("briefing") })`
    (automation.schema.ts:15–18); scheduler `dispatch()` (:86) gains a case
    calling `BriefingService.generate()` and returning the noteId as the run
    ref. A briefing is deterministic assembly, not an autonomous claude run —
    routing it through AgentRunner would burn tokens to produce worse output.
    Ripple (check each at impl): automations web form target picker (+ i18n),
    automation contract test, automations.e2e fixture, any exhaustive
    `switch (target.type)`. Seed data/automations/morning-briefing.json
    (committed — the automations dir is whitelisted in .gitignore):
    `{ id: "morning-briefing", name: "Morning briefing", trigger: { type:
    "cron", expr: "0 7 * * *" }, target: { type: "briefing" }, enabled: true }`.
13. **Notification discipline is a pure client-side filter — exactly three
    kinds** (roadmap: "nothing else"): pending Tier-3 decision (any pending
    approval), newly parked run (parkedReason "retries"), briefing ready.
    NEW features/notifications/notificationRules.ts: pure
    `selectNotifications({ approvals, runs, briefing }) → Notification[]
    ({ kind: "approval" | "parked" | "briefing", id, label, href })` — unit
    test feeds a noisy synthetic state (running runs, handled items, done
    tasks, errors) and asserts only the three kinds emerge. `useNotifications()`
    composes the three existing queries (SSE already invalidates all of them —
    no new transport, the roadmap's "existing SSE events channel"). Surfaces:
    Sidebar `NavItem.badge` (existing ListItemBadge) on the **runs** nav item
    = approvals-pending + parked count (that's where both are resolved;
    AppShell already builds the nav items array), and the briefing card's
    "ready" chip. No toasts (DS has none — and won't grow one this phase), no
    native/push (explicitly later per roadmap).
14. **Web briefing card** = NEW features/overview/components/BriefingCard/
    (HudPanel, title from i18n "overview.briefing", tone "accent" when
    needsYou nonempty): headline line, needsYou list (Tag + summary + link to
    /runs or approval), didForYou collapsed count line, watching line,
    "nothing needs you" empty state (valid output, styled calm not empty-sad),
    and a "generate now" Button firing `useGenerateBriefingMutation`
    (invalidates briefing + activity keys). Mounted on /overview above
    ActivityFeed. useBriefingQuery (+ key export). i18n keys overview.briefing*
    in cs+en.

Implementation order: 6.1 → 6.2 → 6.3. (The briefing reads the activity log;
notifications read the briefing query. Each sub-item lands with its tests, per
the standing rules.)

---

6.1 Activity log on disk

Contracts (NEW libs/contracts/src/activity/activity.schema.ts +
activity.contract.ts + activity.contract.test.ts):

- ActivityKindSchema, ActivityRefsSchema (.strict()), ActivityEntrySchema
  (decision 1), ActivityQuerySchema { date?, kinds?, limit? } (decision 6).
- `GET /api/activity` (200 ActivityEntry[], 422 bad date). Register
  `activity:` in app.contract.ts + index.ts.

API (NEW apps/api/src/activity/):

- activity-log.module.ts (`@Global()`, ACTIVITY_DIR token: env ??
  dataDir("activity")), activity-log.service.ts (record/list/readSince per
  decision 3; record = stamp id (`collisionResistantId("act")`), `at` from
  injected now, `trace.snapshot()` merge, schema-validate (a malformed entry
  is a programmer error — throw in dev, but the appendFile itself is fire-and-
  forget `void`-safe at call sites so accountability never breaks actuation),
  single appendFile, `events.emit`), activity-events.service.ts
  (ChannelEventsService twin), activity.controller.ts (TsRestHandler +
  makeErrorMapper).
- activity-recorder.module.ts + activity-recorder.service.ts (decision 4):
  onModuleInit subscribes both runners' onRunStatus; kind mapping —
  agent "running"→run-started, terminal→run-finished (status in refs);
  pipeline "running"→pipeline-started, "parked"→pipeline-parked,
  done/failed→pipeline-finished. Registered in app.module.ts next to
  RunRecorderModule.
- Emission calls (decision 5) in task-scheduler, approvals.service,
  gate-evaluator, channel-triage-flow, channel-watcher — each a one-liner
  `void this.activity.record({ kind, summary, refs })` beside the existing
  LoggerService line; summaries are the operator-facing sentences (cs? **en
  to match existing log/file conventions; the web feed renders summary
  verbatim** — flag if cs preferred).
- events.controller.ts merges the "activity" scope (decision 7).
- .gitignore += `apps/api/data/activity`.

Web:

- features/overview/queries/useActivityQuery.ts (+ key export);
  RunEventsProvider "activity" case; ActivityFeed re-pointed to ActivityEntry
  + ActivityFeedTestId enum + icon/time mappers (decision 8); mounted in
  overview Screen; SummaryWidget real counts; domain.ts ActivityEvent removal
  (grep first); i18n keys (activity kind labels if any UI needs them — the
  feed itself renders summary verbatim, so likely only "overview.activity"
  heading reuse).

Tests:

- Contract test (kinds enum closed, refs strict, GET shape).
- Unit activity-log.service: append → file contains exactly N valid JSONL
  lines; day rotation (record with injected now at 23:59:59.9 vs 00:00:00.1 →
  two files); tolerant reader (torn last line + garbage line skipped, valid
  lines survive); kinds/limit filters; readSince spans yesterday+today;
  traceId/runId picked from an ALS scope established around record().
- Unit activity-recorder: fake runner emitters → started/finished/parked
  entries, repeat emission of same status → one entry.
- NEW apps/api/test/activity.e2e.test.ts: boot with temp ACTIVITY_DIR; create
  a task (demo runner) → run to terminal → GET /api/activity contains
  task-created, task-dispatched, run-started, run-finished, task-outcome with
  a shared traceId and the run's runId; trigger a gated intent → approve →
  gate-decision + approval-requested + approval-approved entries present.
  Extend channels.e2e: the Phase-5 fixture flow now also asserts
  channel-item/channel-triage/channel-approval entries.
- **Audit every existing e2e suite** for the ACTIVITY_DIR leak (see
  watch-outs): add ACTIVITY_DIR (or ZIBBY_DATA_DIR) to each beforeAll env
  block that lacks a data root override.
- web-components: ActivityFeed renders entries (testid selectors), icon
  mapping, limit; Screen mounts feed with query data (renderWithProviders).

6.2 Briefing generator

Contracts (NEW libs/contracts/src/briefing/briefing.schema.ts +
briefing.contract.ts + test): BriefingSchema + section item schemas
(decision 9), `GET /api/briefing` (200), `POST /api/briefing/generate`
(201 { briefing, noteId }). automation.schema.ts TargetSchema += briefing
variant (decision 12) + contract test update.

API (NEW apps/api/src/briefing/):

- briefing.module.ts (imports ApprovalsModule, PipelinesModule,
  ChannelsModule — check it exports the item store; export it if not —
  MemoryModule; ActivityLog is global). Registered in app.module.ts; then
  AutomationsModule imports BriefingModule for the dispatch case.
- briefing-assembly.ts: pure functions (state in → Briefing out) — section
  selection, sorting, counts, deterministic headline. No Nest, no I/O:
  this is the snapshot-test surface.
- claude-cli-briefer.ts (decision 10 — VITEST guard, strict schema, haiku).
- briefing.service.ts: assemble(now) (gather inputs → assembly fns),
  generate(now) (assemble → briefer → renderBriefingMarkdown → vault
  create-or-update note + appendDaily link + updateIndex? NO index update —
  dailies aren't MOC-linked, the daily link line suffices → cursor write →
  activity record → return). Cursor helpers beside it.
- briefing.controller.ts; scheduler.service.ts dispatch case + seed
  data/automations/morning-briefing.json.

Web:

- features/overview/queries/useBriefingQuery.ts + mutations/
  useGenerateBriefingMutation.ts; BriefingCard (decision 14) mounted on
  overview; RunEventsProvider invalidates briefing key on
  kind=briefing-generated; i18n overview.briefing* (cs+en); automations form
  target picker gains "briefing" option + i18n.

Tests:

- Unit briefing-assembly: fixture state (2 pending approvals incl. kind
  channel, 1 retries-parked run, activity entries with outcomes/replies,
  2 new channel items) → snapshot the deterministic Briefing; empty state →
  nothingNeedsYou true + calm headline; since-filtering honors cursor.
- Unit briefing.service: generate persists note (re-generate same day
  updates, not 409), cursor advances, activity entry written, briefer
  failure/timeout → deterministic headline (VITEST guard makes this the
  default path in tests).
- Unit scheduler: briefing target dispatch case (existing dispatch tests'
  pattern); automation contract test for the new target.
- NEW apps/api/test/briefing.e2e.test.ts: seed approvals + a parked pipeline
  (demo mode, retries exhaust) + fake-channel items → GET /api/briefing
  returns expected sections; POST generate → vault daily note exists with
  link line + briefing note body contains sections; SchedulerService.tick at
  07:00 Prague fires the seeded automation exactly once (wall-minute
  idempotence) and a second tick same minute doesn't.
- web-components: BriefingCard states (needsYou items render with links;
  nothingNeedsYou calm state; generate button fires mutation).
- Playwright: extend an existing spec or NEW e2e/briefing.spec.ts —
  global-setup already produces a pending channel approval, so /overview
  shows the briefing card with a needs-you line + the activity feed nonempty;
  click generate → "briefing ready" state. (Check the pre-existing-failure
  baseline first — memory: project_playwright_e2e_preexisting_failures.)

6.3 Notification discipline

Web only (no new transport — decision 13):

- NEW features/notifications/: notificationRules.ts (pure selector),
  useNotifications.ts (composes useApprovalsQuery + useRunsQuery +
  useBriefingQuery). AppShell: runs NavItem.badge = notification count of
  kinds approval+parked (badge hidden at 0); BriefingCard shows the briefing
  notification state. aria: badge gets accessible label
  ("N items need attention" i18n key).
- Tests: unit notificationRules (noisy synthetic stream in → exactly three
  kinds out, zero state → empty); web-components: Sidebar badge renders
  count and hides at zero (ListTestId.Badge selector), AppShell wiring test
  if the harness allows (else a focused component test around the nav
  builder).

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit
(rtk typecheck lies — memory: project_rtk_typecheck_masking) → pnpm test →
pnpm exec vitest run --project web-components.

Phase exit: pnpm e2e green on a clean tree (worktree baseline BEFORE the
phase; the 2 quarantined pipeline e2e tests + documented Playwright reds stay
quarantined). Then the roadmap's manual proof — the seeded "overnight"
scenario: on a dev boot, drop a fake-channel bug report + let a pipeline park
(retries) + leave an approval pending, run the morning-briefing automation
(trigger endpoint or tick), and /overview shows the North Star briefing shape
— "Two bugs came in overnight…"-style headline, needsYou lines, every line
traceable: feed entry → activity JSONL line → traceId → run dir / approval
file / vault note. `rtk grep` a traceId across data/activity and the run
sidecar to demonstrate "always answerable" end-to-end.

Watch-outs

- **The ACTIVITY_DIR test leak is the phase's footgun.** ActivityLogService is
  global and fires on every dispatch/approval/gate event — every existing e2e
  suite that boots AppModule without ZIBBY_DATA_DIR (automations.e2e sets only
  AGENTS_DIR/AGENT_RUNS_DIR/…) will append into the repo's real
  apps/api/data/activity. It's gitignored so it won't commit, but suites
  polluting each other's "today" file breaks activity e2e assertions run in
  the same vitest process. Sweep every apps/api/test/*.e2e.test.ts beforeAll
  and add ACTIVITY_DIR to the mkdtemp env list (or migrate the suite to
  ZIBBY_DATA_DIR) in the same commit that introduces the service.
- **record() must never break actuation.** Every emission site is on a hot
  path (dispatch, approve, gate evaluate). Call as `void
  this.activity.record(...)` with internal try/catch → LoggerService.warn; an
  unwritable activity dir degrades accountability, never operation. The unit
  test for this: record with an unwritable dir resolves without throwing.
- **appendFile, not writeFileAtomic, and exactly one call per entry.** A
  multi-write append can interleave under concurrency; a read-modify-rename
  log is quadratic and racy. One stringify + one appendFile with the trailing
  newline; the tolerant reader is the other half of the contract.
- **Don't log the firehose.** No entries for: empty channel polls, scheduler
  ticks that fire nothing, SSE heartbeats, every stage log line. The roadmap's
  list (dispatch, gate decision, channel action, tier-2 act-then-report, run
  transitions, briefing) is the whole vocabulary — noise here destroys 6.3's
  meaning ("notify only when genuinely relevant" starts with what's recorded
  as activity… recorded ≠ notified, but a noisy feed still drowns the
  operator).
- **Gate-decision entries inherit run scope from ALS** — evaluate() itself
  doesn't know which runner called it. agent-runner re-enters
  `{ traceId, runId }` before evaluating (verified :269); confirm the
  pipeline-stage intent path and channel evaluateReply also run inside a
  scope carrying the right runId/traceId before relying on snapshot() —
  if channel replies evaluate outside a runId scope that's correct (no run),
  the itemId ref carries the linkage instead.
- **TargetSchema widening ripples** like ApprovalRunKind did in Phase 5: grep
  every `switch` / discriminated-union consumer of Automation target (web
  automations form, scheduler dispatch, e2e fixtures, contract tests) before
  calling 6.2 done. The web form must offer "briefing" with no
  agent/pipeline picker shown.
- **AutomationsModule → BriefingModule is a new edge** — BriefingModule must
  never import AutomationsModule (cycle). If ChannelsModule doesn't export
  its item store, export the store service, don't re-create a reader.
- **Briefer discipline:** the VITEST guard is what keeps tests token-free —
  don't "fix" it. The briefer consumes only assembled section data (already
  sanitized upstream); never hand it raw channel item text — that would be a
  new Law-4 surface. Its output is one strict-schema headline; anything else
  is discarded, not merged.
- **Vault note collision semantics:** createNote throws on duplicate across
  ALL tiers — `briefing-<date>` regenerated the same day must catch
  DuplicateNoteError → updateNote, and the e2e pins it. Don't id-suffix
  (briefing-<date>-2) — one note per day is the contract.
- **Cursor file semantics mirror the channel cursor:** advance last-briefing
  cursor only AFTER the vault note persists, so a crash re-briefs (harmless,
  idempotent note update) rather than losing a window. Tolerant read → since
  = start of today (first boot, deleted file).
- **SSE scope addition:** same Phase-5 rule — confirm RunEventsProvider drops
  unknown scopes (it does — runEvents.tsx switch) BEFORE merging, and the new
  case invalidates only activity/briefing keys; don't piggyback approval
  invalidation (the approval flows already emit their own signals).
- **Sidebar badge = derived, not stored.** No notification persistence, no
  read/unread state this phase — the badge is a pure function of current
  pending/parked/briefing queries. Resist inventing a notifications store;
  "native/push later" is the roadmap's explicit deferral.
- The two quarantined pipeline e2e tests + documented Playwright reds
  (memories: project_api_flaky_pipeline_e2e,
  project_playwright_e2e_preexisting_failures): establish the clean-tree
  baseline via git worktree before the phase, never stash/pop.

Critical files

- NEW libs/contracts/src/activity/* , briefing/* (schemas + contracts +
  tests); automations/automation.schema.ts (TargetSchema); app.contract.ts,
  index.ts
- NEW apps/api/src/activity/* (global log module, events, recorder module,
  controller), apps/api/src/briefing/* (module, assembly, briefer, service,
  controller)
- apps/api/src/tasks/task-scheduler.service.ts,
  approvals/approvals.service.ts, gates/gate-evaluator.service.ts,
  channels/channel-triage-flow.service.ts + channel-watcher.service.ts
  (one-line emissions), automations/scheduler.service.ts (briefing target),
  events/events.controller.ts (activity scope), app.module.ts
- apps/api/data/automations/morning-briefing.json (seed), .gitignore
- apps/web/features/overview/* (ActivityFeed re-point + mount, BriefingCard,
  queries/mutations, SummaryWidget counts), features/notifications/* (NEW),
  features/runs/runEvents.tsx, components/layout/AppShell + Sidebar (badge),
  domain.ts (ActivityEvent removal), i18n/messages/{cs,en}.json
- apps/api/test/{activity,briefing}.e2e.test.ts (NEW) + the ACTIVITY_DIR env
  sweep across existing suites; e2e/briefing.spec.ts (or extended spec)

---

Verification — COMPLETE (2026-06-12)

All three sub-items delivered: 6.1 activity log + real overview feed, 6.2 briefing
generator + morning automation, 6.3 notification discipline.

- `pnpm test` (all projects): 1048 passed; the only reds are the two documented
  pre-existing baselines (pipelines.e2e flaky pair + the task-scheduler matchedTerms
  pair), confirmed identical on a clean tree before the phase.
- `npx tsc -p tsconfig.base.json` / `apps/web/tsconfig.json`: no new errors (the 18
  base errors are the documented pre-existing test-file baseline; web is clean).
- `pnpm lint`: clean (only the pre-existing AgentDetailModal unused-var warning).
- Playwright: `e2e/briefing.spec.ts` stable (2/2). On fresh servers the suite's only
  consistent red is the documented `pipeline-run` baseline; `approval`/`channels`/
  `memory-graph` are cold-start/reused-server timing flakes (pass on fresh boots,
  none touch Phase-6 code paths) — the documented quarantine.
- ACTIVITY_DIR leak closed via a per-file temp dir in apps/api/vitest.setup.ts (no
  suite writes into the repo's real data/activity).
- "Always answerable" proven by activity.e2e: a task's full lifecycle
  (task-created → dispatched → run-started → run-finished → task-outcome) shares the
  originating traceId and the run's runRef; a gated intent records gate-decision +
  approval-requested + approval-approved.

Implementation deltas from the plan worth noting:
- Deterministic headline + activity summaries are English (consistent with the
  existing log/file conventions and the activity record the briefing reads), not cs.
- gate-decision is recorded only when a rule actually FIRED (ruleId present), so a
  no-match default-allow stays silent — the firehose discipline.
- The briefing GET is a live assembly, so the card's query is invalidated on ANY
  activity event (not only briefing-generated) to avoid a stale needsYou.
