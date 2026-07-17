# F6 — Trust From the Record: Herald Reply Ledger + Live Soak + Watcher Health — Implementation Plan

> NS2 phase F6. Planned by Opus against the **projected** F1–F5 end state (per PROGRESS.md all of F1–F5 land before F6). Branch `north-star-2`. Contract-first, tests = DoD, vitest, per-package `tsc -p` (never `rtk pnpm typecheck` — it lies). No `any`, DS + `*TestId` enums, i18n cs+en, briefing edits strictly additive and sequenced after F3b/F4c/F5. Three independently committable subphases: **F6a → F6b → F6c**, one commit each.

---

## Factual corrections (verified in code — read first)

1. **There is NO "edited" reply path today, so the roadmap's three-way `approved-unedited / edited / rejected` outcome is not representable without new surface area.** `approveApproval` takes `EmptyBodySchema` (`approvals.contract.ts:31-38`); `ApprovalsService.approve` (`approvals.service.ts:104-113`) calls `runner.resume(runId)` with no payload; the channel runner's `resume` sends the *exact parked draft* — `sendReply(item, this.draftOf(item.triage))` (`channel-triage-flow.service.ts:400-407`) where the draft was frozen at park time (`:381-383`). **Decision:** F6a records the two outcomes that physically exist — `approved` (parked draft approved unedited → sent) and `rejected` — plus `sent-auto` (a Tier-2 gated auto-send, already-graduated behavior). The enum reserves `edited` (documented, never produced in v1) as a forward-compatible slot; graduation counts only consecutive `approved`. Adding an edit-on-approve endpoint is explicitly **out of F6 scope** (a follow-up). This matches the roadmap's own operative signal: "approved **unedited** N times in a row" (north-star-2.md:134).

2. **The graduation lever is `TriageVerdict.tier`, not the gate — and email cannot be graduated by construction.** Email is `NOTIFY_ONLY_KINDS` (`channel-triage-flow.service.ts:46`) and returns from `handleNotifyOnly` (`:179-181`) *before* any tier/reply branch — it never parks a `channel` reply approval, so its ledger is empty and there is nothing to graduate. Graduation therefore only ever promotes a **Slack/Jira/GitHub** item from Tier-3 (park) to Tier-2 (auto-send). This is structural, not a guard we add — the Never list (email notify-only) is honored automatically. Slack **can** reply (verified: not in `NOTIFY_ONLY_KINDS`; the e2e sends a Slack reply `channels.e2e.test.ts:132-150`). Memory's "email notify-only, Slack differs" is confirmed.

3. **Graduation must not undo the confidence-floor escalation, and it never crosses the gate.** `TriageService.applyConfidenceFloor` (`triage.service.ts:62-73`) *escalates* a low-confidence verdict one tier (T2→T3). If graduation blindly re-promoted every T3→T2 it would silently defeat that safety. **Decision:** promotion fires only when `!forceT3 && verdict.confidence >= TRIAGE_CONFIDENCE_FLOOR` (`triage.service.ts:13`) — i.e. only *confident, naturally-T3* verdicts on a graduated `(integrationId, category)`. And promotion routes through the existing `handleTier2` path, so `evaluateReply` (`channel-triage-flow.service.ts:471-481`) still runs: a hardened `channel-reply`/`send_email` `ask` rule still parks. The gate stays the structural boundary.

4. **The "per-subsystem triage confidence threshold (replacing the global 0.5)" the roadmap assigns to F3 was NOT planned or implemented in F3.** The reviewed F3 plan (`ns2-f3-policy-accountability.md`) covers gate buckets + tier defaults + briefing + filters only; `TRIAGE_CONFIDENCE_FLOOR` remains a global `0.5` constant. F6a's committed scope (ledger + graduation) does **not** require it. **Recommendation:** leave the global floor; treat a per-subsystem/per-Herald threshold as a deferred follow-up (noted in PROGRESS.md), out of F6 scope. Flagged so the orchestrator can rule.

5. **F6c: the roadmap body and the task guidance name different watchers, and neither list matches the code.** ROADMAP-2.md §F6 says "channel watcher, monitor watcher, and **triage router**"; the task guidance says "channel tick, monitor watcher, scheduler, **goal loop**." Verified: the genuine heartbeat watchers are exactly the **five** `TickingWatcherBase` subclasses — `ChannelWatcherService`, `MonitorWatcherService`, `SchedulerService` (automations), `TaskSchedulerService`, `LimitResumeService` (grep `TickingWatcherBase`). The **goal loop** (`GoalRunnerService`, `goal-runner.service.ts:147`) is a per-run outer-loop engine, **not** a `TickingWatcherBase` heartbeat — it has no last-tick surface and must not be probed as a watcher. The **triage router** is invoked synchronously inside a channel tick; its "fallback-mode flag" is the `degraded` boolean already produced by `TriageService.triageDetailed` (`triage.service.ts:46-59`) — surfaced as a *detail* on the channel watcher, not a separate watcher. **Decision:** F6c probes the five real `TickingWatcherBase` watchers.

6. **Only `SchedulerService` tracks a last-tick timestamp today; the other four watchers expose none.** `SchedulerService.health()` returns `{running, tickMs, lastTickAt}` (`scheduler.service.ts:89-91`) but sets `lastTickAt` inside its own public `tick()` (`:95`). `MonitorWatcherService`/`ChannelWatcherService`/etc. have no `health()` and no last-tick field. `SubsystemHealthService` injects only the scheduler (`subsystem-health.service.ts:16-19,52-68`). **Decision:** F6c hoists last-tick tracking into `TickingWatcherBase.guardedTick` (the single timer-driven path, `ticking-watcher-base.ts:79-92`) so all five get it uniformly for free, and surfaces them through a small `WatcherHealthRegistry` (mirrors the `ResumableRunner` self-registration pattern, `approvals.service.ts:55-58`) rather than making `HealthModule` import five feature modules.

7. **F6b: the task narrows the roadmap's *live-credentialed* soak to a *fake-channel* scripted soak.** ROADMAP-2.md §F6 describes a "credentialed live test lane (real sandbox Slack … dedicated Gmail …)." The task's F6b scope is "the autonomous loop against **fake** channels with scripted scenarios." These are different lanes. **Decision:** F6b implements the **fake-channel** opt-in soak (deterministic, no network, builds directly on `CHANNEL_FAKE_DIR` + `channels.e2e.test.ts`); the live-credentialed lane stays a documented follow-up. This is CI-safe-when-off and is the tractable, verifiable half.

---

## Shared conventions (all subphases)

- **Contract-first:** every persisted/wire shape lands in `libs/contracts` and `pnpm --filter @zibby/contracts exec tsc -p tsconfig.json` passes before any `apps/api` consumer.
- **No `any`.** Durable JSON stores parse with Zod `safeParse` + `safeJson` exactly like `ChannelItemStore.readFile` (`channel-item.store.ts:149-154`); fail-open to empty on corrupt/missing.
- **Fail-open everywhere.** A ledger/graduation/health read failure logs `warn` and degrades to a safe default (empty ledger, no graduation, watcher `ok`) — never throws out of a tick or a health probe. Mirrors `subsystem-health.service.ts`'s "a probe can only resolve, never throw."
- **Autonomy contract preserved.** Graduation never crosses the Never list (email stays notify-only by construction, correction #2), never weakens the gate (correction #3); the graduation decision is itself Tier-3 (a parked approval). `pr.merge` untouched.
- **Data dirs:** env-overridable, `?? dataDir(...)` — mirror `resolveChannelsDir` (`channels.module.ts:23-25`) and `CHANNELS_DIR` (`channel-item.store.ts:14`).
- **testid enums + i18n cs+en** for any web addition; per-package `tsc -p` (contracts → api → web) at each checkpoint.
- **Validation policy:** incremental (prettier/eslint/scoped vitest per touched file); repo-wide suites only at each subphase checkpoint (ignore the 2 known `pipelines.e2e` fails).
- **Briefing coordination (BINDING, inherits F5 addendum ruling #4):** F3b/F4c/F5/F6c all add optional fields to `BriefingSchema`/`assembleBriefing`. F6c rebases its additive edit onto the file **as it then exists** after F5. Never fold F6c's `staleWatchers` into F3b's `subsystems` lines.
- Commit messages end with the standard `Co-Authored-By` + `Claude-Session` footers.

---

# F6a — Herald reply ledger + evidence-based graduation

**Goal:** every outbound reply *proposal* (Tier-2 auto-send or Tier-3 parked draft) is recorded in a durable, auditable ledger with `(integrationId, kind, projectId?, category, confidence, tier, outcome)`. When a `(integrationId, category)` accumulates **N consecutive `approved`** proposals (threshold env-configurable), Herald parks a **Tier-3 `herald-graduation` approval**; on operator approval that pair graduates to Tier-2 auto-send. Any `rejected` proposal resets the streak (downgrade path). All data, fail-open, owner: `herald`.

### Verified current state (file:line)
- Reply flow + tier branch: `channel-triage-flow.service.ts:126-219` (`handle`), park `:365-395`, resume `:400-407`, cancel `:410-423`, auto-send `sendReply :442-461`, `handleTier2 :341-361`, `evaluateReply :471-481`, notify-only guard `:179-181`, `NOTIFY_ONLY_KINDS :46`, `readOnly` guard `:192-206`, `forceT3 :296-303`.
- Approvals seam: `requestApproval` `approvals.service.ts:61-91`; `approve/reject` `:104-125`; `register` `:55-58`; `RequestApprovalInput` `:22-30`. Kind enum `approval.schema.ts:11-45`.
- Triage: `TriageVerdictSchema` (category/confidence/tier) `channel.schema.ts:15-34`; confidence floor `triage.service.ts:13,62-73`; `degraded` `triage.service.ts:46-59`.
- ChannelItem: `channel.schema.ts:57-87` (`reply`, `approvalId`, `triage`, `projectId`).
- Activity: `ActivityKindSchema` `activity.schema.ts:11-82` (`channel-reply/-approval/-ignored`); `ActivityRefsSchema` `.strict()` `:91-124` (already has `itemId, integrationId, approvalId, status, decision`; **category already rides `refs.status`** per `channel-triage-flow.service.ts:169`).
- Module (leaf, nothing imports it — safe to grow): `channels.module.ts:36-62`.
- Store precedent: `ChannelItemStore` `channel-item.store.ts` (two-level file store, `safeJson` + Zod parse, atomic write). Subsystem id `herald` exists `subsystem.schema.ts:16`.

### Contract additions (exact Zod)

**1. `libs/contracts/src/channels/channel.schema.ts`** — extract the category enum (small additive refactor so the ledger cannot drift from triage), then reuse it in `TriageVerdictSchema`:
```ts
/** The triage categories — shared by TriageVerdict and the Herald reply ledger. */
export const TriageCategorySchema = z.enum(["bug", "question", "request", "other"]);
export type TriageCategory = z.infer<typeof TriageCategorySchema>;
```
Replace the inline `category: z.enum([...])` at `:19` with `category: TriageCategorySchema` (identical set — no behavior change; existing tests unaffected).

**2. New file `libs/contracts/src/herald/reply-ledger.schema.ts`** (persisted → contracts, but internal, no HTTP endpoint in v1):
```ts
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { IntegrationIdSchema, IntegrationKindSchema } from "../integrations/integration.schema";
import { TriageCategorySchema } from "../channels/channel.schema";

/**
 * Outcome of one drafted reply. `sent-auto` = a Tier-2 gated auto-send (already-
 * graduated / mandate-on path). `approved` = a Tier-3 parked draft the operator
 * approved UNEDITED and it was sent. `rejected` = parked draft rejected (resets the
 * graduation streak). `pending` = parked, awaiting the operator. `edited` is RESERVED
 * (no edit-on-approve path exists in v1 — never produced; forward-compat only).
 */
export const ReplyLedgerOutcomeSchema = z.enum([
  "pending",
  "sent-auto",
  "approved",
  "rejected",
  "edited",
]);
export type ReplyLedgerOutcome = z.infer<typeof ReplyLedgerOutcomeSchema>;

/** One drafted reply recorded for the record — draft → operator decision. */
export const ReplyLedgerEntrySchema = z.object({
  id: z.string().min(1),
  integrationId: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  projectId: z.string().optional(),
  itemId: z.string().min(1),
  approvalId: z.string().optional(),
  category: TriageCategorySchema,
  confidence: z.number().min(0).max(1),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  outcome: ReplyLedgerOutcomeSchema,
  proposedAt: IsoDateTimeSchema,
  decidedAt: IsoDateTimeSchema.optional(),
});
export type ReplyLedgerEntry = z.infer<typeof ReplyLedgerEntrySchema>;

/** A graduated (channel, category) pair — Tier-3 → Tier-2 auto-send, evidence-backed. */
export const HeraldGraduationSchema = z.object({
  integrationId: IntegrationIdSchema,
  kind: IntegrationKindSchema,
  category: TriageCategorySchema,
  projectId: z.string().optional(),
  evidenceCount: z.number().int().positive(),
  approvalId: z.string().min(1),
  graduatedAt: IsoDateTimeSchema,
});
export type HeraldGraduation = z.infer<typeof HeraldGraduationSchema>;
```
Export both from a new `libs/contracts/src/herald/index.ts` and the root barrel `libs/contracts/src/index.ts`.

**3. `libs/contracts/src/approvals/approval.schema.ts`** — add to `ApprovalRunKindSchema` (`:44`, after `agent-proposal`):
```ts
  // NS2 F6a — Herald's evidence-based autonomy graduation: a (channel, category)
  // that accumulated N consecutive operator-approved (unedited) replies is proposed
  // for Tier-2 auto-send. The runId is `<integrationId>/<category>`; approving writes
  // the graduation (future replies of that category on that channel auto-send through
  // the same gate), rejecting leaves the channel at Tier-3. The graduation decision
  // is itself Tier-3 — autonomy widens only on an operator's explicit sign-off.
  "herald-graduation",
```

### Change list (ordered)

1. **Contracts (1–3).** Build contracts. Update the approval-kind enumeration test if one asserts the exact kind set (grep `"agent-proposal"` in `libs/contracts/src/approvals/*.test.ts`; add `"herald-graduation"`).
2. **`apps/api/src/herald/reply-ledger.store.ts`** (new). Durable append store modeled on `ChannelItemStore`. Dir `HERALD_LEDGER_DIR = process.env.HERALD_LEDGER_DIR ?? dataDir("herald/ledger")`; one file per entry `<id>.json`, atomic write, tolerant Zod read. Methods:
   - `record(entry: ReplyLedgerEntry): Promise<ReplyLedgerEntry>` (write).
   - `patchOutcome(id, outcome, decidedAt): Promise<void>` (read-modify-write; missing → warn no-op).
   - `list(filter?: { integrationId?; category? }): Promise<ReplyLedgerEntry[]>` sorted by `proposedAt`.
   - `consecutiveApproved(integrationId, category): Promise<number>` — walk the `(integrationId, category)` entries newest-first over **decided** outcomes only (skip `pending`/`sent-auto`), counting leading `approved` until the first non-`approved`. This is the streak; a `rejected` at the head returns 0 (downgrade).
3. **`apps/api/src/herald/herald-graduation.store.ts`** (new). Single-file JSON list `HERALD_GRADUATION_FILE = process.env... ?? dataDir("herald/graduations.json")`. Methods `list()`, `isGraduated(integrationId, category): Promise<boolean>`, `add(g: HeraldGraduation)`, `remove(integrationId, category)` (downgrade/admin). Fail-open empty.
4. **`apps/api/src/herald/herald.service.ts`** (new). The ledger/graduation brain + the `herald-graduation` `ResumableRunner`. Inject `ReplyLedgerStore`, `HeraldGraduationStore`, `ApprovalsService`, `ActivityLogService`, `LoggerService`. `HERALD_GRADUATION_THRESHOLD = intEnv("HERALD_GRADUATION_THRESHOLD", 10)` (module constant; tests override via env — the `intEnv` helper from `channel-watcher.service.ts:211-214`). `onModuleInit`: `approvals.register("herald-graduation", this)`.
   - `recordProposal(input): Promise<string>` — writes a ledger entry (returns id). Called by the triage flow at auto-send and at park.
   - `recordDecision(itemId, integrationId, category, outcome): Promise<void>` — patches the matching pending entry's outcome; on `approved`, calls `maybeProposeGraduation(integrationId, kind, category, projectId)`.
   - `maybeProposeGraduation(...)`: if already graduated → return; if `NOTIFY_ONLY`/kind can't reply → return (defense-in-depth, though never reached for email); if a pending `herald-graduation` approval already exists for this key → return (no nagging); if `consecutiveApproved(...) >= THRESHOLD` → `approvals.requestApproval({ runId: `${integrationId}/${category}`, kind: "herald-graduation", skill: "Herald", action: "graduate-tier2", detail: <count>/<threshold> summary (operator-facing, no untrusted body), risk: "medium" })` + `activity.record({ kind: "channel-approval", summary: "Herald navrhuje Tier-2 auto-reply pro <channel>/<category>", refs: { integrationId, status: category } })`.
   - `resume(runId)`: parse `integrationId/category`, look up kind from the latest ledger entry, `graduation.add({...})`, `activity.record` (reuse `channel-approval` or a new detail line). `cancel(runId)`: log + no store change (streak stays; a later approval could re-propose).
   - `isGraduated(integrationId, category)` passthrough for the triage flow.
5. **`apps/api/src/herald/herald.module.ts`** (new). Providers/exports `ReplyLedgerStore`, `HeraldGraduationStore`, `HeraldService` + the two dir tokens; imports `ApprovalsModule`, `ActivityModule`. Leaf-adjacent; verify no cycle (Herald depends on approvals/activity; neither depends back).
6. **`apps/api/src/channels/channels.module.ts`** — import `HeraldModule`; `ChannelTriageFlowService` gains `HeraldService` as an **`@Optional()`** dep (keeps the unit test's manual construction working, exactly like `jiraFlow` `channel-triage-flow.service.ts:88`).
7. **`apps/api/src/channels/channel-triage-flow.service.ts`** — wire the ledger + promotion:
   - In `handle()` after `effectiveVerdict` is computed and after the notify-only/readOnly guards, **before** the tier branch (`:211`): compute promotion. If `this.herald` present, `!forceT3`, `effectiveVerdict.tier === 3`, `effectiveVerdict.actionable`, `effectiveVerdict.confidence >= TRIAGE_CONFIDENCE_FLOOR`, and `await this.herald.isGraduated(item.integrationId, effectiveVerdict.category)` → set `promoted = { ...effectiveVerdict, tier: 2, reason: `${reason} (graduated: Tier-2 auto-reply)` }` and route through `handleTier2`. (Import `TRIAGE_CONFIDENCE_FLOOR` from `triage/triage.service.ts` — already exported.)
   - In `handleTier2` auto-send success (inside/after `sendReply`): `this.herald?.recordProposal({ ..., tier: 2, outcome: "sent-auto" })`. In `parkForApproval` (`:365-395`): `recordProposal({ ..., tier: verdict.tier, approvalId: approval.id, outcome: "pending" })`.
   - In `resume` (`:400-407`) after a successful send: `this.herald?.recordDecision(item.id, item.integrationId, item.triage.category, "approved")`. In `cancel` (`:410-423`): `recordDecision(..., "rejected")`. All ledger calls best-effort `.catch()` + warn (never block the triage tick).
8. **i18n:** none server-side required (ledger/graduation summaries are Czech string literals in the service, matching existing `channel-*` activity summaries). If a web ledger/graduation surface is added it is **deferred** — v1 committed scope is the data + the approval card, which renders through the existing `ApprovalsPanel` (the `herald-graduation` kind flows through the generic approvals queue with no new web code; verify it renders with its `skill`/`action`/`detail`).

### Tests (scoped vitest)
- `libs/contracts/src/herald/reply-ledger.schema.test.ts` — entry/graduation parse; `outcome` enum incl. reserved `edited`; `category` shared with triage.
- `libs/contracts/src/approvals/*.test.ts` — `herald-graduation` kind parses (+ enumeration test if present).
- `apps/api/src/herald/reply-ledger.store.test.ts` — record→list round-trip; `patchOutcome` updates + missing-id no-op; `consecutiveApproved`: 3 `approved` → 3; `approved,approved,rejected,approved` newest-first → head-run counting (a leading `rejected` → 0); `pending`/`sent-auto` skipped; corrupt file → fail-open.
- `apps/api/src/herald/herald.service.test.ts` — streak reaches threshold → parks exactly one `herald-graduation` approval; a pending graduation approval already present → no second park; a `rejected` decision resets (no park); `resume` writes the graduation (`isGraduated` true after); `cancel` writes nothing; **email/notify defense:** `maybeProposeGraduation` for an email kind never parks.
- `apps/api/src/channels/channel-triage-flow.service.test.ts` (extend existing) — a **graduated** `(team, question)` + confident T3 verdict → promoted to Tier-2 auto-send (reply sent, ledger `sent-auto`); a **non-graduated** identical verdict → parks (unchanged); a **low-confidence** T3 on a graduated channel → **not** promoted (stays parked — correction #3); `forceT3` (draft_only) on a graduated channel → **not** promoted; a hardened `channel-reply=ask` on a graduated channel → still parks (gate wins — correction #3).
- **Regression lock:** the existing `channels.e2e.test.ts` (`:132-218`) passes unchanged (no channel is graduated in that fixture).
Run: `pnpm exec vitest run libs/contracts/src/herald libs/contracts/src/approvals apps/api/src/herald apps/api/src/channels` + three `tsc -p`.

### Gotchas
- Category already rides `refs.status` — do **not** touch `ActivityRefsSchema` (`.strict()`; adding a field is a separate decision).
- `@Optional()` the `HeraldService` dep in the triage flow (mirror `jiraFlow`) so the unit test's manual `new ChannelTriageFlowService(...)` still compiles.
- Promotion routes through `handleTier2` (never a direct `sendReply`) so `evaluateReply`'s gate always runs.

### Commit
`feat(herald): reply ledger + evidence-based Tier-2 graduation (Tier-3 decided, gate-preserving)`

---

# F6b — Live soak harness (opt-in, fake-channel lane)

**Goal:** an **opt-in** (env-gated) soak that drives the real autonomous loop (`ChannelWatcherService.tick` → triage → gated reply/dispatch/park) against the fake adapter with **scripted scenarios** over an extended run, asserting each item landed at the expected tier and producing a **soak report**. A misroute or a gate violation (an item that should have parked but auto-sent, or an email that produced a reply) is a **test failure**. Never runs in CI / never on by default (correction #7).

### Verified current state (file:line)
- Fake adapter: `fake.adapter.ts` — `CHANNEL_FAKE_DIR` (`:22`), per-integration fixtures (`:38-39`), outbound recorded to `sent/<n>.json` (`:68-90`), forced-failure hook `CHANNEL_FAKE_TEST_FAIL` (`:26`).
- The exact harness to build on: `channels.e2e.test.ts:38-107` (`boot`, `seed`, env setup: `ZIBBY_DATA_DIR`, `CHANNEL_FAKE_DIR`, `CLAUDE_BIN=fixtures/fake-claude.mjs`), tier-1/2/3 + email assertions (`:113-278`), `until` poller (`:18-26`), fake-claude step env (`FAKE_CLAUDE_STEPS`/`FAKE_CLAUDE_DELAY_MS` `:58-59`).
- Adapter registry substitutes the fake for every kind when `CHANNEL_FAKE_DIR` is set (`fake.adapter.ts:8-11`).
- Watcher drive: `ChannelWatcherService.tick()` (`channel-watcher.service.ts:102`); config seeds `channelTickMs=0` so tests drive `tick()` directly (`system-config.fixture.ts`).

### Change list (ordered)
1. **`apps/api/test/soak/scenarios.ts`** (new). A typed array of scripted scenarios — each `{ integrationId, kind, name, text, expect: { tier: 1|2|3, state: ChannelItemState, replied?: boolean, parked?: boolean } }`. Cover: Tier-1 bug (dispatch), Tier-2 question with `reply` mandate (auto-send), Tier-3 request (park), email actionable (surface, **no reply/approval** — the Never-list assertion), a graduated `(channel, category)` that auto-sends (reuses F6a), and a low-confidence degraded item (surfaced). No `any` — `import type { ChannelItemState, IntegrationKind } from "@zibby/contracts"`.
2. **`apps/api/test/soak/soak-harness.ts`** (new). Pure orchestration: given a booted app + fake dir, seed each scenario's fixture (`seed` helper lifted from the e2e), run `watcher.tick()` in a loop for `SOAK_TICKS` (env, default small) with `SOAK_TICK_DELAY_MS`, poll items via the API, and collect a `SoakResult` per scenario `{ name, expectedTier, actualTier, expectedState, actualState, violations: string[] }`. A **gate violation** = actual tier below expected (auto-sent where park expected), an email that produced `reply`/`approvalId`, or a graduated promotion that bypassed the gate. Returns `{ results, violations, handledByTier }`.
3. **`apps/api/test/soak/soak.e2e.test.ts`** (new). `describe.skipIf(!process.env.ZIBBY_SOAK)(...)` — the opt-in guard (never runs unless `ZIBBY_SOAK=1`). Boots like `channels.e2e.test.ts:38-107`, seeds one Slack + one email integration + a non-empty agent catalog, runs the harness, then `expect(result.violations).toEqual([])` and asserts `handledByTier` matches the scripted expectation. On completion writes a markdown **soak report** to `process.env.SOAK_REPORT_PATH ?? <tmp>/soak-report.md` — table of scenario → expected/actual tier + a violations section.
4. **`apps/api/package.json`** — add a script `"soak": "ZIBBY_SOAK=1 vitest run apps/api/test/soak/soak.e2e.test.ts"` (opt-in entry point; not wired into `test`/CI).
5. **Vitest exclusion:** confirm the soak spec is excluded from the default run — `skipIf` already makes it a no-op without the env, but also verify `apps/api/vitest.config.ts` doesn't force-include it in the watch/CI default; if the default suite globs `**/*.e2e.test.ts`, the `skipIf` guard keeps it green-and-empty (assert 0 tests run without the env in the harness's own meta-test).

### Tests (scoped vitest)
- `apps/api/test/soak/soak-harness.test.ts` — a **unit** test of the harness/violation logic against a stubbed item list: a park-expected scenario that auto-sent → one violation; an email with a `reply` → violation; all-correct → `[]`. (This runs in the normal suite — it exercises the classifier of violations without booting.)
- The `soak.e2e.test.ts` itself is the opt-in integration proof (assert it is `skipIf`-guarded: 0 tests without `ZIBBY_SOAK`).
Run (default, always green): `pnpm exec vitest run apps/api/test/soak/soak-harness.test.ts` + api `tsc -p`.
Run (opt-in, manual): `pnpm --filter @zibby/api soak`.

### Gotchas
- **Never in CI:** the `skipIf(!ZIBBY_SOAK)` guard is the whole safety mechanism — the meta-assertion (0 tests without the env) locks it.
- Reuse the fake-claude fixture + `FAKE_CLAUDE_STEPS` so triage is deterministic; do not hit a real `claude` binary.
- The soak report is the only file written and only under the opt-in env — no writes in the default lane.
- Isolate under a fresh `mkdtemp` `ZIBBY_DATA_DIR` per run (e2e pattern `:51-56`) so a soak never mutates tracked `data-test` fixtures.

### Commit
`test(soak): opt-in fake-channel autonomous-loop soak harness + scenario report (never in CI)`

---

# F6c — Watcher health probes

**Goal:** each of the five real heartbeat watchers reports `last-tick timestamp + status`; a `WatcherHealthRegistry` aggregates them; the `/health` payload gains a `watchers[]` array; a **stale** watcher surfaces as a briefing warning line **and** a settings-HUD indicator. Fail-open (unknown/disabled → not-stale). (Corrections #5, #6.)

### Verified current state (file:line)
- Base + single timer path: `ticking-watcher-base.ts:34-93` (`guardedTick :79-92`, `arm :46-56`, `isArmed :67-69`, `tickMs()` abstract `:39`). Five subclasses: `channel-watcher.service.ts:47`, `monitor-watcher.service.ts:30`, `scheduler.service.ts:28`, `tasks/task-scheduler.service.ts`, `limits-resume/limit-resume.service.ts`.
- Only scheduler exposes `health()` (`scheduler.service.ts:89-91`, `lastTickAt :31,95`); others none.
- Health service/controller: `subsystem-health.service.ts:14-69` (injects only scheduler `:16-19`, `probeScheduler :52-68`), `health.controller.ts:24-40` (composes `degraded = !claude.ok || subsystems.some(!ok)`).
- Health contract: `health.schema.ts:21-26` (`SubsystemHealthSchema.name` is a **closed** enum — leave it; add a sibling array instead) + `HealthSchema:35-42`.
- Web: poll `useHealthQuery.ts` (10s), rendered `settings/Screen.tsx:235-251` (System tab — currently uptime + online only; `subsystems[]` not yet rendered).
- Registration precedent: `ApprovalsService.register` (`approvals.service.ts:55-58`) — runners self-register at `onModuleInit`.
- Briefing extras pattern to mirror: `briefing.schema.ts:97-103`, assembly render + service read helpers — **rebase onto the post-F5 file**.

### Contract additions (exact Zod)

**`libs/contracts/src/health/health.schema.ts`** — add before `HealthSchema`:
```ts
/** The five heartbeat watchers probed for liveness (F6c). Closed enum — a new
 *  watcher is added here on purpose, never a free-form string. */
export const WatcherIdSchema = z.enum([
  "channel",
  "monitor",
  "scheduler",
  "task-scheduler",
  "limit-resume",
]);
export type WatcherId = z.infer<typeof WatcherIdSchema>;

/**
 * One watcher's heartbeat (F6c — "is it actually ticking"). `ok` armed and ticking
 * (or armed and not yet due); `stale` armed but its last tick is older than the
 * stale factor × its interval — the genuine fault; `disabled` intentionally off
 * (`tickMs <= 0`, the test/CI mode), never a fault (fail-open). `ageMs` is the age of
 * `lastTickAt` at probe time; `detail` a short human note (e.g. the channel poller's
 * last error).
 */
export const WatcherHealthSchema = z.object({
  id: WatcherIdSchema,
  status: z.enum(["ok", "stale", "disabled"]),
  tickMs: z.number().int().nonnegative(),
  lastTickAt: IsoDateTimeSchema.optional(),
  ageMs: z.number().int().nonnegative().optional(),
  detail: z.string().optional(),
});
export type WatcherHealth = z.infer<typeof WatcherHealthSchema>;
```
Add to `HealthSchema` (`:41`, after `subsystems`): `watchers: z.array(WatcherHealthSchema),`. **Overall `degraded` stays as-is** — a `stale` watcher does **not** flip global readiness to degraded in v1 (fail-open; it surfaces as a line/indicator, not a red process). Documented in the `HealthSchema` JSDoc.

### Change list (ordered)
1. **Contracts.** Build; update `health.contract.test.ts` / `health.schema.test.ts` to include the new `watchers: []` in the expected shape (additive).
2. **`apps/api/src/shared/ticking-watcher-base.ts`** — add `private lastTickAt: string | null = null`; set it at the **start** of `guardedTick` (`:84`, `this.lastTickAt = new Date().toISOString()`). Add abstract `protected abstract readonly watcherId: WatcherId`. Add concrete `watcherHealth(now = Date.now(), staleFactor = 3): WatcherHealth`:
   - `tickMs = this.tickMs()`; if `tickMs <= 0` → `{ id, status: "disabled", tickMs }`.
   - if `lastTickAt == null` → `{ id, status: "ok", tickMs, detail: "armed, not yet ticked" }` (fail-open; armed timers unref, first tick imminent).
   - else `ageMs = now - Date.parse(lastTickAt)`; `status = ageMs > staleFactor * tickMs ? "stale" : "ok"`; include `lastTickAt, ageMs`.
   Each subclass adds `protected readonly watcherId = "<id>" as const` (5 one-liners). `SchedulerService` keeps its existing `health()` (used by `probeScheduler`) — leave it to avoid churn; the base field is what `watcherHealth` reads (set in guardedTick, which the scheduler's timer path also goes through).
3. **`apps/api/src/health/watcher-health.registry.ts`** (new) + **`watcher-health.module.ts`** (`@Global()`, mirrors the global LoggingModule). Registry: `register(probe: () => WatcherHealth): void` and `all(): WatcherHealth[]` (each probe called defensively in a try/catch → on throw, drop-with-warn). Global module means watchers inject it with no per-module import edit.
4. **Each of the five watcher services** — inject `WatcherHealthRegistry`; in `onModuleInit` add `this.registry.register(() => this.watcherHealth())`. For the **channel** watcher, `detail` reports last-poll error state only (`integrations.markSync` already stamps `lastError`); the triage-degraded surfacing is a documented follow-up (keeps F6c bounded).
5. **`apps/api/src/health/health.controller.ts`** — add `WatcherHealthRegistry` (or route through `SubsystemHealthService.probeWatchers()`); include `watchers: this.watchers.all()` in the body (`:31-38`). `degraded` unchanged (watchers don't gate readiness in v1).
6. **`apps/api/src/health/health.module.ts`** — import the global `WatcherHealthModule` (or rely on `@Global()`); no cycle (health is top-level, watchers don't import health).
7. **Briefing (additive, rebased post-F5):** `briefing.schema.ts` — add `staleWatchers: z.array(z.string()).max(20).optional()`. `briefing.service.ts` — inject `WatcherHealthRegistry`; add `this.watchers.all().filter(w => w.status === "stale").map(fmt)` into the gather (`.catch(() => [])`), pass `staleWatchers`. `briefing-assembly.ts` — `staleWatchers?` on `BriefingInput`, conditional spread, `## Watchers` render block (mirror the `## Security`/`## Quality` blocks F5 added). `briefing.module.ts` — import the global watcher module (no-op if `@Global()`).
8. **Web HUD indicator:** `settings/Screen.tsx` System tab (`:235-251`) — render `health.watchers` as `InfoRow`s (id + status, `tone="ok"` for ok, a warning tone for `stale`, faint for `disabled`), guarded by `health?.watchers`. Add `SettingsTestId.WatcherRow` (or the settings feature's existing testid enum) per row; i18n `settings.watchers.*` cs+en (`title`, `stale`, `disabled`, `ok`). Poll cadence is the existing 10s `useHealthQuery`.

### Tests (scoped vitest)
- `libs/contracts/src/health/health.schema.test.ts` — `WatcherHealthSchema` parses; `HealthSchema` now requires `watchers` (update fixtures); `staleWatchers` optional/omissible on `BriefingSchema`.
- `apps/api/src/shared/ticking-watcher-base.test.ts` (extend) — `watcherHealth`: `tickMs<=0` → `disabled`; never-ticked armed → `ok` + detail; a `guardedTick` sets `lastTickAt` and a fresh probe → `ok`; a stubbed old `lastTickAt` (age > 3×tickMs) → `stale` with `ageMs`.
- `apps/api/src/health/watcher-health.registry.test.ts` — register two probes → `all()` returns both; a throwing probe is dropped, not fatal (fail-open).
- `apps/api/test/health.e2e.test.ts` (extend) — `GET /health` body has `watchers[]` with the five ids; overall `status` unaffected by a stale watcher.
- `apps/api/src/briefing/*` — `staleWatchers` present⇄absent snapshot; a stale probe → a `## Watchers` line; read failure → omitted, briefing still assembles.
- Web: `settings/Screen.test.tsx` (or a focused test) — watcher rows render with testids; a `stale` row shows the warning tone; absent `watchers` → no crash.
Run: `pnpm exec vitest run libs/contracts/src/health libs/contracts/src/briefing apps/api/src/shared apps/api/src/health apps/api/src/briefing apps/api/test/health.e2e.test.ts apps/web/features/settings` + three `tsc -p`.

### Gotchas
- Do **not** widen `SubsystemHealthSchema.name`'s closed enum — `watchers` is a sibling array (backward-compatible).
- Set `lastTickAt` in `guardedTick`, not in each public `tick()` (unit tests call `tick()` directly and must not need to fabricate a timestamp; the health probe cares about the live timer path — correction #6).
- A stale watcher is a **line + indicator only** in v1, never a red `/health` status (fail-open). Document the choice.
- The goal loop is **not** a watcher — do not add it (correction #5).

### Commit
`feat(health): per-watcher last-tick probes + registry, /health watchers[], stale → briefing + HUD`

---

## Sequencing, dependencies, risks

- **Order F6a → F6b → F6c.** F6b's scenarios exercise F6a's graduation path, so F6a lands first. F6c is independent but its briefing edit must rebase onto the post-F5 `BriefingSchema`/`assembleBriefing` (BINDING coordination rule).
- **Depends on F1–F5 end state:** `ownerSubsystem` write-time 422 (any new integration/agent in soak fixtures passes `ownerSubsystem`); F3's gate buckets don't conflict (graduation is orthogonal, finer-grained than F3's `SUBSYSTEM_TIER_DEFAULT` and never weakens the gate); F5's briefing extras pattern is the template F6c copies.
- **Autonomy contract:** email notify-only preserved by construction (correction #2); graduation is Tier-3-decided and gate-preserving (correction #3); `pr.merge` untouched; soak never runs in CI (correction #7); stale watcher is fail-open (corrections #5/#6).
- **Cross-package tsc** contracts → api → web at each checkpoint; phase-end `pnpm test` + `pnpm check:deps` (ignore the 2 known `pipelines.e2e` fails).
- **data-test landmine:** F6a/F6c add no seeded system automations, so no `data-test` fixture regeneration is needed; the soak uses an isolated `mkdtemp` data dir. Still `git status --short apps/api/data-test` at each checkpoint.
- **Biggest risks, in order:** (1) the `channel-triage-flow` promotion branch — regression-lock the existing `channels.e2e.test.ts` unchanged; (2) `TickingWatcherBase` new abstract member — all five subclasses must add `watcherId` or `tsc` fails (that's the guardrail); (3) module cycles (channels←herald, health←watcher-registry) — Herald is a leaf, the watcher registry is `@Global()`, both verified one-directional; confirm at boot.
- Update `docs/ns2/PROGRESS.md` rows F6a/F6b/F6c with shas.

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED with the following rulings on the flagged decisions:

1. **Correction #1 ruled as recommended:** the outcome enum ships with `edited`
   RESERVED and never produced; graduation counts only consecutive `approved`.
   An edit-on-approve endpoint is OUT of F6 — recorded as a follow-up in
   PROGRESS.md notes.
2. **Correction #4 ruled as recommended:** `TRIAGE_CONFIDENCE_FLOOR` stays a
   global constant; a per-subsystem threshold is a deferred follow-up (PROGRESS.md
   note), NOT F6 scope.
3. **Correction #7 ruled as recommended:** F6b ships the fake-channel opt-in lane
   only; the live-credentialed soak lane stays a documented follow-up. The
   `skipIf(!ZIBBY_SOAK)` guard plus the 0-tests-without-env meta-assertion are
   mandatory.
4. **Graduation safety invariants are non-negotiable and must each have a test:**
   (a) email/notify-only kinds can never graduate or be promoted; (b) promotion
   only on confident, naturally-T3 verdicts (`!forceT3`, confidence ≥ floor);
   (c) promotion always routes through `handleTier2` so the gate's `evaluateReply`
   runs; (d) a hardened `ask` gate rule still parks a graduated channel; (e) the
   graduation decision itself is a Tier-3 parked approval.
5. **F6c:** five watchers only (goal loop excluded); a stale watcher never flips
   global `/health` degraded in v1.
6. Commit messages end with the standard Co-Authored-By + Claude-Session footers.
