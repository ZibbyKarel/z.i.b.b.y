# Code Audit — průběžný draft

_Rebuildováno po každé vlně z .audit/batches/*.md_

---
BATCH: api-activity-briefing

[SEVERITY: Medium] [FILE: apps/api/src/briefing/claude-cli-briefer.ts:1-141] [CATEGORY: Duplicate logic]
`ClaudeCliBriefer` is (per its own docstring) an intentional copy of `ClaudeCliTriager`'s spawn/timeout/parse shape — the same pattern is separately reimplemented in claude-cli-router, claude-cli-task-namer, claude-cli-distiller, claude-preflight, goal-runner, chat-session, and runner-core (8 total copies of spawn+8s-timeout+envelope-unwrap+fence-tolerant-parse). (DEFINITIVNÍ potvrzení nejrozšířenějšího cross-cutting nálezu auditu.)
Doporučení: extract a shared `ClaudeCliRunner`/base class each caller supplies only its system prompt + Zod schema to.

[SEVERITY: Medium] [FILE: apps/api/src/briefing/claude-cli-briefer.ts] [CATEGORY: Test coverage]
No test file — the fence-tolerant `parse()`/`extractResultText()` logic (trickiest part) and the strict-schema rejection path are entirely unexercised.
Doporučení: add unit tests for parse/extractResultText/timeout/non-zero-exit, injecting a fake `runClaude`.

[SEVERITY: Medium] [FILE: apps/api/src/briefing/claude-cli-briefer.ts:66-79] [CATEGORY: Prompt injection]
`buildPrompt` includes `didForYou` summaries, which for `task-outcome` entries embed `agentRunSummary`/`delivery.summary` (free-form text an agent produced processing a task — potentially one whose input was an inbound channel message carrying injected instructions). That text reaches the second `claude -p` prompt unsanitized; only `HeadlineSchema` `.strict().max(200)` limits blast radius.
Doporučení: cap/sanitize `didForYou` summary length before the prompt, or document why the strict output schema suffices.

[SEVERITY: Low] [FILE: apps/api/src/activity/activity-log.service.ts:216-242] [CATEGORY: Performance]
`readSince`/`readRange` (and the list() windowed path, default 14 days, up to 90) read each day's .jsonl in a sequential `for...of` with await, not `Promise.all` — N sequential disk round-trips.
Doporučení: parallelize per-day reads with `Promise.all` (restore order via existing sort).

[SEVERITY: Low] [FILE: apps/api/src/activity/activity-log.service.ts:80-96] [CATEGORY: Storage/ops]
Day files are never rotated, compacted, or archived — the log grows forever, and every windowed/paged read scans however many day files exist.
Doporučení: add a retention/archival job once this ships long-lived.

[SEVERITY: Low] [FILE: apps/api/src/activity/activity-recorder.service.ts:23,91-95] [CATEGORY: Memory leak]
`seen: Map<string,string>` accumulates one entry per distinct runRef/pipelineRunId for the process lifetime, never pruned (no TTL/cap/removal on terminal status).
Doporučení: delete the entry once a terminal kind (run-finished/pipeline-finished) is recorded.

[SEVERITY: Low] [FILE: libs/contracts/src/activity/activity.schema.ts:136] [CATEGORY: Validation]
`ActivityEntrySchema.summary` is `z.string()` with no max length, unlike the briefer's `HeadlineSchema` (.max(200)) — a verbose summary writes an arbitrarily large line into the append-only log.
Doporučení: add `.max(...)`, truncate at the call site (preserve "record never throws").

[SEVERITY: Low] [FILE: apps/api/src/activity/activity.controller.ts, activity-view.controller.ts, briefing.controller.ts] [CATEGORY: Test coverage]
None of the three controllers have dedicated tests — the listActivity 422 date-format branch, pageActivity cursor plumbing, and the activity-view PUT's 422-on-unknown-field rejection (a Law-4 hygiene guarantee) are only indirectly exercised.
Doporučení: add controller tests for the 422 branches (the security-relevant strict-schema rejection paths).

[SEVERITY: Low] [FILE: apps/api/src/briefing/claude-cli-briefer.ts:119-127] [CATEGORY: Robustness]
`parse()` locates JSON via `indexOf("{")`/`lastIndexOf("}")` rather than a real fenced-code extractor — a preamble with an earlier `{` shifts the slice and likely fails JSON.parse, silently falling back to the deterministic headline.
Doporučení: log when extraction fails so degraded generation is observable.

STATS: 19 souborů, 2154 řádků. Top 3: briefing/briefing-assembly.ts (368), activity/activity-log.service.ts (260), briefing/briefing.service.ts (256).

---
BATCH: api-agents-factory

[SEVERITY: High] [FILE: apps/api/src/agents/agents.storage.service.ts:158-169] [CATEGORY: Tool allow-list gap]
`tools`/`optionalTools` frontmatter is accepted as bare arbitrary strings (`AgentSchema.tools: z.array(z.string())` in libs/contracts, no enum) — a hand-edited or API-submitted agent file can carry any string, which flows unchecked into the runner's `--allowedTools`/`--agents` construction with no cross-check against a known Claude tool-id catalog. (Potvrzuje contracts-a nález o `tools` array + runner claude-tools.ts allow-list díru — end-to-end nevalidovaná cesta.)
Doporučení: validate `tools`/`optionalTools` against a closed tool-id enum at parse time, reject/drop unknown ids.

[SEVERITY: Medium] [FILE: apps/api/src/agents/agents.storage.service.ts:150-152] [CATEGORY: Performance]
`fromFrontmatter` calls `avatarAssets.inlineSync` (synchronous readFileSync) for every agent carrying an externalized avatar, inside `list()`'s otherwise-parallel `Promise.all` — each avatar file blocks the event loop on a hot path (catalog listing for task classification/dispatch). (Stejný sync-fs vzor jako pipelines storage.)
Doporučení: make avatar inlining async and await it alongside the other file reads.

[SEVERITY: Medium] [FILE: apps/api/src/agents/agent-runner.service.ts:160-205,248-272,286-341,710-721] [CATEGORY: Maintainability]
`start`, `launch`, `rerun` and `buildCommand` all take 9-11 positional parameters; `rerun()` calls `launch()` with five trailing positional args (`undefined, undefined, undefined, rec.sessionId, undefined`), easy to mis-order and silently break attachment/toolGrant threading. (Stejný positional-args smell jako scheduler dispatch.)
Doporučení: replace positional parameter lists with a single options object per method.

[SEVERITY: Medium] [FILE: apps/api/src/agents/categories.controller.ts:8-15, agents.module.ts:45-49] [CATEGORY: Nest.js best practice]
Correct routing of `/agents/categories` vs `/agents/:id` depends on declaration order of controllers in the module array (documented in a comment, guarded only by an e2e test). (Stejný route-ordering křehkost jako pipelines module.)
Doporučení: prefer an explicit static-before-dynamic route guard or distinct path prefix.

[SEVERITY: Low] [FILE: apps/api/src/agents/agents.controller.ts:36-37] [CATEGORY: Error handling]
`updateAgent` re-validates the merged patch via `AgentSchema.parse` in storage's `update()`; `errors.or404` only intercepts `AgentNotFoundError`/`InvalidAgentIdError`, so a `ZodError` from that re-parse propagates unhandled → likely 500 instead of 400.
Doporučení: map `ZodError` to 400 in the error mapper or catch it in `update()`.

[SEVERITY: Low] [FILE: apps/api/src/agents/agent-runner.service.ts:319,730-731] [CATEGORY: Duplicate logic]
The "reject non-absolute path" defensive check for grant/attachment dirs is duplicated between `resolveGrantDirs` and `buildCommand` (comment "matches resolveGrantDirs" instead of reusing it).
Doporučení: extract a shared `isSafeAbsoluteDir` helper.

[SEVERITY: Low] [FILE: apps/api/src/agents/agent-runner.service.ts] [CATEGORY: File size]
783 lines — over the ~600 guideline; mixes spawn orchestration, worktree/project resolution, env/secrets merging, and mid-run gate evaluation.
Doporučení: extract worktree/project resolution and mid-run intent evaluation.

[SEVERITY: Low] [FILE: apps/api/src/agents/ (controllers/module/record)] [CATEGORY: Missing tests]
No dedicated unit tests for any controller, module wiring, `agent-run.record.ts` projection functions, `ORCHESTRATOR_AGENT`, or `agent-factory.module.ts`.
Doporučení: add focused tests for `agentStrategy.assemble`/`toAgentRun` (record projection is load-bearing for HTTP shape) and `intersectToolGrants`.

[SEVERITY: Low] [FILE: apps/api/src/agent-factory/] [CATEGORY: Scope note]
All 7 agent-factory files implement only the candidate-proposal pipeline; the curated catalog-build logic (cap 16, E2BIG, `selectCatalogAgents`) referenced in the brief actually lives in `runner/claude-run-command.service.ts` (auditováno v api-runner-core). Bez code change — flag, že catalog-build/E2BIG surface pokryl runner batch.

STATS: 20 files, 3065 lines. Top 3: agents/agent-runner.service.ts (783), agents.storage.service.test.ts (489), agent-runner.service.test.ts (372).

---
BATCH: api-automations-chains

[SEVERITY: High] [FILE: apps/api/src/automations/scheduler.service.ts:52-110] [CATEGORY: Concurrent execution / dedup]
`tick()` is invoked from a plain `setInterval` with no re-entrancy guard; if a tick's async work outlives `tickMs`, the next firing starts a second overlapping `tick()`. Both read `storage.list()` before either has called `markFired`, so the same automation can dispatch twice for one due minute — the in-memory "same wall minute" dedup does not protect against overlapping ticks. (Stejný re-entrancy vzor jako channel-watcher tick.)
Doporučení: Guard `tick()` with an `isTicking` flag or serialize via a promise chain.

[SEVERITY: High] [FILE: apps/api/src/automations/scheduler.service.ts:96-107] [CATEGORY: Error handling / cron correctness]
The `for (const automation of ...)` loop in `tick()` has no try/catch around `fire()`; if dispatching one automation throws, the exception propagates out of `tick()` and the loop stops — every automation later in iteration order silently does not fire that minute, no retry.
Doporučení: Wrap each automation's fire in try/catch, log, and continue.

[SEVERITY: High] [FILE: apps/api/src/automations/automations.storage.service.ts:144-177] [CATEGORY: Concurrent execution / data race]
`update()` and `markFired()` are both unsynchronized read-modify-write cycles against the same JSON file. `withPathLock` exists for exactly this class of race (used in task-scheduler and vault) but isn't used here — an operator PATCHing an automation as the scheduler calls `markFired` (or two overlapping markFired calls) can lose one write. (Potvrzuje systémový lost-update vzor.)
Doporučení: Wrap `update()` and `markFired()` in `withPathLock(id, …)`.

[SEVERITY: Medium] [FILE: apps/api/src/automations/cron.ts:15-27] [CATEGORY: Cron correctness]
`matchesCron` ANDs all 5 fields including day-of-month and day-of-week. Standard cron ORs those two when both are restricted — "run on the 1st or every Monday" would under standard cron fire on both; here it fires only when a day is simultaneously the 1st AND a Monday. Undocumented and untested deviation.
Doporučení: Document the AND-only semantics in the operator UI, or implement standard OR-when-both-restricted.

[SEVERITY: Medium] [FILE: apps/api/src/automations/cron.ts:15] [CATEGORY: Timezone]
`matchesCron` defaults `timeZone` to `"Europe/Prague"` and every call site omits the argument — no per-automation timezone field on the trigger schema, so all cron automations are permanently pinned to one hardcoded timezone.
Doporučení: Add a `timeZone` field to the cron trigger schema if multi-tz is needed; otherwise document the hardcoded assumption.

[SEVERITY: Medium] [FILE: apps/api/src/chains/chains.controller.ts:25-71, chain-runs.controller.ts:20-43] [CATEGORY: Duplicate logic]
Both controllers hand-roll the not-found/invalid-id try/catch three separate times, duplicating what `makeErrorMapper` (used in automations.controller.ts) centralizes.
Doporučení: Route chains/chain-runs error handling through `makeErrorMapper`.

[SEVERITY: Medium] [FILE: apps/api/src/chains/chain-runner.service.ts:308-313] [CATEGORY: Security / path handling]
`readArtifactContent` for a `project-file` artifact does `fs.readFile(path.join(project.path, record.locator))` with no containment check on `record.locator`. If a delivery sink or future producer writes a locator with `../`, this reads arbitrary files outside the project checkout (entity-file-store has `resolveSafeFile` for exactly this risk, not reused here).
Doporučení: Validate `record.locator` stays within `project.path` (reuse `resolveSafeFile`'s containment check).

[SEVERITY: Low] [FILE: apps/api/src/chains/chain-runner.service.ts:297-299] [CATEGORY: Performance]
`consumableArtifact` calls `artifacts.list()` (full unbounded read) on every step transition and boot reconcile, then linear `.find()`. Scales with total artifact history. (Stejný list()-then-find vzor jako task-runs/pipeline-runs.)
Doporučení: Add a lookup by `runRef` to `ArtifactsStorageService`.

[SEVERITY: Low] [FILE: apps/api/src/automations/scheduler.service.ts:113-118] [CATEGORY: Correctness]
`trigger()` (manual/API fire) dispatches regardless of `automation.enabled` — a disabled automation can still be triggered via API. May be intentional but undocumented and inconsistent with `tick()`'s enabled check.
Doporučení: Document the bypass or gate it like `tick()`.

[SEVERITY: Low] [FILE: apps/api/src/automations/scheduler.service.test.ts] [CATEGORY: Missing tests]
The test file only exercises `trigger()`. `tick()` itself — cron matching, same-minute idempotence, multi-automation iteration, health/arm lifecycle — has zero coverage.
Doporučení: Add tick()-level tests: due filtering, same-minute dedup, failing automation not blocking siblings.

[SEVERITY: Low] [FILE: apps/api/src/chains/chain-runner.service.ts] [CATEGORY: File size]
349 lines, largest in batch — lifecycle wiring, transition logic, artifact plumbing, persistence in one class.
Doporučení: extract `readArtifactContent`/`consumableArtifact` if artifact kinds grow.

STATS: 17 souborů (10 automations + 7 chains), 2065 řádků. Top 3: chains/chain-runner.service.ts (349), chain-runner.service.test.ts (322), automations/scheduler.service.ts (210).

---
BATCH: api-budget-limits

[SEVERITY: Critical] [FILE: apps/api/src/budget/budget.service.ts:85-226] [CATEGORY: race-condition/cap-enforcement]
`check()` and `recordDispatch()` are two separate awaited calls with no lock between them; the immediate-create dispatch path (task-scheduler.service.ts:563 → attemptCreate) calls `budget.check` and later appends to the ledger without the `withPathLock("scheduler:drain", …)` protection used on the queue-drain path. Two concurrent task creations for the same project can both read the ledger as under-cap before either records its dispatch, exceeding daily/weekly/monthly run caps (proti zákonu "no auto-spend past budget"). (Přímo souvisí s scheduler atCapacity TOCTOU nálezem.)
Doporučení: wrap the check-then-record sequence in the same per-project/global lock used for the drain path.

[SEVERITY: High] [FILE: apps/api/src/goals/goal-runner.service.ts:513] [CATEGORY: enforcement-data-integrity]
The goal-runner's call to `budget.recordDispatch(...)` is wrapped in `.catch(() => {})`, silently swallowing ledger-write failures — directly contradicting `BudgetService.recordDispatch`'s own doc comment that it is "awaited, NOT best-effort." A failed append permanently undercounts that project's usage, so later `check()` calls pass when they shouldn't.
Doporučení: propagate/log the failure as fail-closed (hold/park), matching task-scheduler's `recordLedger` which does not catch.

[SEVERITY: High] [FILE: apps/api/src/limits/limits.service.ts:77-117] [CATEGORY: missing-tests]
`resolveResumeAt`, `windowExhausted`, and `resumeReadiness` — the exact functions deciding paused-vs-fail and resume timing (the "5h/weekly limits, paused≠fail" contract) — have zero unit tests. `limit-resume.service.test.ts` only exercises `LimitResumeService` against a fully mocked `resumeReadiness`, so the real freshness/headroom logic is untested anywhere.
Doporučení: add direct tests for these three methods covering stale snapshot, both-windows-under-100%, one-window-at-100%, and detected-vs-live reset priority.

[SEVERITY: Medium] [FILE: apps/api/src/budget/budget.service.ts:88-105] [CATEGORY: fail-closed-inconsistency]
The class doc says budget is fail-closed on an "unreadable limits snapshot," but the global-ceiling threshold check only runs `if (!limits.stale)` — a successfully-read-but-stale snapshot (common, since limits go stale after 10 min of Claude Code being closed) silently skips the pause-threshold check instead of holding.
Doporučení: treat `stale` the same as "unreadable" for the global gate, or make the fail-open behavior explicit in the doc.

[SEVERITY: Medium] [FILE: apps/api/src/budget/budget.service.ts:176-207] [CATEGORY: cap-enforcement-accuracy]
Dollar-cap enforcement is a soft, average-based estimate (`spent + avg-of-past-cost-lines`), not a hard per-run cap; a run's true cost is written after the fact by task-scheduler's reconcileOutcome (best-effort). A single unusually expensive run can push actual spend well past the cost caps with no mid-flight stop.
Doporučení: document explicitly as a soft/advisory cap, or add a hard per-run cost ceiling where an estimate exists.

[SEVERITY: Medium] [FILE: apps/api/src/budget/budget.service.ts:130-131,178] [CATEGORY: boundary-inconsistency]
Run-count caps block at the boundary (`used >= dailyRuns`) while cost caps only block strictly above it (`estimate > dailyCostCapUsd`) — asymmetric off-by-one for the same "over-cap" concept.
Doporučení: pick one boundary convention and apply to both axes.

[SEVERITY: Medium] [FILE: apps/api/src/budget/ledger.store.ts:122-146] [CATEGORY: performance/unbounded-io]
No caching on ledger reads (unlike LimitsService's 5-min cache): every `check()` and every row of `status()` re-reads and re-parses the relevant day-files. `status()` issues up to 6 window queries per project, the monthly ones re-reading up to 31 day-files each.
Doporučení: add a short-TTL in-memory cache per (projectId, window, day-set), mirroring LimitsService.

[SEVERITY: Low] [FILE: apps/api/src/budget/budget.service.ts:224-226] [CATEGORY: missing-tests]
`recordDispatch` (and `BudgetLedgerStore.record`) is only exercised indirectly; no test calls it directly or asserts the ledger write on the enforcement path.
Doporučení: add a direct test asserting the exact `LedgerEntry` shape written on dispatch.

[SEVERITY: Low] [FILE: apps/api/src/limits/limits.service.ts:80-85,113-116,133-136] [CATEGORY: duplication]
The "earliest future window reset" computation is repeated near-identically three times across `resolveResumeAt`, `refresh`, and `windowExhausted`.
Doporučení: extract an `earliestFutureReset(snapshot, now)` helper.

[SEVERITY: Low] [FILE: apps/api/src/limits/rate-limits.reader.ts:84] [CATEGORY: robustness]
`stale = ... || now - capturedAt > STALE_AFTER_MS` doesn't guard against `capturedAt` being in the future (clock skew/corrupted capture); `now - capturedAt` goes negative and reads as fresh instead of triggering the fail-closed stale path.
Doporučení: also treat `capturedAt > now` (beyond a small skew tolerance) as stale.

[SEVERITY: Low] [FILE: apps/api/src/limits/usage-fetcher.ts:119] [CATEGORY: test-boundary-leak]
Production code branches on `process.env.VITEST` to avoid the Keychain/network under tests — couples runtime behavior to a specific test runner's env var; any harness not setting `VITEST` would attempt the real call.
Doporučení: inject a `liveFetchEnabled` flag via DI/config instead of sniffing the test-runner env var.

STATS: 18 souborů, 2397 řádků. Top 3: budget/budget.service.test.ts (390), budget/budget.service.ts (364), budget/ledger.store.test.ts (250).

---
BATCH: api-channels-adapters

[SEVERITY: High] [FILE: apps/api/src/channels/adapters/slack.adapter.ts:78] [CATEGORY: Rate limits / data completeness]
Slack (`conversations.history`, limit 50), Jira (`search`, maxResults 50) and GitHub (`issues`, per_page 50) all fetch only the first page per poll tick with no pagination follow-up — unlike `calendar.adapter.ts`, which explicitly drains every page via `nextPageToken` with a `MAX_PAGES` cap. Under backlog (after downtime or a busy channel/repo) items beyond page 1 are silently deferred with no documenting comment, and identical-timestamp ties at the page boundary can stall cursor advancement.
Recommendation: paginate to a bounded cap (mirror calendar's MAX_PAGES) or add the same explicit bounded-drain justification email.adapter.ts has.

[SEVERITY: Medium] [FILE: apps/api/src/channels/adapters/slack.adapter.ts:53] [CATEGORY: Resource leak / reliability]
None of the fetch-based adapters (slack, jira, github, calendar) set a timeout/`AbortController` on any request. A hung TCP connection to a degraded external API blocks that integration's heartbeat tick indefinitely.
Recommendation: wrap `fetchImpl` calls with `AbortSignal.timeout(...)` at a shared default.

[SEVERITY: Medium] [FILE: apps/api/src/channels/adapters/fake.adapter.ts] [CATEGORY: Missing tests]
`fake.adapter.ts` has no dedicated unit test even though it is the seam every e2e/unit suite runs through (`CHANNEL_FAKE_DIR`); a regression would silently corrupt every downstream e2e assumption.
Recommendation: add a focused unit test for poll/send fixture ordering, per-integration dir fallback, and cursor advancement.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/adapter-registry.ts] [CATEGORY: Missing tests]
No test for `AdapterRegistry` — the `fakeMode()` env-gated substitution and `resolve()`/`test()` routing (the seam guarding "fake never leaks into prod") are untested.
Recommendation: add a test asserting `CHANNEL_FAKE_DIR` toggles every kind to FakeChannelAdapter and is off by default.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/slack.adapter.ts:30] [CATEGORY: Duplicate pattern]
`tokenOf(creds)` is duplicated verbatim in slack/jira/github adapters, with an equivalent `passwordOf` in email.adapter.ts.
Recommendation: extract to a shared credential-narrowing helper.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/jira.adapter.ts:42] [CATEGORY: Duplicate pattern]
The `fetchImpl: typeof fetch = fetch` constructor-injection plus the near-identical `test()` try/catch → `TestResult` mapping is repeated near-verbatim across slack/jira/github/calendar.
Recommendation: introduce an abstract `FetchChannelAdapter` base with `fetchImpl` injection and a generic `probeTest` helper.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/github.adapter.ts:97] [CATEGORY: Duplicate pattern]
The "advance cursor to newest seen" comparison is duplicated identically in jira/github/calendar, relying on lexicographic ISO-8601 comparison rather than a shared tested utility.
Recommendation: factor into a shared `advanceCursor(current, candidate)` helper.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/github.adapter.ts:74] [CATEGORY: Rate limits / error handling]
HTTP 403 is unconditionally treated as a rate limit, but GitHub also returns 403 for insufficient token scope — a real permission misconfiguration gets mislabeled as transient throttling and masked behind retries.
Recommendation: distinguish via `X-RateLimit-Remaining` before labeling as rate limit.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/github.adapter.ts:77] [CATEGORY: Error handling / consistency]
`throw new Error(\`github issues: HTTP ${res.status}\`)` discards the response body, unlike jira/calendar which include the provider's actual error detail.
Recommendation: parse and include the GitHub error body message.

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/email.adapter.ts:151] [CATEGORY: Error handling]
`messageFlagsAdd(...).catch(() => {})` for marking `\Seen` silently swallows failures — if it consistently fails, previously-persisted mail is repeatedly never marked read with no diagnostic signal.
Recommendation: log the swallowed error (even at debug level).

[SEVERITY: Low] [FILE: apps/api/src/channels/adapters/email.adapter.ts:101] [CATEGORY: Credentials / info exposure]
`test()`/`poll()` propagate raw `(err as Error).message` from external libraries (ImapFlow, fetch) into `TestResult.detail`/`lastError`; IMAP/SMTP errors can include connection/user details.
Recommendation: confirm downstream never echoes verbatim to a non-operator audience, or sanitize known-sensitive substrings.

STATS: files=8, total_lines=1123, top3=[email.adapter.ts (242), calendar.adapter.ts (219), jira.adapter.ts (194)]

---
BATCH: api-channels-core

[SEVERITY: High] [FILE: apps/api/src/channels/channel-watcher.service.ts:178] [CATEGORY: Reliability / message loss]
When `flow.handle()` throws it is caught and the item is left in state `new` with the comment "retry next tick", but the cursor is unconditionally advanced afterwards (line ~192) and nothing ever re-scans existing `new`-state items — only freshly-polled `isNew` items are handled. A triage failure strands the item in `new` forever; the "at-least-once" claim is false.
Doporučení: Add a per-tick sweep that re-`handle()`s any lingering `state:"new"` items, or only advance the cursor once all items in the batch were handled.

[SEVERITY: High] [FILE: apps/api/src/channels/channel-watcher.service.ts:80] [CATEGORY: Race condition / double action]
`setInterval(() => void this.tick())` has no re-entrancy guard. With a short `channelTickMs` (dev 3000ms) and 8s LLM triage per item, ticks overlap; two concurrent polls can both see the same message, both pass the `put` dedup (both fileExists=false before either writes), both get isNew=true → double `handle()` → double task dispatch or double reply.
Doporučení: Guard `tick()` with an "already running" flag; make `put` atomically fail-if-exists (O_EXCL) so concurrent puts can't both report new.

[SEVERITY: High] [FILE: apps/api/src/channels/triage/claude-cli-triager.ts:1] [CATEGORY: Missing test / prompt-injection surface]
The single most security-critical component (untrusted text → LLM prompt, verdict parsing, schema-closing) has NO unit test. `parseVerdict`/`extractResultText` fence-tolerant parsing and the `.strict()` rejection→fallback path are entirely unverified, and the `VITEST` guard means it never runs in CI.
Doporučení: Add tests feeding crafted `result` payloads (extra keys like `forceApprove`/`gate`, tier=4, code-fenced JSON, prose-wrapped JSON) asserting rejection and fallback to keyword triage.

[SEVERITY: Medium] [FILE: apps/api/src/channels/channel-watcher.service.ts:152] [CATEGORY: Performance / OOM]
`MAX_MESSAGES_PER_POLL=50` is enforced only inside `email.adapter.ts`; the watcher itself iterates `items` unbounded and triages each (an LLM spawn per item). A non-email adapter returning thousands on a first poll causes unbounded memory + token spend — the IMAP-OOM failure class.
Doporučení: Slice `items` to a watcher-level cap before the loop as defense-in-depth.

[SEVERITY: Medium] [FILE: apps/api/src/channels/channel-triage-flow.service.ts:428] [CATEGORY: Performance / unbounded growth]
`sweepOutcomes` runs at the top of every tick and `store.list({state:"handled"})` re-reads every JSON file across every integration dir each time; `list()` has no pagination. Items are never retired from disk (no retention sweep), so scan cost and memory grow without bound.
Doporučení: Track pending-outcome items by id instead of full-dir scans; add a retention/compaction sweep for terminal-state items.

[SEVERITY: Medium] [FILE: apps/api/src/channels/channel-triage-flow.service.ts:211] [CATEGORY: Autonomy / injection surface]
A Tier-1 verdict over untrusted, attacker-influenced text auto-dispatches a delivery task (agent run) whenever `mandate.dispatch` is on — a crafted "bug report" can autonomously trigger branch creation and token spend. Text is enveloped (good) but the agent is still driven by attacker-chosen framing; only the PR-merge gate bounds it.
Doporučení: Acceptable per contract, but consider gating the FIRST auto-dispatch per sender/integration, or capping autonomous dispatch rate, so injection can't fan out runs.

[SEVERITY: Medium] [FILE: apps/api/src/channels/triage/claude-cli-triager.ts:104] [CATEGORY: Performance / OOM]
`stdout += buf.toString()` accumulates the child's output with no size cap; only the 8s timeout bounds it. (Párový nález s runner-aux a claude-cli-router.)
Doporučení: Cap accumulated stdout length and kill the child once exceeded.

[SEVERITY: Low] [FILE: apps/api/src/channels/channel-triage-flow.service.ts:110] [CATEGORY: Data handling]
`maybeFileJiraBug` builds the Jira summary/description from raw `item.text` without the Law-4 envelope. It is a data sink (not an LLM prompt) and text was already `sanitizeInbound`-ed at ingestion, so bounded — but it is the one place untrusted body flows outbound un-enveloped.
Doporučení: Fine as-is; add a comment explaining why the envelope is unnecessary here to prevent future copy-paste into a prompt context.

[SEVERITY: Low] [FILE: apps/api/src/channels/channel-triage-flow.service.ts:289] [CATEGORY: Correctness]
`isVipSender` matches with `from.includes(person.name)` (case-insensitive substring). A short person name ("Al", "Jan") yields false-positive VIP matches; `from` is spoofable. Impact bounded because VIP only ESCALATES to Tier 3 (safe direction).
Doporučení: Match against a stored email/handle field rather than display-name substring, or require a word-boundary match.

[SEVERITY: Low] [FILE: libs/contracts/src/channels/channel.schema.ts:29] [CATEGORY: Consistency]
Schema caps `summary` at `max(280)` while the triager system prompt instructs "≤200 chars" — the schema is the enforced boundary and the two should agree.
Doporučení: Align the two constants.

[SEVERITY: Low] [FILE: apps/api/src/channels/jira-issue-flow.service.ts:34] [CATEGORY: Reliability]
`pending` Jira requests live only in memory keyed by approval runId; a restart between propose and approve makes `resume` a silent no-op. Documented as fail-closed, but the operator sees an approvable item that can never execute. (Stejný vzor jako budgetApproved v scheduleru.)
Doporučení: Persist the pending request payload; at minimum surface the no-op back to the operator.

[SEVERITY: Low] [FILE: apps/api/src/channels/channel-triage-flow.service.ts:400] [CATEGORY: Duplication]
`ChannelTriageFlowService` and `JiraIssueFlowService` each re-implement the `ResumableRunner` resume/cancel/register boilerplate.
Doporučení: Optional — extract a `ResumableApprovalRunner` base/helper.

STATS: 12 souborů (source), 6 test skimnuto, ~1506 řádků. Top 3: channel-triage-flow.service.ts (513), channel-watcher.service.ts (207), channel-item.store.ts (155).

---
BATCH: api-chat

[SEVERITY: High] [FILE: apps/api/src/chat/chat-mcp.controller.ts:49] [CATEGORY: Bezpečnost/gate-bypass]
Endpoint POST /api/chat/mcp nemá žádnou autorizaci (v celém apps/api nejsou guardy) a přijímá JSON-RPC tools/call přímo — cokoli, co dosáhne na port, může spustit create_task nebo machine_rename/open_folder/open_maps bez modelu. Governor (answer/ask/act) žije jen v systémovém promptu, takže není vynucovací hranice, jen instrukce pro model; skutečné bezpečí drží až approval gate ve scheduleru/machine.propose.
Doporučení: MCP route zavázat k loopback + shared-secret tokenu (nebo guardu), aby tool-execution surface nebyl volně dostupný mimo model.

[SEVERITY: High] [FILE: apps/api/src/chat/chat-tools.service.ts:89] [CATEGORY: Bezpečnost/prompt-injection]
get_status vrací obsah briefingu (needsYou/watching summary), který pochází z inbound kanálů (Slack/email); recall_memory vrací obsah vaultu. Text se vrací modelu jako tool result bez delimitace „toto jsou data, ne příkazy" — obsah kanálu tak může steerovat model k create_task (Law 4). (Párový nález k channels prompt-injection surface.)
Doporučení: obalit tool-result obsah zřetelným untrusted-data ohraničením a v governor promptu explicitně zakázat plnit instrukce z paměti/statusu.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-session.service.ts:232] [CATEGORY: Správnost/race-condition]
Registry drží jen JEDNOHO subscribera na conversationId a nic nevynucuje jeden turn na konverzaci; sendMessage je fire-and-forget. Dva rychlé sendy → dva runTurny → druhá subscription přepíše první, create_task výsledky se mohou spárovat se špatným turnem a souběžný --resume nad stejným sessionId je nekonzistentní.
Doporučení: serializovat turny per-conversation (fronta/lock).

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-session.service.ts:270] [CATEGORY: Výkon/resource-leak]
Při timeoutu se volá jen proc.kill("SIGTERM") na přímém childu — bez process-group killu a bez eskalace na SIGKILL, které má hardenovaný runner-core. `claude` s potomky může přežít a hromadit se. Zároveň stdout buffer roste bez limitu, dokud nepřijde newline. (Stejný vzor jako runner-core cancel a triager/preflight buffery.)
Doporučení: převzít pgid + SIGTERM→grace→SIGKILL vzorec z runner-core a přidat strop na velikost bufferu.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-stream-parser.ts:29] [CATEGORY: Duplicita]
Parsování `claude --output-format stream-json` je implementováno znovu, ačkoli runner už má claude-stream-format.ts, a spawn+arg-building claude CLI existuje v ~10 dalších místech. Chat drží vlastní paralelní kopii spawn/parse/kill logiky. (Potvrzuje cross-cutting nález — spawn/parse duplikace napříč ~10 soubory.)
Doporučení: extrahovat sdílený claude-spawn+stream-parse util.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-transcript.store.ts:162] [CATEGORY: Výkon/transcript-růst]
readMessages/readTranscript načítá celý `<id>.jsonl` do paměti a split přes celý soubor při KAŽDÉM getTranscript; chat thread je dlouhoživotní a nemá rotaci ani strop — soubor roste neomezeně a každé otevření overlaye ho čte celý.
Doporučení: číst jen ocas / stránkovat transcript.

[SEVERITY: Medium] [FILE: apps/api/src/chat/chat-transcript.store.ts:59] [CATEGORY: Bezpečnost/citlivá-data]
Kompletní text zpráv operátora se ukládá verbatim do plaintext JSONL. Do chatu se prokazatelně dostávají tajemství (historický nález plaintext Gmail hesla v chat promptu) — transcript je trvalé plaintext úložiště citlivých dat bez maskování.
Doporučení: zdokumentovat/omezit citlivost transcriptu (maskování zjevných credentials, ověřit gitignore) a nelogovat obsah požadavků při chybě.

[SEVERITY: Low] [FILE: apps/api/src/chat/chat-mcp.controller.ts:13] [CATEGORY: Správnost]
Chybějící/malformovaný conversationId degraduje na `""` a registry se čte pod klíčem `""`; explicitTarget i create_task enrichment tiše přestanou fungovat místo tvrdé chyby.
Doporučení: při prázdném conversationId vrátit 400 nebo alespoň zalogovat warning.

[SEVERITY: Low] [FILE: apps/api/src/chat/chat-transcript.store.ts:150] [CATEGORY: Správnost]
readMeta castuje `parsed as ConversationMeta` bez schéma-validace (na rozdíl od readMessages). Poškozený meta sidecar může vrátit objekt s vadným sessionId a rozbít --resume bez varování.
Doporučení: validovat meta zod-schématem, fail-open na fresh meta.

[SEVERITY: Low] [FILE: apps/api/src/chat/chat-session.service.ts:317] [CATEGORY: Chybějící testy]
Bez pokrytí: souběžné turny/přepis subscribera, timeout-kill cesta, turn-end sweep leftover create_task výsledků, párování `""` callId.
Doporučení: přidat testy na timeout, dva souběžné turny a leftover-drain sweep.

STATS: 10 zdrojových souborů, 1321 řádků. Top 3: chat-session.service.ts (350), chat-mcp.controller.ts (203), chat-transcript.store.ts (190). Žádný soubor nad 600 řádků.

---
BATCH: api-gates-approvals

POZN. ORCHESTRÁTORA: nejcitlivější batch celého auditu (zákonná vrstva). Nálezy níže tvrdí, že approval-first floor lze za určitých okolností obejít nebo oslabit editací POLICY.md — to je přímý útok na Law 1/3/4. Doporučuji tyto nálezy verifikovat spot-checkem před nápravou (viz finální report Fáze 2).

[SEVERITY: Critical] [FILE: apps/api/src/gates/gate-evaluator.service.ts:156-223] [CATEGORY: Gate bypass / harden-only]
`validateHardenOnly`/`sameAction` compare only `action`-type match conditions, but runtime `rulesForAgent` puts agent rules before the floor with first-match-wins (`matchOnce`, l.121-128). An agent rule matching the same real operation via a `tool`/`scope`/`context`/`threshold` matcher (e.g. an `allow` on the gh/git tool that carries `pr.merge`) fires before the floor's action-based `deny` and passes harden-only validation because it contains no action condition — the locked floor is silently shadowed.
Doporučení: make harden-only match-agnostic (evaluate every floor action against each agent rule's full match set, or evaluate floor-first for locked `deny` rules) so no non-action matcher can shadow a floor decision.

[SEVERITY: High] [FILE: apps/api/src/gates/policy.storage.service.ts:42-53] [CATEGORY: Policy floor erasability / fail-open]
`DEFAULT_FLOOR` is used only when disk yields zero valid rules; a POLICY.md that keeps one valid rule but drops the `pr.merge` locked-`deny` (or the `ask` actions) returns that partial set as the whole floor — the canonical floor is not re-merged. The "structural, non-erasable floor" is therefore only a seed/empty-fallback, not an enforced minimum.
Doporučení: union the on-disk floor with DEFAULT_FLOOR (disk may only add/harden, never remove a locked rule).

[SEVERITY: High] [FILE: apps/api/src/approvals/approvals.service.ts:140-150] [CATEGORY: Race condition / TOCTOU]
`decide` reads status, checks `!== "pending"`, then writes — no atomic compare-and-set or lock. Concurrent approve+reject (or double-approve) both pass the pending check and both route to the runner, so a run can be resumed despite a concurrent reject, or `resume` called twice (double-spawn). (Stejný TOCTOU vzor jako scheduler outcome write.)
Doporučení: serialize decisions per approval id so exactly one decision ever routes to the runner.

[SEVERITY: High] [FILE: apps/api/src/gates/gate-evaluator.service.ts:127] [CATEGORY: Tier escalation / fail-open]
An unmatched action returns `{ decision: "allow" }` — the lowest tier. This contradicts the law "when unsure which tier applies, treat it as the higher one": any novel/unenumerated action that no floor or agent rule names is silently allowed rather than surfaced.
Doporučení: default unmatched mutating/unknown actions to `ask` (or a conservative catch-all in the floor).

[SEVERITY: Medium] [FILE: apps/api/src/gates/policy.storage.service.ts:78-108] [CATEGORY: HIGH_RISK completeness]
`deploy` is a Tier-3 outbound action but is NOT on the locked floor — it exists only in the deletable/editable `DEFAULT_CATALOG` (gate-rules.storage.service.ts:143-149). Removing that catalog rule leaves deploy ungated.
Doporučení: promote `deploy` (and audit for other Tier-3 verbs) into the locked ASK/deny floor.

[SEVERITY: Medium] [FILE: apps/api/src/mandate/mandate.storage.service.ts:1-51] [CATEGORY: Missing critical tests]
No test file for the mandate. The Law-4 invariant ("only the operator PUT writes; unknown/smuggled keys rejected with 422") and the fail-closed fallback to `DEFAULT_MANDATE` on malformed input are entirely untested for the autonomy-tier gate.
Doporučení: add tests asserting 422 on unknown keys, DEFAULT_MANDATE on corrupt file, and that read never returns inbound-writable state.

[SEVERITY: Medium] [FILE: apps/api/src/gates/policy.storage.service.ts:32-54] [CATEGORY: Missing critical tests]
`PolicyStorageService` has no dedicated test; the security-critical behaviors (forcing `source:"system"/locked:true`, dropping a single malformed rule, fallback) are only exercised indirectly. The partial-tamper case (High above) is uncovered.
Doporučení: add direct tests for provenance-forcing, tolerant parse, and floor enforcement under a partially-stripped POLICY.md.

[SEVERITY: Low] [FILE: apps/api/src/gates/gates.controller.ts:44-58] [CATEGORY: Nest best practices / boilerplate]
`replaceAgentGates` hand-rolls try/catch + `errors.isMissing`/`errors.notFound` instead of the `errors.or404` helper used by every other handler here.
Doporučení: fold the 404 path through `errors.or404`, keep only the 422 harden-only branch inline.

[SEVERITY: Low] [FILE: apps/api/src/gates/gate-evaluator.service.ts:85-89] [CATEGORY: Enforcement layering]
Runtime `evaluate`/`rulesForAgent` never re-checks harden-only; safety relies entirely on write-time validation in the controller. Any path writing `agent.gates` without going through `replaceAgentGates` (seed data, direct agents-store update) yields an unvalidated own-first ruleset the engine trusts.
Doporučení: apply a floor-precedence guarantee inside the evaluator (locked deny/floor rules win regardless of own-rule order).

STATS: 19 souborů (16 source + 3 test skimnuto), 1533 řádků. Top 3: gate-evaluator.service.test.ts (230), gate-evaluator.service.ts (224), gate-rules.storage.service.ts (165).

---
BATCH: api-goals

[SEVERITY: Critical] [FILE: apps/api/src/goals/goal-runner.service.ts:400] [CATEGORY: Loop correctness / race condition]
`stopRequested` is only consumed right after `waitForMaker` for the MAKER (line 400), before `runVerifier`. A `stop()` issued while the verifier phase executes sets the flag but nothing checks it until the next maker's `waitForMaker` returns — the loop dispatches and runs one entire extra maker iteration before honoring stop, and the in-flight verifier (a live claude-verifier agent run or shell process) is never killed. (Párový vzor k pipeline-runner stop nález.)
Doporučení: check `stopRequested` immediately after the verifier settles too, and track/kill the verifier's own run ref (agent or shell pgid) in `stop()`.

[SEVERITY: High] [FILE: apps/api/src/goals/goal-runner.service.ts:492-496] [CATEGORY: Budget enforcement]
`budgetOk()` catches any error from `budget.check(...)` and returns `{ ok: true }`, i.e. fails OPEN — but the doc comment above claims "fail-closed via BudgetService." Any transient BudgetService/IO exception silently lets the loop keep dispatching makers past the cap (proti zákonu "no auto-spend past budget").
Doporučení: default to `ok: false` on error (or a distinct "budget-check-failed" park reason).

[SEVERITY: High] [FILE: apps/api/src/goals/*.test.ts] [CATEGORY: Missing test coverage]
Existing tests cover only pure helpers. There is no test exercising `drive()`'s park transitions, `resumeParked`, `stop()`, or `reconstruct()`/`reconcileGoal` (boot re-dispatch gate + GOAL_AUTO_RESUME re-attach vs re-dispatch) — exactly the highest-risk areas.
Doporučení: add integration-style tests around drive()/reconstruct() covering park-budget, park-iterations, resume, and boot re-attach/re-dispatch.

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:1058-1063] [CATEGORY: Resume correctness / error handling]
`writeAggregate` swallows write failures with `.catch(() => {})`. If `run.json` write fails, in-memory and on-disk state silently diverge; a subsequent crash reconstructs from the stale file, corrupting resume (wrong currentIteration, missing makerRunRef).
Doporučení: log the write failure; consider retry or marking the run unhealthy.

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:440-445] [CATEGORY: Dead / misleading code]
`decideStop` is always called with `budgetOk: true`, so its `"park-budget"` branch is unreachable in production — real budget parks happen earlier via `parkGoal(..., "budget", ...)`. `goal-stop.test.ts` tests a path that never fires from `drive()`.
Doporučení: drop the unused `budgetOk` parameter, or wire the real budget check through it.

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:780-803,870-888,1002-1003] [CATEGORY: Duplicate cross-cutting logic]
The `kind === "agent" ? agentRunner… : pipelineRunner…` branch is repeated near-identically in `dispatchMaker`, `makerStatus`, `makerResumeAt`, and `stop()`.
Doporučení: extract a maker-runner adapter (`{ start, get, stop }` keyed by kind).

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:1079-1089] [CATEGORY: Performance / unbounded read]
`readAllAggregates()` scans and parses every `<id>/run.json` with no limit — used by `listAll()` (every call) and `reconstruct()` (boot). Finished run dirs are never pruned from disk except via explicit delete, so this scan only grows. (Systémový list()-then-find vzor.)
Doporučení: add a disk-level retention sweep or cap/paginate `readAllAggregates`.

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts:359,365] [CATEGORY: Observability]
Both the project-level budget cap and the goal's own windowed budget park with the identical reason `"budget"`, so the operator can't tell which cap tripped.
Doporučení: use distinct reasons (`"budget-project"` vs `"budget-goal"`).

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts:422-425,647-648,665-671] [CATEGORY: Sensitive data in logs]
Verifier output (up to 1MB shell output or agent log tail) is written verbatim to `iteration-N.verdict.txt`, the activity log, and back into the next maker's prompt via `composeResumeContext`, with no redaction. (Párový nález k pipeline-runner writeFailureContext.)
Doporučení: add a secret-scrubbing pass before persisting/forwarding verifier output.

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts (1202 lines)] [CATEGORY: File size / SRP]
1202-line service mixes outer-loop orchestration, verifier-shell process governance (spawn/kill/timeout), reconciliation, and persistence.
Doporučení: extract the `runShell`/`liveShells` process-governance block into a `VerifierShellRunner`.

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts:994-999] [CATEGORY: Edge case]
`stop()` throws `GoalRunNotStoppableError` in the narrow window after `currentIteration` is set but before `makerRunRef` is persisted, so an operator stop in that instant is rejected rather than queued.
Doporučení: honor `stopRequested` before the dispatch completes.

STATS: 12 souborů, 2014 řádků. Top 3: goal-runner.service.ts (1202), goals.storage.service.ts (129), goal-double-verify.test.ts (117).

---
BATCH: api-memory-aux

[SEVERITY: Medium] [FILE: apps/api/src/memory/run-recorder.service.ts:82-93] [CATEGORY: concurrency/race-condition]
`claim()` does an `await fileExists(marker)` check followed by a separate `await writeFileAtomic(marker, …)` — TOCTOU gap despite the name. If `recordAgent`/`recordPipeline` fire twice for the same run close together (a live status event racing the bootstrap sweep), both calls can pass the existence check before either writes, producing a duplicate daily-note line. (Párový vzor k race conditions v scheduleru/pipeline-runneru.)
Doporučení: claim exclusively via `writeFile(marker, …, { flag: "wx" })` and treat `EEXIST` as "already claimed".

[SEVERITY: Medium] [FILE: apps/api/src/memory/memory.controller.ts:39-106] [CATEGORY: input validation / security]
Path param `id` (getNote/updateNote/appendToNote/updateIndex) is passed straight to `VaultService` with zero controller-level validation; the only defense against path traversal is whatever `VaultService` does internally via `InvalidNoteIdError` (auditováno v api-memory-core).
Doporučení: confirm `VaultService` normalizes/rejects traversal segments; if not centralized there, add explicit validation at the controller/DTO boundary.

[SEVERITY: Medium] [FILE: apps/api/src/memory/entity-mcp.controller.ts:169-187] [CATEGORY: MCP tool exposure / authorization]
`list_entities` exposes 10 full catalogs (including companies, integrations, goals) with no per-run or per-project scoping inside the tool — any run granted the `zibby-entities` MCP server can enumerate the entire global catalog.
Doporučení: if multi-company isolation is ever a goal, add a scoping filter by caller's project/company; otherwise document as accepted single-operator-scope tradeoff.

[SEVERITY: Medium] [FILE: apps/api/src/memory/memory.controller.test.ts:26] [CATEGORY: missing tests]
Test file only covers `POST /api/memory/import`. `getNote`/`createNote`/`updateNote`/`appendToNote`/`updateIndex`/`search`/`getIndex`/`getGraph`/`appendDaily` have no controller-level tests, so the ts-rest 404/409/422 mapping for those handlers is unverified.
Doporučení: add controller tests asserting the status mappings, mirroring the import pattern.

[SEVERITY: Low] [FILE: apps/api/src/memory/memory.controller.ts:62-106] [CATEGORY: duplication]
The try/catch error-mapping block (NoteNotFoundError→404, InvalidNoteIdError→422, DuplicateNoteError/SimilarNoteError→409) is repeated near-verbatim across four handlers.
Doporučení: extract a shared `mapVaultError(error)` helper (or ts-rest exception filter).

[SEVERITY: Low] [FILE: apps/api/src/memory/entity-mcp.controller.ts:213-222] [CATEGORY: error handling]
`listEntities` catches any error from `rawList` indiscriminately and returns `[]`, logging only a warn — fail-open swallows genuine bugs as an empty catalog.
Doporučení: narrow the catch to expected storage errors, or surface a distinguishable "unavailable" marker.

[SEVERITY: Low] [FILE: apps/api/src/memory/run-recorder.service.ts:124-139] [CATEGORY: duplication / performance]
`resolveProjectRef` and `resolveProjectByPath` both do an ad-hoc `projects.list().catch(() => [])` + linear `.find()` scan instead of sharing one lookup helper.
Doporučení: factor a single `findProjectByRefOrPath` helper.

[SEVERITY: Low] [FILE: apps/api/src/memory/memory.controller.ts:143-150] [CATEGORY: NestJS best practices]
`fireDistillNow` resolves `MemoryDistillerService` via `ModuleRef.get(..., {strict:false})` at call time (DI-cycle escape hatch) rather than constructor injection.
Doporučení: no change now; if more lazy resolutions appear, extract a `LazyResolver` provider.

[SEVERITY: Low] [FILE: apps/api/src/memory/recall.helper.ts:14-15] [CATEGORY: input validation / performance]
`recallMemory` (used by both chat MCP and entity MCP) passes `query` straight to `vault.search(query)` with no length/emptiness guard.
Doporučení: add a minimal guard (trim + max length + empty short-circuit) at this shared boundary.

STATS: 6 files, 660 lines. Top 3: entity-mcp.controller.ts (248), memory.controller.ts (151), run-recorder.service.ts (140).

---
BATCH: api-memory-core

[SEVERITY: High] [FILE: apps/api/src/memory/claude-cli-distiller.ts:145-190] [CATEGORY: Injection / untrusted input]
Run excerpts, chat text, and imported note bodies (all originate from external channels, agent output, or operator-supplied files) are embedded verbatim into the `claude -p` prompt with only a system-prompt instruction as guard; a crafted excerpt can attempt to override the distiller's instructions, and the resulting "learning"/triage verdict is written into the vault, later re-injected into every future run's system prompt via grounding.service.ts. Directly touches Law 4. (Klíčový cross-cutting nález — inbound → memory → grounding → future run prompt.)
Doporučení: wrap excerpts in an explicit untrusted-data delimiter the system prompt tells the model never to treat as instructions; consider flagging distilled notes as lower-trust until reviewed.

[SEVERITY: Medium] [FILE: apps/api/src/memory/vault.service.ts:333-357,401-426] [CATEGORY: Concurrency / race condition]
`createNote`, `updateNote`, and `appendToNote` do a read-modify-write (scan → read → mutate → writeFileAtomic) with no serialization, unlike `updateIndex` which already uses `withPathLock` for exactly this reason (documented Phase 8.2). Concurrent calls on the same note id (nightly triage racing an API update) can silently lose one write; `createNote`'s duplicate check is TOCTOU-racy. (Stejný lost-update vzor jako scheduler/pipeline-runner/run-recorder.)
Doporučení: key `createNote`/`updateNote`/`appendToNote` through `withPathLock(id)` like `updateIndex`.

[SEVERITY: Medium] [FILE: apps/api/src/memory/memory-import.service.ts:246-256] [CATEGORY: Performance]
`ingestQueue` calls `createNote` once per queued file; `createNote` resets `VaultService`'s scan cache on every write, so ingesting N files against a vault of M notes triggers ~N full vault re-walks (O(N·M) file reads).
Doporučení: scan once before the ingest loop and batch cache invalidation.

[SEVERITY: Medium] [FILE: apps/api/src/memory/claude-cli-distiller.ts] [CATEGORY: Missing tests]
No dedicated test file exists; the only reference fully mocks `ClaudeCliDistiller`, so `runClaude`, `parse`/`extractResultText`, the timeout path, and both Zod schema-reject paths have zero coverage.
Doporučení: add a distiller-focused suite stubbing `spawn`/`runClaude`.

[SEVERITY: Low] [FILE: apps/api/src/memory/claude-cli-distiller.ts:192-251] [CATEGORY: Duplicate logic]
`runClaude`/`parse`/`extractResultText` are near-verbatim copies of `briefing/claude-cli-briefer.ts`'s same-named methods — comments say "copies X's shape EXACTLY", reference a third `ClaudeCliTriager`. (Potvrzuje cross-cutting spawn/parse duplikaci.)
Doporučení: extract a shared `runClaudeJson()` helper reused by briefer/distiller/triager.

[SEVERITY: Low] [FILE: apps/api/src/memory/vault.service.ts] [CATEGORY: Maintainability]
Largest in batch (534 lines) — scan/index/graph, full-text search, dedupe/similarity heuristics, note CRUD, and MOC-linking in one class. Under 600 but worth watching.
Doporučení: if it grows, extract the dedupe heuristic (jaccard/tokenize/findSimilar).

[SEVERITY: Low] [FILE: apps/api/src/memory/memory-import.service.ts:166-177] [CATEGORY: Access control]
`stageFrom(sourcePath)` only validates existence/directory/readability — no allow-listed root — so a caller can point the importer at any host directory readable by the process and have `.md`/`.txt` contents copied into the vault and surfaced in grounding.
Doporučení: confirm this endpoint is gated to operator-only Tier; otherwise scope `sourcePath` to an allow-listed root.

[SEVERITY: Low] [FILE: apps/api/src/memory/memory-distiller.service.ts:247-261] [CATEGORY: Performance]
`summarizeAgent` calls `agents.readLog(run.runId, 0)` (read from start) only to keep `.slice(-EXCERPT_LIMIT)` (last 1200 chars) — a full-log read for a tail-only need. (Stejný tail-read anti-vzor jako pipeline-runner tailLog.)
Doporučení: use a tail-read mode on `readLog`.

STATS: 6 files, 1752 lines. Top 3: vault.service.ts (534), memory-distiller.service.ts (507), memory-import.service.ts (310).

---
BATCH: api-pipelines-rest

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipelines.storage.service.ts:139] [CATEGORY: Performance/sync-fs]
`fromFrontmatter` calls `avatarAssets.inlineSync()` (`readFileSync`) on every parsed entity, so `list()`/`get()` block the Node event loop with synchronous disk reads once per pipeline that carries an avatar.
Make the avatar-inline step async and thread it through `EntityFileStore.list()`/`get()`, or document and cap it.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipelines.controller.ts, pipeline-runs.controller.ts] [CATEGORY: Test coverage]
No dedicated test exercises the HTTP layer for `getPipeline`, `listPipelines`, `deletePipeline`, `listPipelineRuns`, and only one PATCH case is covered; e2e exercises almost exclusively `POST /api/pipelines`, leaving the ts-rest 404/409/422 status mapping unverified end-to-end.
Add e2e cases for GET (found/404), DELETE, list, and the 422/409 paths.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.errors.ts:26-31, pipelines.controller.ts:13-16] [CATEGORY: Error handling]
`CorruptPipelineFileError` (thrown by storage get/fromFrontmatter) is not in `makeErrorMapper`'s `missing` list, so a corrupt on-disk pipeline file surfaces as an unhandled generic 500.
Decide/document the mapping (500 typed, or 404) and add a test.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/verify-command.ts:23-28] [CATEGORY: Security/shell-injection]
`buildVerifyCommand` joins `commands`/`projectChecks` with `&&` and runs through `/bin/sh -c`, giving full shell interpretation; safety depends entirely on callers only ever passing operator-authored config (true today) but it's an implicit, undocumented trust boundary in this file.
Add a doc comment/runtime assertion that these strings must never contain untrusted content.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.storage.service.ts:194-205] [CATEGORY: Performance]
`sweepInlineAvatars()` migrates files serially in a `for...of` with `await` per file, unlike `EntityFileStore.list()` which parallelizes — scales linearly at every boot.
Parallelize with `Promise.allSettled`.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.module.ts:42-44] [CATEGORY: NestJS route ordering]
Correct routing of `/pipelines/runs` vs `/pipelines/:id` depends on `PipelineRunsController` being registered before `PipelinesController`; a comment documents it, but nothing enforces or tests it.
Add a routing e2e assertion that `GET /api/pipelines/runs` resolves to the runs handler.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipelines.storage.service.ts:72-84] [CATEGORY: Validation (positive finding)]
Potvrzeno: `update()` re-validates the merged patch via full `PipelineSchema.safeParse` (not the partial `UpdatePipelineSchema`), correctly closing the contract-layer gap (viz contracts-c nález). Bez akce — jen doplnit cross-reference komentář u `UpdatePipelineSchema`.

STATS: files=7, total_lines=474, top3=[pipelines.storage.service.ts (218), pipelines.module.ts (54), pipelines.controller.ts (52)]

---
BATCH: api-pipelines-runner

[SEVERITY: High] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:427] [CATEGORY: state-machine / race]
resumeParked, resumeLimitPaused and resumeOutput each read the run, check its status, then `await` (pipelines.get / readAggregate) before flipping status to "running" — a TOCTOU window where two concurrent resume calls (or a resume racing an in-flight driver / the limit-resume tick) both pass the guard and spawn two concurrent `drive()` loops mutating the same `run` object and `stageRuns` array. No per-run lock or in-flight guard. (Párový vzor k race conditions v task-scheduler.)
Doporučení: Add a per-run "driving" mutex/flag set synchronously before the first await, reject re-entry while set.

[SEVERITY: High] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1-1955] [CATEGORY: file-size / maintainability]
The service is 1955 lines and mixes start/drive state machine, limit pause/resume, output delivery, PR handling, stage-command building, artifact reading, gate evaluation, and persistence/reconstruct.
Doporučení: Extract PipelineOutputDelivery, PipelineLimitController, PipelineStageCommandBuilder, and a persistence module.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:266] [CATEGORY: state-machine / id-collision]
`pipelineRunId = ${pipelineId}_${startedMs}` derives uniqueness solely from Date.now(); two runs of the same pipeline dispatched in the same millisecond collide on runId and run root, `mkdir(recursive)` silently shares the directory, clobbering run.json.
Doporučení: Append a short random suffix (randomUUID slice) to the run id.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:667] [CATEGORY: missing-tests]
The operator-stop path (`stop()` → `stopRequested` → interrupted landing) has no test. A stop racing the stage's terminal transition, or firing when currentStageRunId is momentarily cleared, is unverified.
Doporučení: Add tests: stop mid-stage lands "interrupted" and suppresses retry/park; stop on non-running run throws.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:520] [CATEGORY: missing-tests]
The entire Phase-9 usage-limit machine (boundary pause, mid-stage pause, resumeLimitPaused, parkLimitFlapped, listLimitPaused) is exercised only through a `windowExhausted → false` mock; none of the pause/auto-resume/flap-park transitions are asserted.
Doporučení: Add tests driving windowExhausted=true for boundary and mid-stage pause, a resume re-drive, and a LIMIT_RESUME_MAX flap → park.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1719] [CATEGORY: sensitive-data / logs]
writeFailureContext dumps the failing stage's whole log tail into `<phase>.failure.txt` and threads it (via composeResumeContext) into the next agent's prompt. A verify/shell stage that echoes a project secret (injected as env at resolveProjectEnv:1508) persists and re-emits that secret. (Párový nález k runner-aux stream-format a scheduler summary.)
Doporučení: Redact known secret values (from projectSecrets) out of failure/resume context before writing/threading.

[SEVERITY: Medium] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:628] [CATEGORY: performance]
listAll() does a full readdir + readFile + parse + safeParse of every run directory on every call, no cap/cache — O(all historical runs) per request. (Stejný vzor jako task-runs collect().)
Doporučení: Cap/paginate the scan or index metadata; cache with invalidation on writeAggregate.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1459] [CATEGORY: performance]
tailLog and writeFailureContext both `readLog(runId, 0)` to load the entire stage log only to keep the last ~2000 chars.
Doporučení: Add an offset/tail-read path in the core (seek from EOF).

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1588] [CATEGORY: performance]
waitForStage busy-polls `core.get(runId).status` every 25ms for the full lifetime of a stage (minutes for a claude run).
Doporučení: Have the core expose a terminal-state event/promise and await it.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/verify-command.ts:26] [CATEGORY: shell-exec]
Verify commands joined with `&&` under `/bin/sh -c`. Trusted-by-design (operator config), but any future path populating project.checks from untrusted data becomes command injection. (Duplicitní nález s api-pipelines-rest.)
Doporučení: Document the trust boundary; ensure project.checks is never derived from inbound channel data.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:791] [CATEGORY: state-machine / edge]
readArtifact guesses the in-flight stage folder as `stageDirName(stageRuns.length + 1, currentStage)`, but synthetic escalation markers occupy stageRuns slots and leave numbering gaps, so the guess can miss the actual folder.
Doporučení: Track the live stage's actual dir on the run alongside currentStageRunId.

[SEVERITY: Low] [FILE: apps/api/src/pipelines/pipeline-runner.service.ts:1221] [CATEGORY: duplication]
"First non-empty line" reimplemented in parsePrMarkdown and checkpointPhase; whole-log reads in tailLog/writeFailureContext/openPrOutput; phase-search-by-`produces` in recomputeHandoff and resolveOutputSource.
Doporučení: Extract shared helpers (firstNonEmptyLine, findPhaseByProduces).

STATS: 6 souborů, ~2136 source řádků. Top 3: pipeline-runner.service.ts (1955), pipeline-stage.record.ts (46), build-stage-task.ts (35). Runner service je jediný nad 600 řádků.

---
BATCH: api-projects

[SEVERITY: Critical] [FILE: apps/api/src/shared/logging/logging.interceptor.ts:53-63 (entry point: apps/api/src/projects/projects.controller.ts:119 setProjectSecrets)] [CATEGORY: Security — secrets leak into logs]
`isNoisyBodyRoute` only skips `/logs` URLs; `PUT /api/projects/:id/secrets` is not excluded, so the global `LoggingInterceptor` logs the raw request body (`{ DB_URL: "postgres://...", API_KEY: "..." }`) at `info` level, unredacted (truncated to 1000 chars only). This directly contradicts `ProjectSecretsStore`'s own doc comment claiming secrets are "NEVER logged." (KŘÍŽOVÝ nález — interceptor je v api-shared-root batchi; ověřit tam i jiné secret-bearing routes: integrations credentials, project env.)
Add a route/field-based redaction rule (or a `skipBody` allowlist entry for `/secrets`) in the logging interceptor.

[SEVERITY: Medium] [FILE: libs/contracts/src/projects/project.schema.ts:155] [CATEGORY: Security — data model asymmetry]
`env` is an open `z.record(z.string(), z.string())` with no secret-shaped-key guard, unlike integration configs which use closed `.strict()` schemas. `env` values ARE returned verbatim in every GET/list response, so an operator mistakenly putting a real credential there (instead of `/secrets`) leaks it in plaintext on every `listProjects` call. (Potvrzuje contracts-c nález o project.env.)
Add a denylist/refinement on `env` keys (reject `TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL`) or document the risk in the UI.

[SEVERITY: Medium] [FILE: apps/api/src/projects/projects.controller.ts:90-98] [CATEGORY: Performance — N+1]
`listProjects`/`searchProjects` call `withSecretState` per project, each doing an independent `fs.access` via `ProjectSecretsStore.has()` — N filesystem syscalls per list call.
Batch: list the secrets directory once and check membership in a `Set`.

[SEVERITY: Medium] [FILE: apps/api/src/projects/projects.controller.ts:72-78, resolved-project.service.ts:64-83] [CATEGORY: Duplicate logic / Performance]
`resolveContext` runs `resolve()` and `resolveCompanyRef()` in parallel; both independently call `findCompany`/`companies.get()`, so a single `GET /projects/:id/resolved` does two redundant full company-store reads.
Have `resolve()` optionally return the resolved company so `resolveContext` fetches it once.

[SEVERITY: Low] [FILE: apps/api/src/projects/project-vault.service.ts:22-38] [CATEGORY: Error handling]
`write`/`remove` swallow every error with an empty `catch {}` and zero logging — any real bug (permissions, disk full, template failure) in the vault mirror is invisible.
Log the swallowed error at debug/warn before discarding.

[SEVERITY: Low] [FILE: apps/api/src/projects/standup.service.ts:71] [CATEGORY: Error handling]
`activity.readSince(...).catch(() => [])` silently turns any activity-log failure into an empty result — a broken activity source renders a misleading "nothing happened" standup.
Log the caught error before falling back to `[]`.

[SEVERITY: Low] [FILE: apps/api/src/projects/projects.storage.service.ts:75-79] [CATEGORY: Performance]
`get(id)` reads, parses, schema-validates and backfills the ENTIRE manifest just to find one record; every controller action funnels through this, compounding with the same list()-then-find pattern in CompaniesStorageService.
Acceptable at current scale; consider an in-memory indexed cache if the registry grows.

[SEVERITY: Low] [FILE: apps/api/src/projects (missing controller test)] [CATEGORY: Test coverage]
No controller-level unit test inside this directory for `ProjectsController`; coverage lives in `apps/api/test/projects.e2e.test.ts` (outside dir, but covers it well — verified: hasSecrets flip, secret never in response body, secret only under PROJECT_SECRETS_DIR, cascade delete).
Optionally add a co-located controller spec.

[SEVERITY: Low] [FILE: libs/contracts/src/projects/project.schema.ts:144-147] [CATEGORY: Attack surface / info]
`checks: string[]` (shell commands, `&&`-joined downstream) accepted with only non-empty constraint — no injection-shaped validation. Operator-only write path, not exploitable from here.
Confirm the consuming pipeline-verify code treats `checks` as trusted operator input only, never inbound-channel-derived.

STATS: 24 files, 2992 lines. Top 3: projects.storage.service.test.ts (280), projects.storage.service.ts (249), project-local.service.test.ts (215).
Pozitivum (e2e ověřeno): secret nikdy v response body, jen pod PROJECT_SECRETS_DIR, cascade delete funguje. Jediný leak je logging interceptor výše.

---
BATCH: api-runner-aux

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-stream-format.ts:90] [CATEGORY: Neomezené buffery]
`renderAssistantBlock`'s `text` case vrací `block.text` bez truncate (na rozdíl od `thinking`/`tool_result` capnutých na ~200/2000 znaků), takže dlouhá odpověď modelu zapíše do run-logu neomezené množství dat na jeden řádek.
Aplikovat `truncate()` i na text blok.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-stream-format.ts:106] [CATEGORY: Neomezené buffery]
`renderToolUse` vkládá `input.command` pro Bash bez truncate — dlouhý příkaz proteče do logu bez limitu, nekonzistentně s ostatními input cestami (`MAX_INPUT_CHARS`).
Truncate i Bash command.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-stream-format.ts:107] [CATEGORY: Citlivá data v logách]
Bash příkazy i `tool_result` obsah se zapisují do trvalého run-logu doslovně; pokud agent spustí příkaz nebo přečte soubor obsahující secret (API klíč, token, .env), skončí v plaintextu v logu. (Párový nález k task-scheduler:1298 a runner-core MCP argv.)
Zvážit heuristické maskování secret patternů před zápisem, nebo zdokumentovat riziko.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-preflight.service.ts:98] [CATEGORY: Duplicitní logika]
`capture()` reimplementuje spawn+timeout+kill+stdout-buffer vzor, který se téměř identicky opakuje v ~7 souborech (briefing/claude-cli-briefer, channels/triage/claude-cli-triager, chat/chat-session.service, memory/claude-cli-distiller, tasks/claude-cli-router, tasks/claude-cli-task-namer, goals/goal-runner.service) bez sdílené utility. (POTVRZUJE cross-cutting nález z api-tasks-routing.)
Vytáhnout sdílený `spawnCapture()`/`spawnWithTimeout()` helper do `shared/`.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-preflight.service.ts:126] [CATEGORY: Výkon / spawn handling]
V `capture()` je `stderr` nastaven na `"pipe"`, ale nikdy se nečte — pokud CLI zapíše víc než OS pipe buffer na stderr, proces se zablokuje na writu až do 5s timeoutu.
Buď stderr drainovat, nebo přepnout jeho stdio na `"ignore"`.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-tools.ts:29] [CATEGORY: Tool allow-list díra]
`mapToken` normalizuje jen známé interní tokeny; neznámý token (typo `"READ"` místo `"Read"`) projde beze změny a tiše vytvoří nefunkční/mismatchující allow-rule místo chyby.
Validovat/logovat neznámé tokeny.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-tools.ts:33] [CATEGORY: Tool allow-list díra]
Neznámé tokeny procházejí do `--allowedTools` bez validace tvaru pravidla — cokoli v agentově `tools` frontmatteru se stane doslovným allow-rule pod `dontAsk`, včetně příliš širokých `Bash(...)`.
Přidat allow-list přípustných tvarů pravidel jako defense-in-depth.

[SEVERITY: Low] [FILE: apps/api/src/runner/command-materializer.service.ts:50] [CATEGORY: Error handling]
`materialize()` má prázdný `catch {}` kolem celého těla — fail-open je záměrný pro I/O chyby, ale tichnou i neočekávané bugy bez logu.
Přidat `log?.debug`/`warn` do catch bloku.

[SEVERITY: Low] [FILE: apps/api/src/runner/detect-limit.test.ts:1] [CATEGORY: Chybějící testy]
Testy pokrývají patterny izolovaně, ne prioritu mezi nimi (text s "usage limit reached | epoch" i bare "429" — má vyhrát specifičtější s `resetsAt`).
Přidat test na souběh více patternů.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-preflight.service.ts:113] [CATEGORY: Chybějící testy]
Chybí test na synchronní throw ze `spawn()` — pokrytý je jen `child.on("error")` ENOENT case.
Přidat test se synchronní chybou ze spawnMock.

STATS: files=6, total_lines=573, top3=[claude-stream-format.ts (166), claude-preflight.service.ts (139), command-materializer.service.ts (105)]

---
BATCH: api-runner-core

[SEVERITY: High] [FILE: apps/api/src/runner/runner-core.ts:551] [CATEGORY: Zombie procesy / kill process group]
`cancel()` na běžícím runu volá `handle.child.kill()` — pošle SIGTERM jen vedoucímu skupiny, NE celé detached procesní skupině. Protože child běží `detached:true`, jeho potomci (nástroje spuštěné claude, např. `npm test`, `git`) zůstanou po zabití leadera osiřelí a běží dál. Ostatní teardown cesty (`shutdown`, `delete`, `denyIntent`, Variant-B reject) správně používají `killGroup(pgid)` — jen primární uživatelské „stop" ne.
Doporučení: v cancel běžící větvi nahradit `handle.child.kill()` za `killGroup(handle.run.pgid ?? handle.run.pid)`.

[SEVERITY: High] [FILE: apps/api/src/runner/claude-run-command.service.ts:151] [CATEGORY: Bezpečnost / approval gate coverage]
`OPERATING_CONTRACT` i `EXECUTION_DIRECTIVE` instruují agenta „nikdy se neptej, jen to spusť — gate to zachytí", a kontrakt slibuje „covers delete, overwrite, move, and any other external effect". Hook (`isDestructive`/`classify`) ale gatuje jen rm-family, `find -delete`, `git clean`, push/PR/gh-api — NErozpozná overwrite/move: `mv`, `> file` (truncate/redirect), `cp` přepis, `dd`, `truncate`, `sed -i`, `tee`, `install`. Slibovaná bezpečnostní záruka není vynucená.
Doporučení: rozšířit denylist o move/overwrite idiomy, nebo sladit text kontraktu s reálným pokrytím.

[SEVERITY: High] [FILE: apps/api/src/runner/runner-core.ts:1176] [CATEGORY: Výkon / neomezený buffer]
`readLastProgress` čte CELÝ log do paměti přes `fs.readFile(logFile,"utf8")` kvůli poslednímu `PROGRESS` řádku — přesně ten neohraničený alloc, proti kterému `MAX_LOG_READ_BYTES` chrání. Volá se při restart-reconcile (`init`) a při smrti orphana (`monitorPgid`); několikasetMB log = OOM.
Doporučení: číst jen tail souboru (posledních ~64 KiB) a hledat PROGRESS v něm.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-approval-hook.mjs:67] [CATEGORY: Bezpečnost / denylist bypass]
`RM_FAMILY` vyžaduje před `rm` hranici `[\s;&|(\`]`, takže path-kvalifikovaný binár projde: `/bin/rm foo` se NErozpozná jako destruktivní. Podobně `command rm`, `\rm`, `busybox rm` nejsou pokryty.
Doporučení: přidat `/`-boundary do třídy znaků nebo tokenizovat a porovnávat basename.

[SEVERITY: Medium] [FILE: apps/api/src/runner/claude-run-command.service.ts:466] [CATEGORY: Bezpečnost / citlivá data v argv]
`buildMcpConfig` vkládá tajemství (creds.env, `Authorization: Bearer <authToken>`, secret headers) do `--mcp-config` JSON předávaného jako inline argv řetězec. Argv je čitelné pro každého lokálního uživatele přes `ps`/`/proc/<pid>/cmdline` — tokeny leakují.
Doporučení: předávat MCP config souborem (jako u `--append-system-prompt-file`), ne inline argv.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:1092] [CATEGORY: Race condition / gate protokol]
Gate koordinace je jeden `intent-request.json` + jeden `intent-decision.json` na sandbox, klíčováno jen podle `cwd`. Dva souběžné gated tool-cally v jednom runu: druhý request přepíše první dřív, než ho 200ms poll přečte (ztracený request → hook blokuje do 24h deadline → fail-closed), a jedno decision může uvolnit nesprávný/oba hooky. Bez bypassu, ale nedeterministické.
Doporučení: korelovat request/decision přes unikátní id.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:943] [CATEGORY: Výkon / neomezený buffer]
`residual` akumuluje částečné řádky mezi chunky bez horní hranice — jednořádkový obří výstup (velký JSON event, binární data bez newline) roste neomezeně v RAM.
Doporučení: cap na délku residual, analogicky k `MAX_LOG_READ_BYTES`.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:246] [CATEGORY: Duplicitní logika]
Blok „readdir → filtr .json → readFile → parse → schema.safeParse" duplikovaný v `init()` a `listAll()`; trojnásobný vzor reconcile-to-interrupted + writeSidecar + warn v `init()`.
Doporučení: extrahovat `loadSidecars()` helper a sdílenou reconcile funkci.

[SEVERITY: Medium] [FILE: apps/api/src/runner/runner-core.ts:399] [CATEGORY: Duplicitní logika]
`start()` a `resume()` (respawn větev) duplikují celý spawn boilerplate: identické `spawn(...)`, createWriteStream, pid/pgid, `wire`, writeSidecar, emitStatus.
Doporučení: extrahovat privátní `spawnInto(handle, spec)`.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.ts:1013] [CATEGORY: Správnost]
`onChunk` je připojen na stdout I stderr — PROGRESS/INTENT/result-cost se parsují i ze stderr; řádek `INTENT {…}` na stderr spustí gate flow, `result` event dvojité započtení ceny.
Doporučení: parsovat control eventy jen ze stdout.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.ts:341] [CATEGORY: Cleanup při shutdownu]
`reapOnShutdown` odejde brzy při `!handle.child` — orphan znovupřipojený přes `monitorPgid` NENÍ při shutdownu zabit, přestože doc říká „kill any still-live children".
Doporučení: zdokumentovat záměr, nebo orphan-pgid také killGroupnout.

[SEVERITY: Low] [FILE: apps/api/src/runner/claude-run-command.service.ts:471] [CATEGORY: Bezpečnost / nesanitizované cesty]
`grantDirs` jdou do `--add-dir` verbatim bez kontroly (absolutní/existující). Sanitizace je odpovědnost callera — v tomto souboru žádná pojistka (defense-in-depth gap, párový nález k task-scheduler:919).
Doporučení: defensivní kontrola zde, nebo zdokumentovat invariant callera.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.test.ts:551] [CATEGORY: Díra v test pokrytí]
Bez testu: (1) cancel() zabije celou skupinu (test by dnešní chybu odhalil), (2) readLastProgress na velkém logu, (3) gate gap na mv/>/bin-rm, (4) souběžné gate requesty, (5) reapOnShutdown když child skončil.
Doporučení: doplnit; cancel-kills-group a overwrite/move gate jsou bezpečnostně nosné.

[SEVERITY: Low] [FILE: apps/api/src/runner/runner-core.ts:144] [CATEGORY: Velikost souboru]
`runner-core.ts` má 1244 řádků — míchá persistenci, gate koordinaci, lifecycle spawn/wire a limit-pause logiku.
Doporučení: rozdělit na runner-persistence / runner-intent-gate / runner-limit-pause / process-utils, jádro jako orchestrátor.

STATS: 6 souborů, ~4041 řádků vč. testů. Top 3: runner-core.ts (1244), runner-core.test.ts (1098), claude-run-command.service.ts (615).

---
BATCH: api-tasks-routing

[SEVERITY: High] [FILE: apps/api/src/tasks/attachment-storage.service.ts:22-34] [CATEGORY: Security - MIME spoofing]
`save()` stores the client-supplied `mimetype` verbatim with no allow-list or content sniffing, and `tasks.controller.ts:134-138` serves it back as the `Content-Type` with `disposition: inline`. An uploaded file whose declared type is `text/html` or `image/svg+xml` is rendered inline in the app's origin — a stored-XSS vector once attachments can originate from anything other than the operator's own hand (the automation attachment-ref provider suggests they can).
Whitelist a small set of safe inline media types (or force `attachment` disposition / re-derive type from file signature) before serving.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/attachment-storage.service.ts:27-31] [CATEGORY: Data integrity]
Two files uploaded in the same batch with an identical `originalname` silently overwrite each other on disk, but both entries are still recorded in metadata — the UI can show two attachments where only one physical file exists. (Známý deferred bod "dup-basename" z project_task_attachments_delivered — stále nevyřešen.)
De-duplicate/disambiguate basenames within a batch before writing.

[SEVERITY: High] [FILE: apps/api/src/tasks/claude-cli-router.ts:124-156] [CATEGORY: Duplicate logic]
`runClaude`, `extractResultText` and the fenced-JSON parser are duplicated almost verbatim in `claude-cli-task-namer.ts:67-126` and a third time in `apps/api/src/briefing/claude-cli-briefer.ts` (spawn args, 8s timeout pattern, stdout/stderr accumulation, envelope unwrap). Three independent copies will drift.
Extract a shared `runClaudeCli(prompt, opts)` helper and have all three callers use it.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/claude-cli-router.ts:126-130] [CATEGORY: Security - sensitive data exposure]
The full task text (up to 4000 chars, verbatim operator input) is passed as a `spawn` argv element (`["-p", prompt, ...]`), visible to any local process listing (`ps aux`) for the process lifetime. Same pattern in `claude-cli-task-namer.ts:69-73`. Project memory records an incident of a plaintext password in a chat prompt, so task text is not guaranteed innocuous.
Pass the prompt via stdin instead of argv.

[SEVERITY: Low] [FILE: apps/api/src/tasks/claude-cli-router.ts:140-145] [CATEGORY: Performance - unbounded buffer]
`stdout`/`stderr` accumulate with no size cap while the child runs (also `claude-cli-task-namer.ts:83-88`), unlike the project's capped-read pattern (1MiB readLog cap).
Cap accumulated size and kill the child if exceeded.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/claude-cli-router.ts] [CATEGORY: Missing tests]
No `.test.ts` exists for `ClaudeCliRouter`. `parseVerdict`, `extractResultText`, `parseJsonObject` and the catalog id-coherence check parse untrusted subprocess output into a routing decision with zero direct unit coverage.
Add unit tests covering malformed/fenced/partial JSON, unknown target id, and the timeout path.

[SEVERITY: Low] [FILE: apps/api/src/tasks/tasks-attachments.test.ts] [CATEGORY: Missing tests]
The attachment suite covers path traversal and default content-type fallback but never exercises a supplied `mimetype` (e.g. `text/html`) being served back verbatim — exactly the gap behind the MIME-spoofing finding.
Add a regression test once the content-type allow-list lands.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-classifier.service.ts:257-260] [CATEGORY: Error handling]
`buildCandidates` (and `classifyWithinSubsystem` at line 93) swallow `agents.listActive()`/`pipelines.list()` failures into `[]` with no log line — a storage outage is indistinguishable from "nothing configured yet".
Log at warn/error before falling back to `[]`.

[SEVERITY: Low] [FILE: apps/api/src/tasks/tasks.controller.ts:107-112] [CATEGORY: NestJS best practice - logic placement]
The total-set-size check (`MAX_SET_BYTES`) is inline business validation in the controller rather than in `AttachmentStorageService`.
Move the total-size check into `AttachmentStorageService.save()`.

[SEVERITY: Low] [FILE: apps/api/src/tasks/tasks.controller.ts:101-139] [CATEGORY: Response shape consistency]
The multipart upload and attachment-serve routes are plain `@Post`/`@Get` handlers outside ts-rest (necessarily), so their error shapes don't match the contract envelope.
Document the protocol exception, or map exceptions through the same `makeErrorMapper` shape.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-output.service.ts:194-200] [CATEGORY: Duplicate logic]
The "PR otevřen: …" / "PR push selhal (soft) …" note strings and `pr` result shape are built twice — in `openPrNow` and again in `resolve` — with slightly different call shapes.
Extract a shared `formatPrOutcome(result)` helper.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-output.service.ts:109-118] [CATEGORY: Security - unsanitized input]
For `dest: "vault"`, `output.to` is passed straight into `vault.createNote`/`updateNote` with no validation at this layer — traversal/collision safety depends entirely on `VaultService`.
Confirm `VaultService` sanitizes note ids, or add a defensive check matching the `resolveInside` pattern used for the `project` dest.

STATS: files=11, total_lines=1491, worst3=[task-classifier.service.ts:315, task-output.service.ts:271, claude-cli-router.ts:213]

---
BATCH: api-tasks-scheduler

[SEVERITY: Critical] [FILE: apps/api/src/tasks/task-scheduler.service.ts:1124] [CATEGORY: race-condition]
`writeAgentOutcome` reads `existing.outcome` as an early-exit guard, then `await`s `taskOutput.handleTerminal` (which opens a PR — a real, non-idempotent side effect) before finally calling `storage.writeOutcome`; nothing serializes this read-modify-write, so two terminal handlers for the same run (the `onRunStatus` fast path plus `reconcileOutcome`/`sweepOutcomes`) can both pass the guard and both open a PR / write an outcome.
Doporučení: wrap the whole per-task outcome write (guard → handleTerminal → writeOutcome) in `withPathLock(\`task:${taskId}\`, …)` so the first terminal handler wins before any side effect runs.

[SEVERITY: High] [FILE: apps/api/src/tasks/scheduled-tasks.storage.service.ts:336] [CATEGORY: race-condition]
Every mutator (`writeOutcome`, `setTitle`, `setApproval`, `markDispatched`, `reassignRun`, `markHeld`, `markQueued`, `resolveOutput`, …) is an unserialized `get()` → mutate → `writeEntity()`; the atomic rename prevents a torn file but not lost updates — a background `setTitle` racing a terminal `writeOutcome` silently clobbers one side.
Doporučení: route all task read-modify-write mutations through a per-id `withPathLock` (primitive already used by `drainQueues`).

[SEVERITY: High] [FILE: apps/api/src/tasks/task-scheduler.service.ts:570] [CATEGORY: race-condition]
The immediate-create path checks `atCapacity(project)` then dispatches with no lock, while only `drainQueues` is serialized; two concurrent `createTask` calls for the same project both read `countRunning < max` and both dispatch, exceeding `maxConcurrent`.
Doporučení: serialize capacity-check-plus-dispatch per project, or make the concurrency reservation atomic.

[SEVERITY: High] [FILE: apps/api/src/tasks/task-runs.service.ts:272] [CATEGORY: performance]
`collect()` fans out ten whole-directory `listAll()`/`list()` reads of the entire run history + all definitions, and is invoked by `listTaskRuns`, by `getTaskRun` (scans the whole universe to return one run), and by `kindOf`'s disk fallback (reachable per SSE stage-log chunk for a historical run). No pagination or index; cost grows unbounded with history.
Doporučení: add a by-id lookup that doesn't rebuild the full feed, and paginate `listTaskRuns`.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:844] [CATEGORY: error-handling]
Inside `drainQueues`, `attemptDispatch` is awaited with no try/catch and the whole drain is fire-and-forget; a thrown transient dispatch leaves the task `queued` with no retry/dead-letter — unlike the `tick` path. The task silently stalls until a later terminal event or restart.
Doporučení: mirror the tick's transient-failure handling (retry/backoff → dead-letter) in the drain loop.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:683] [CATEGORY: duplication]
The post-dispatch bookkeeping block (`recordLedger` → `markDispatched` → `recordDispatchedActivity` → `reconcileOutcome` → `log.info`) is copy-pasted across `attemptDispatch`, `dispatchPending`, and `persistDispatched`; argument-threading into `dispatch(...)` repeats 10 positional args at three call sites.
Doporučení: extract one `finalizeDispatch(task, dispatched)` helper and pass the task object into `dispatch`.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:1170] [CATEGORY: duplication]
`writePipelineOutcome`, `writeGoalOutcome`, and `writeChainOutcome` are near-identical: terminal-status guard, build outcome, `storage.writeOutcome` in try/catch, identical `activity.record` + `log.info`. Only summary string and cost line differ.
Doporučení: collapse into one `writeRunOutcome(taskId, {...})` with per-kind summary builders.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:132] [CATEGORY: correctness]
`budgetApproved` is in-memory; a released (approved-past-cap) task that re-queues and survives an API restart loses its bypass — `drainQueues` re-runs the budget check and re-holds it behind a brand-new approval, re-prompting the operator for an already-approved overage.
Doporučení: persist the release decision on the task record.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:120] [CATEGORY: file-size]
At 1341 lines the scheduler mixes create/guard flow, dispatch, budget/hold/queue, limit-defer, four outcome writers, attachment sweep, and title logic.
Doporučení: split out a `TaskOutcomeWriterService` and a `TaskDispatchService`/attachment-sweep helper.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.ts:1298] [CATEGORY: sensitive-data]
`agentRunSummary` takes the raw last log line of the claude CLI process and writes it verbatim (length-truncated only) into the persisted task outcome summary and the `activity.record` feed; if the agent printed a secret/token it lands in the durable activity log.
Doporučení: consider redaction of the surfaced log tail.

[SEVERITY: Low] [FILE: apps/api/src/tasks/scheduled-tasks.storage.service.ts:60] [CATEGORY: duplication]
The same task object literal is rebuilt in `create`, `parkedTask`, `createPending`, `createDeferredLimit`, and `createDispatched`.
Doporučení: build all create* records from one base factory.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.ts:426] [CATEGORY: duplication]
Title refinement (Haiku `namer.name` → `storage.setTitle`) is implemented twice — in `refineTitle` and inline inside `dispatchPending`.
Doporučení: have `dispatchPending` reuse `refineTitle`.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-runs.service.ts:441] [CATEGORY: maintainability]
The run-status mapping ladders in `pipelineRunToView`, `goalRunToView`, `chainRunToView`, and `scheduledTaskToView` are duplicated deeply-nested ternaries.
Doporučení: replace each with a small explicit status lookup map per kind.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.ts:919] [CATEGORY: input-validation]
`dispatch` forwards `task.paths` straight into the agent/goal runners (`--add-dir` grant material) with no validation at this layer; absolute/existing-dir gating lives only in the runner (defense-in-depth gap).
Doporučení: re-assert path constraints before threading into the runner.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.test.ts:666] [CATEGORY: missing-tests]
The `writeOutcome` idempotency test exercises sequential calls only; no test for two terminal handlers racing through `handleTerminal` (double-PR window), the create-path `atCapacity` TOCTOU, or a thrown dispatch inside `drainQueues`.
Doporučení: add concurrent-invocation tests around outcome write, capacity, and drain-failure paths.

STATS: 6 souborů (+2 supporting), 2675 řádků. Top 3: task-scheduler.service.ts (1341), task-runs.service.ts (635), scheduled-tasks.storage.service.ts (453).

---
BATCH: contracts-a

POZN. ORCHESTRÁTORA: nález č. 1 (z.unknown() na raw) je reálně spíš High než Critical — jde o úložiště syrového provider payloadu, riziko je smuggling nestrukturovaných dat do auditního záznamu, ne přímá exekuce. Při agregaci normalizovat.

[SEVERITY: Critical] [FILE: libs/contracts/src/channels/channel.schema.ts:67] [CATEGORY: Weak schema - unknown type without validation]
`raw: z.unknown()` accepts any untrusted provider payload without structure validation. Combined with triage running over channel text (Law 4: strict handling of untrusted input), the raw field could smuggle arbitrary data structures into the audit record. (Reálná severity: High)
Recommendation: Define an explicit union of known payload shapes per IntegrationKind, or at least `z.record(z.unknown())` to signal deliberate permissiveness.

[SEVERITY: High] [FILE: libs/contracts/src/commands/command.schema.ts:31] [CATEGORY: Weak schema - unvalidated enum field]
`model: z.string().optional()` accepts any string instead of the closed set [opus, sonnet, haiku]. The agent has AgentModelSchema, the command does not.
Recommendation: Replace with `z.enum(['opus','sonnet','haiku']).optional()`.

[SEVERITY: High] [FILE: libs/contracts/src/chains/chain.schema.ts:11] [CATEGORY: Schema inconsistency - wrong ID type]
ChainStepSchema.pipeline uses AgentIdSchema but the field represents a pipeline id. ChainRunStepSchema:47 uses bare `z.string().min(1)` — the schema is inconsistent with itself.
Recommendation: Create a PipelineIdSchema and use it consistently.

[SEVERITY: Medium] [FILE: libs/contracts/src/automations/automation.schema.ts:31] [CATEGORY: Weak schema - unvalidated cron expression]
`expr: z.string().min(1)` accepts any string without validating cron syntax. A malformed cron parks the scheduler silently; no 422 at dispatch.
Recommendation: Add a regex for 5-field cron syntax, or document handler-level parse-error handling.

[SEVERITY: Medium] [FILE: libs/contracts/src/agents/agent.schema.ts:53-55] [CATEGORY: Weak schema - unvalidated array contents]
`tools`/`optionalTools` are `z.array(z.string()).optional()` without validating contents — a malformed tool id reaches the runner.
Recommendation: Define a ToolIdSchema, or document catalog validation in the handler.

[SEVERITY: Medium] [FILE: libs/contracts/src/channels/channel.schema.ts:31] [CATEGORY: Weak schema - unbounded string]
`reason: z.string()` in TriageVerdictSchema lacks bounds — inconsistent with `summary` capped at 280.
Recommendation: Add `.max(500)` or match summary's cap.

[SEVERITY: Medium] [FILE: libs/contracts/src/chat/chat.schema.ts:33] [CATEGORY: Weak schema - unbounded string]
`name: z.string()` in ChatToolEventSchema has no length bounds.
Recommendation: Add `.min(1).max(256)`.

[SEVERITY: Medium] [FILE: libs/contracts/src/channels/channel.schema.ts:65] [CATEGORY: Weak schema - unbounded text]
`text: z.string()` in ChannelItemSchema lacks `.max()`. The docstring says "sanitized, length-capped" but the schema does not enforce it.
Recommendation: Add a reasonable cap (`.max(10000)`), document sanitization in the handler.

[SEVERITY: Medium] [FILE: libs/contracts/src/agents/agents.contract.ts:76, automations.contract.ts:63, chains.contract.ts:38, commands.contract.ts:56] [CATEGORY: Response envelope inconsistency]
DELETE responses return different shapes: agents/automations `{ id: AgentIdSchema }`, chains `{ id: z.string() }`, commands `{ id: CommandIdSchema }` — same affordance, different shapes (proti "one interaction grammar").
Recommendation: Define a shared DeleteResponseSchema in common.schema and reuse.

[SEVERITY: Medium] [FILE: libs/contracts/src/automations/automations.contract.ts:71, channels/channels.contract.ts:59] [CATEGORY: Response envelope inconsistency]
triggerAutomation returns `{ runRef }`, createJiraIssue returns `{ approvalId }` — both secondary-resource-created responses with different key names.
Recommendation: Standardize the reference-key shape and document semantics.

[SEVERITY: Low] [FILE: libs/contracts/src/agents/agent.schema.ts:46-56] [CATEGORY: Weak schema - free-form optional strings]
`name`, `description`, `glyph`, `category` are all unbounded `z.string().optional()`.
Recommendation: Add `.min(1).max(256)` to name/description, `.max(64)` to glyph/category.

[SEVERITY: Low] [FILE: libs/contracts/src/briefing/briefing.schema.ts:97-103] [CATEGORY: Unbounded arrays]
`trend7d`, `learnedPatterns`, `automationGaps`, `appIdeas` are `z.array(z.string()).optional()` without bounds on array size or string length.
Recommendation: Add semantic caps per field.

STATS: 38 souborů across 12 resource folders, 2947 řádků (bez testů). Top 3: activity.schema.ts (191), automation.schema.ts (137), activity-view.schema.ts (118).

---
BATCH: contracts-b

[SEVERITY: Critical] [FILE: libs/contracts/src/integrations/integration.schema.ts:174] [CATEGORY: Type Safety]
Type `Integration` is inferred from unrefined `IntegrationObjectSchema` instead of the strict `IntegrationSchema`. This bypasses the `superRefine(requireExactlyOneOwner)` constraint in the type system, allowing code to construct invalid Integration objects where both or neither of projectId/companyId are set. (Pozn. orchestrátora: typová díra na XOR invariantu Company/Project ownershipu — reálně spíš High; runtime validace přes IntegrationSchema stále platí.)
Apply `export type Integration = z.infer<typeof IntegrationSchema>;` to enforce the ownership constraint at the type level.

[SEVERITY: High] [FILE: libs/contracts/src/companies/companies.contract.ts:41] [CATEGORY: Input Validation]
Search query parameter lacks `.min(1)` validation; clients can submit empty `q` string. Same issue in discovery.contract.ts:50 and integrations.contract.ts:35.
Add `.min(1)` to all query search strings.

[SEVERITY: High] [FILE: libs/contracts/src/memory/memory.contract.ts:37, 50, 71, 79, 87] [CATEGORY: Input Validation]
Path parameter `:id` in `/memory/note/:id`, `/memory/notes/:id`, `/memory/notes/:id/append`, `/memory/index/:id/links` uses bare `z.string()` without format validation. Can accept empty strings or invalid note IDs.
Validate pathParams with `z.object({ id: NoteIdSchema })` (enforces the format regex).

[SEVERITY: Medium] [FILE: libs/contracts/src/monitors/monitor.schema.ts:35] [CATEGORY: Input Validation]
`detail` field on MonitorEventSchema has no length constraints — unbounded strings can cause storage/display issues.
Add `.min(1).max(4000)` or a reasonable bound.

[SEVERITY: Medium] [FILE: libs/contracts/src/machine/machine.schema.ts:13, 15, 30, 43] [CATEGORY: Input Validation]
User input strings lack `.max()` bounds: `folder`, `find`, `query`, `path` all use `.min(1)` but no upper limit.
Apply `.max(2048)` or domain-specific ceilings.

[SEVERITY: Medium] [FILE: libs/contracts/src/integrations/integration.schema.ts:156, 161] [CATEGORY: Schema Consistency]
Optional `name` field in `IntegrationSchema` lacks `.min(1)`; empty strings are valid — inconsistent with other optional fields.
Disallow empty strings or document the permissiveness.

[SEVERITY: Low] [FILE: libs/contracts/src/memory/memory.schema.ts:32, 121] [CATEGORY: Schema Weakness]
`frontmatter: z.record(z.string(), z.unknown())` permits arbitrary nested structures with no validation. Backwards-compatible for Obsidian, but weakens type safety at the boundary.
Consider a stricter union of frontmatter value types with fallback for legacy notes.

[SEVERITY: Low] [FILE: libs/contracts/src/memory/memory.contract.ts:96] [CATEGORY: Response Consistency]
Import endpoint returns 400 for `sourcePath` validation error, but other mutations in the same contract return 422 — inconsistent error semantics.
Standardize on 422 or document the distinction.

Pozitivum: integrations response schémata credentials neexponují (hasCredentials boolean) — potvrzeno i z web-integrations batche.

STATS: 43 souborů (26 non-test schema+contract napříč 13 doménami), 3389 řádků. Největší: integration.schema.ts (228), gate.schema.ts (182), memory.schema.ts (178).

---
BATCH: contracts-c

[SEVERITY: High] [FILE: libs/contracts/src/projects/projects.contract.ts:59] [CATEGORY: Inconsistency — error-shape/status-code]
`getProject`/`updateProject`/`deleteProject`/… type `pathParams: z.object({ id: ProjectIdSchema })` (regex + max(128)). An id failing that shape is rejected by ts-rest's validator as a bare 400 before the handler runs — never reaching the contract's declared 404 `ErrorSchema`. `subsystems.contract.ts:28-33` explicitly documents this trap and deliberately uses plain `z.string()`; projects and skills didn't apply the same fix.
Widen `id` pathParams to plain `z.string()` and let the handler return the documented 404.

[SEVERITY: High] [FILE: libs/contracts/src/skills/skills.contract.ts:39] [CATEGORY: Inconsistency — error-shape/status-code]
Same bug: `getSkill`/`updateSkill`/`deleteSkill` type pathParams with `SkillIdSchema`, so a malformed id 400s instead of the declared 404.
Same fix — plain `z.string()` pathParam.

[SEVERITY: High] [FILE: libs/contracts/src/projects/project.schema.ts:231] [CATEGORY: Missing validation — mutation body]
`ProjectSecretsInputSchema = z.record(z.string(), z.string())` has zero constraints: no key-count cap, no key-format check (keys become subprocess env var names), no per-value length cap. This body feeds credentials injected directly into `claude -p` run environments.
Add a bounded record (max key count, env-safe key regex, value length cap).

[SEVERITY: High] [FILE: libs/contracts/src/pipelines/pipeline.schema.ts:235] [CATEGORY: Missing validation — mutation body]
`UpdatePipelineSchema = PipelineObject.omit({id}).partial()` does not re-apply `refinePipeline`'s superRefine (unique phase ids, resolvable loop.to/driftTo/then) that CreatePipelineSchema gets. A PATCH can push duplicate phase ids or dangling loop targets past the contract boundary; the "storage re-validates" safety net lives outside libs/contracts.
Reapply the superRefine on update, or re-run `refinePipeline` at the contract layer.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task.schema.ts:435] [CATEGORY: Missing validation — mutation body]
`CreateTaskInputSchema.paths: z.array(z.string()).max(64)` bounds the array but not the elements: empty/whitespace/arbitrarily long strings pass. These become `--add-dir` grants — the schema enforces none of the "absolute + existing dir" invariant, leaving 100% of that gate to downstream code.
Add `.min(1)` + max length per element; consider rejecting relative-looking values.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task.schema.ts:462] [CATEGORY: Missing validation — mutation body]
`CreateTaskInputSchema.toolGrants: z.array(z.string()).optional()` has no `.max()` at all (contrast `paths`, capped at 64) and no per-element bound.
Cap array length and per-element length.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task.schema.ts:339] [CATEGORY: Inconsistency — duplicated bound]
`ScheduledTaskSchema.paths`/`toolGrants` (persisted shape) drop the `.max(64)` bound that create-input applies — the write-path validates a cap the persisted shape doesn't reassert.
Reuse one shared bounded schema across create-input and persisted shapes.

[SEVERITY: Medium] [FILE: libs/contracts/src/pipelines/pipeline-run.schema.ts:13] [CATEGORY: Duplicate schema pattern]
`StageRunStatusSchema` hand-copies the exact six values of shared `RunStatusSchema` (common.schema.ts:32) instead of reusing it; same at `tasks/task-run.schema.ts:31` (`TaskRunStatusSchema`) — three hand-maintained copies of the same base value set.
Derive from `RunStatusSchema.options` so a new run state can't silently miss an enum.

[SEVERITY: Medium] [FILE: libs/contracts/src/tasks/task-run.schema.ts:187] [CATEGORY: Duplicate schema — move to common]
`TaskRunArtifactSchema` is byte-for-byte identical to `PipelineRunArtifactSchema` (pipelines.contract.ts:32); comments cross-reference each other.
Extract one `RunArtifactSchema` into common.schema.ts.

[SEVERITY: Medium] [FILE: libs/contracts/src/projects/project.schema.ts:11] [CATEGORY: Inconsistency — ID typing]
`ProjectIdSchema = AgentIdSchema`, `SkillIdSchema = AgentIdSchema` — agent/project/pipeline/skill ids are all structurally identical, no branding, so TS can't catch a project id passed where an agent id is expected. Meanwhile `pipelines.contract.ts:9` defines its own weaker `PipelineIdParam` — a third variant.
Brand each id type (`.brand<"ProjectId">()`) or standardize the pathParam shape across contracts. (Souvisí s plánovaným entity-id refaktorem — docs/plans/entity-id-refactor.md.)

[SEVERITY: Medium] [FILE: libs/contracts/src/projects/project-pr.schema.ts:11] [CATEGORY: Duplicate schema pattern]
`ProjectPrSchema {number,title,url,...}` and `self/self.schema.ts:9` `SelfPrSchema {number,title,url}` are two independent "one open GitHub PR" shapes.
Factor a shared `PrSummarySchema` base into common.schema.ts.

[SEVERITY: Medium] [FILE: libs/contracts/src/speech/speech.schema.ts:11] [CATEGORY: Missing validation — user input]
`SpeechSynthesizeInputSchema.text: z.string().min(1)` has no `.max()` — unlike task text (capped at 8000) — allowing arbitrarily large synthesis requests against speakd.
Add a `.max()` cap consistent with other free-text inputs.

[SEVERITY: Low] [FILE: libs/contracts/src/tasks/task.schema.ts:242] [CATEGORY: Missing validation — mutation body]
`TaskOutputSchema` file variant and `PipelineFileOutputSchema` (pipeline.schema.ts:99) both accept `to: z.string().min(1)` with no path-traversal guard (no `..` rejection) even though `dest: "project"` writes into the project worktree.
Add a refine rejecting `..` segments and unintended absolute paths.

[SEVERITY: Low] [FILE: libs/contracts/src/projects/project.schema.ts:155] [CATEGORY: Weak schema — unconstrained record]
`ProjectSchema.env: z.record(z.string(), z.string())` — no key-count cap, key-format check, or value length cap.
Cap key count and value length.

[SEVERITY: Low] [FILE: libs/contracts/src/projects/project.schema.ts:130] [CATEGORY: Sensitive data — convention not schema-enforced]
`ProjectSchema.env` is documented "non-secret", but nothing stops an operator/agent putting a secret value in `env`, which then round-trips in plaintext on every GET /projects response — the separation from write-only secrets is discipline, not schema.
Consider a heuristic reject (common secret shapes) or UI-level warning.

[SEVERITY: Low] [FILE: libs/contracts/src/pipelines/pipeline.schema.ts:71] [CATEGORY: Missing validation — mutation body]
`PipelinePhaseSchema.commands: z.array(z.string().min(1))` (verify-phase shell commands, `&&`-joined and shell-executed) has no array or per-string max. Operator-only authorship, but worth a sanity cap.
Add caps.

[SEVERITY: Low] [FILE: libs/contracts/src/self/self.contract.ts:30] [CATEGORY: Duplicate schema pattern]
The `body: z.object({}).optional()` idiom is repeated verbatim in self.contract.ts:30, projects.contract.ts:135, subsystems.contract.ts:46, task-runs.contract.ts:91.
Add a shared `EmptyBodySchema` in common.schema.ts.

STATS: 37 files, 4405 řádků. Top 3 non-test: tasks/task.schema.ts (495), pipelines/pipeline.schema.ts (238), pipelines/pipeline-run.schema.ts (224).

---
BATCH: libs-ds-components-a

[SEVERITY: High] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:1-587] [CATEGORY: Component size]
At 587 lines, Dropdown.tsx is nearly 2.5x the next-largest file in this batch — it mixes trigger-rect positioning math, keyboard navigation, single/multi rendering branches, portal menu markup, and compact chip-overflow measurement in one function component.
Recommendation: extract the rect/menuStyle positioning logic into a shared hook and split single-trigger vs multi-trigger markup into separate subcomponents.

[SEVERITY: High] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:180-334] [CATEGORY: Duplication]
Dropdown and DropDownButton (DropDownButton.tsx:63-159) each independently implement near-identical trigger-rect state, updateRect callback, scroll/resize reposition effect, and flip/clamp menuStyle math, plus parallel keyboard-nav (arrow/home/end/enter/escape/tab with activeIndex).
Recommendation: extract a shared `useFloatingMenuPosition`/roving-keyboard-nav hook consumed by both components.

[SEVERITY: High] [FILE: libs/design-system/src/components/ButtonGroup/ButtonGroup.tsx:72] [CATEGORY: i18n consistency]
`addLabel` defaults to the Czech string "Přidat" while every other default string in this batch is English, violating the documented "DS is i18n-agnostic — string props with English defaults" rule.
Recommendation: change the default to "Add" and let the app override via `t()`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Card/Card.tsx:132-154] [CATEGORY: API consistency]
Five different "tone" unions exist across this batch — Card's `StateTone` (accent/ok/warn/bad/run), Chip's `DotTone` (ok/run/wait/bad/idle/accent), HoldButton's own `HoldButtonTone`, ButtonGroup's own `ButtonGroupTone`, and IconTile's `IconTileTone` — overlapping but not aligned (e.g. "warn" vs "wait", inconsistent presence of "run").
Recommendation: consolidate around one canonical tone vocabulary and derive per-component subsets.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Card/Card.tsx:182-183] [CATEGORY: Missing typing]
Card, Container.tsx:180-181, and Grid.tsx:93-94 each spread `{...(rest as any)}` behind an eslint-disable to forward arbitrary HTML attributes on their polymorphic `as`-tag element, erasing type-checking for callers.
Recommendation: replace the `any` cast with a shared polymorphic-component typing helper used by all three.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:463] [CATEGORY: Missing typing]
`ref={triggerRef as unknown as React.Ref<HTMLButtonElement>}` double-casts a ref typed for `HTMLDivElement` onto a `<button>` element in the single-select branch, papering over a genuine type mismatch.
Recommendation: use separate refs per branch or a proper union ref type.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Accordion/Accordion.tsx:107-137] [CATEGORY: A11y]
`AccordionItem` generates `id = useId()` but never renders it — the summary button has no `aria-controls`, and `AccordionDetails` has no matching `id`/`role="region"`, so assistive tech gets no programmatic link between the toggle and the panel.
Recommendation: wire `aria-controls={panelId}` on the summary and `id={panelId}` on the details panel.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Divider/Divider.tsx:14-17] [CATEGORY: A11y]
The element carries both `aria-hidden` and `role="separator"` at once — `aria-hidden` removes it from the accessibility tree entirely, so the explicit separator role is never announced.
Recommendation: drop `aria-hidden` if the separator should be exposed to AT, or drop `role="separator"` if it's decorative.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:378-393] [CATEGORY: A11y]
The multi-select trigger is `role="combobox"` on a `<div>` that itself wraps nested interactive `Chip` remove buttons; tabbing into a chip's close button steps outside the combobox's own key handling.
Recommendation: reconsider the role for the multi-select trigger, or move removable chips outside the `role="combobox"` element.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Icon/Icon.tsx:71] [CATEGORY: A11y]
`aria-hidden="true"` is hardcoded with no way to override it, so an icon used standalone can never carry its own accessible name.
Recommendation: allow `aria-hidden`/`aria-label` to be overridden via passthrough props.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:114-115] [CATEGORY: Performance]
`selectedKey`/`optionsKey` are computed via `.join(" ")` on every render regardless of `compact` mode, even though they're only consumed by the compact-mode layout effect.
Recommendation: compute them only when `compact` is true, or read live values from refs inside the effect.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Dropdown/Dropdown.tsx:318-334] [CATEGORY: Performance]
`menuStyle` is recomputed via an inline IIFE on every render (same pattern repeated in DropDownButton.tsx:143-159) instead of being memoized.
Recommendation: wrap the calculation in `useMemo`.

[SEVERITY: Low] [FILE: libs/design-system/src/components/IconTile/IconTile.tsx:133] [CATEGORY: Missing typing]
The polymorphic `as`-prop ref is typed as an intersection of unrelated element types, duplicating the same unsound escape hatch also used in Card.tsx:205.
Recommendation: factor a shared polymorphic-ref helper type.

[SEVERITY: Low] [FILE: libs/design-system/src/components/ButtonGroup/ButtonGroup.tsx:78-85] [CATEGORY: A11y / API consistency]
The mutually-exclusive option set uses `role="group"` with `aria-pressed` buttons rather than `role="radiogroup"`/`role="radio"`, and offers no arrow-key roving-focus navigation.
Recommendation: consider radiogroup semantics plus arrow-key navigation for consistency.

STATS: 21 files, 3314 total lines. Top 3 by line count: Dropdown.tsx (587), Card.tsx (262), DropDownButton.tsx (250).

---
BATCH: libs-ds-components-b

[SEVERITY: High] [FILE: libs/design-system/src/components/Surface/Surface.tsx:37-38] [CATEGORY: Typing]
`{...(rest as any)}` with an inline eslint-disable directly violates the project's "no `any`" rule to work around the polymorphic `as` tag prop — the exact problem `Stack.tsx` already solves safely via a typed `as unknown as FC<...>` cast in the same batch.
Replace with Stack's typed-FC-cast pattern (or extract a shared `polymorphicAs` helper).

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Typography/Typography.tsx:190-198] [CATEGORY: Typing]
`ref as Ref<HTMLHeadingElement & HTMLDivElement & HTMLParagraphElement & HTMLSpanElement & HTMLLabelElement>` casts to an intersection of five DOM element types, which no real node can satisfy — should be a union.
Model this as a proper union type (or a small generic over the element tag).

[SEVERITY: Medium] [FILE: libs/design-system/src/components/form/FilePickerField/FilePickerField.tsx:49-60] [CATEGORY: Duplication/Typing]
`assignRef` hand-rolls dual-ref assignment with two `as MutableRefObject` casts, duplicating what `utils/refs.ts` `mergeRefs` already does type-safely (used correctly in SearchMenu.tsx).
Replace `assignRef` with `mergeRefs(ownRef, ref)`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/MenuButton/MenuButton.tsx:1-231] [CATEGORY: Duplication]
The component's own doc comment admits it "reuses `DropDownButton`'s proven mechanics verbatim" — portal rendering, `updateRect` on scroll/resize, flip/clamp math (`menuStyle`), and roving `activeIndex` keyboard logic are all copy-pasted.
Extract a `useFloatingMenu`/`usePortalPosition` + `useRovingIndex` hook shared by `MenuButton` and `DropDownButton`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Tabs/Tabs.tsx:87-136] [CATEGORY: A11y]
Tabs implement `role="tab"`/`aria-selected` but no keyboard navigation (ArrowLeft/ArrowRight/Home/End) or roving `tabIndex` — the WAI-ARIA Tabs pattern requires arrow-key movement; currently only mouse click works, with no keyboard test coverage.
Add roving-tabindex + arrow-key handling to `Tab`/`TabList`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/form/SegmentPickerField/SegmentPickerField.tsx:22-34] [CATEGORY: A11y/API consistency]
Unlike every other `*Field`, `SegmentPickerField` never forwards `invalid` — and `ButtonGroup` exposes no `invalid`/`aria-invalid` prop — so on error the message renders in red but the interactive control gives no accessible or visual invalid signal.
Wire `invalid` through to `ButtonGroup` (adding `aria-invalid`/error styling support there).

[SEVERITY: Low] [FILE: libs/design-system/src/components/SearchMenu/SearchMenu.tsx:224-227] [CATEGORY: Performance]
Inside nested maps, `flat.findIndex(...)` reruns a linear scan of the whole flattened list for every rendered row — avoidable O(n²) per render.
Precompute an `id → index` map once per render.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Markdown/Markdown.tsx:44-55] [CATEGORY: Duplication]
The `themeVars` GitHub-primer-to-token CSS-var mapping object is duplicated verbatim (same 10 keys) in `MarkdownEditor.tsx:23-35`.
Extract into one exported const imported by both.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Tabs/Tabs.tsx:87-136] [CATEGORY: Duplication]
`Tab`'s horizontal and vertical branches render two nearly identical `<button>` trees differing only in a handful of classes — real logic (aria-selected, onClick, testid) is copy-pasted between the two returns.
Merge into a single return with direction-dependent classes via `cn()`.

[SEVERITY: Low] [FILE: libs/design-system/src/components/form/FilePickerField/FilePickerField.tsx:41,113,124] [CATEGORY: API consistency]
Default strings ("Žádný soubor vybrán", "Procházet") and the trigger's `aria-label` are hardcoded Czech, violating "DS is i18n-agnostic — string props with English defaults" (every sibling follows the convention).
Default to English (or require consumer-supplied labels).

[SEVERITY: Low] [FILE: libs/design-system/src/components/List/List.tsx:51-53] [CATEGORY: A11y/API consistency]
`ListItemText` renders the row's visible label but carries no `data-testid`, unlike every sibling sub-part — breaking the testid convention.
Add a `ListTestId.Text` entry.

[SEVERITY: Low] [FILE: libs/design-system/src/components/Tooltip/Tooltip.tsx:40-76] [CATEGORY: A11y]
No Escape-key dismissal (only blur/mouse-leave), and moving the pointer from trigger toward the bubble closes the tooltip — interactive tooltip content can never be reached by mouse. Line 51 contains a stray empty JSX text node.
Add an Escape handler, extend the hover region (or document non-interactive content), remove the stray node.

STATS: 35 files, 3483 total lines. Top 3: SearchMenu.tsx (268), MenuButton.tsx (231), SchedulePicker.tsx (209).

---
BATCH: libs-ds-misc

POZN. ORCHESTRÁTORA: agent (haiku) částečně vybočil ze scope (assets/themes/context/utils) a auditoval i komponenty — překryv s libs-ds-components-a/b batchi. Severity typových castů (High) jsou nadsazené — reálně Low/Medium. Nález "Dialog hardcoded px šířky" je pravděpodobně falešný: DialogWidth je záměrně sealed sizing API projektu (viz project_sealed_sizing). Při agregaci normalizovat a deduplikovat.

[SEVERITY: High] [FILE: libs/design-system/src/DesignSystemContext/DesignSystemProvider.tsx:51] [CATEGORY: Typování]
Type cast `...(cssVars as CSSProperties)` — `cssVars` je `Record<string, string>`. (Reálná severity: Low)
Zlepšit typování v `tokensToCssVars()`.

[SEVERITY: High] [FILE: libs/design-system/src/utils/refs.ts:8] [CATEGORY: Typování]
Type cast `(external as { current: T | null })` bez type guardu. (Reálná severity: Low)
Přidat type guard před přetypováním.

[SEVERITY: High] [FILE: libs/design-system/src/components/Kbd/Kbd.tsx:23] [CATEGORY: Typování]
Zbytečný cast `ref={ref as Ref<HTMLElement>}` — ref je v props již správně typován. (Reálná severity: Low)
Odstranit cast.

[SEVERITY: High] [FILE: libs/design-system/src/components/Dialog/Dialog.tsx:24-33] [CATEGORY: Hardcoded hodnoty]
Hardcodované px šířky dialogů. (POZN.: pravděpodobně falešný nález — DialogWidth je záměrné sealed sizing API; nanejvýš přesun do tokens.ts jako kosmetika.)
Zvážit přesun do tokens.ts.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/ProgressRing/ProgressRing.tsx:76, Progress/Progress.tsx:47, Button/Button.tsx:27, Chip/Chip.tsx:15] [CATEGORY: Hardcoded hodnoty]
Hardcodované RGBA barvy (track/hover/surface) v SVG stroke a arbitrary Tailwind třídách (`rgba(255,255,255,0.09)`, `bg-[rgba(255,255,255,0.07)]`, `hover:bg-[rgba(255,255,255,0.05)]`, `bg-[rgba(255,255,255,0.03)]`) místo theme tokenů — čtyři nezávislé "white-alpha" konstanty mimo token systém.
Zavést `colorBgTrack`/`colorBgHover` tokeny v @theme a nahradit.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Icon/Icon.tsx:28-41] [CATEGORY: Hardcoded hodnoty]
`iconSizePx` a `strokeWidthPx` Records přímo v komponentě místo v tokens.ts. (Pozn.: Icon=Size je sealed API, jde jen o umístění konstant.)
Přesunout do tokens.ts jako `iconSizes`/`iconStrokeWidths`.

[SEVERITY: Medium] [FILE: libs/design-system/src/components/Icon/Icon.tsx:14-22, Chip/Chip.tsx:10-13, HoldButton/HoldButton.tsx:19-24, StatusDot/StatusDot.tsx:12-19, Typography/Typography.tsx:104-112, IconTile/IconTile.tsx:37-51] [CATEGORY: Duplicitní logika]
Šest `toneClass` Records opakuje stejný pattern mapování tónů na Tailwind třídy — potvrzuje nález "pět tone unions" z libs-ds-components-a.
Centralizovat tone→class mapy do sdíleného modulu (`utils/toneClass.ts`) nad kanonickým tone vokabulářem.

[SEVERITY: Low] [FILE: libs/design-system/src/components/LivingGlow/LivingGlow.tsx:59] [CATEGORY: Typování]
Cast `as CSSProperties` pro CSS custom property — standardní React idiom, kosmetika.
Ponechat, případně typovat přes `React.CSSProperties & Record<'--living-color', string>`.

STATS: ~10 souborů ve scope (context/themes/utils) + překryv s komponentami. Assets (49 ikon) bez nálezů.

---
BATCH: libs-forms

[SEVERITY: High] [FILE: libs/forms/src/FormMarkdownEditor/FormMarkdownEditor.tsx:11-27] [CATEGORY: bug/API consistency]
FormMarkdownEditor never reads `fieldState.error` (only destructures `field`) and never passes an `error` prop to `MarkdownEditor` — unlike all 7 other field wrappers which uniformly do `error={fieldState.error?.message ?? error}`. Zod validation errors on a markdown body silently never render. Underlying `MarkdownEditorProps` also has no `error`/invalid prop at all, so fixing the wrapper requires extending the DS component first.
Add `error`/invalid support to DS `MarkdownEditor` and wire `fieldState.error?.message ?? error` through `FormMarkdownEditor`.

[SEVERITY: Medium] [FILE: libs/forms/src/FormMarkdownEditor/FormMarkdownEditor.test.tsx] [CATEGORY: missing test]
Every other field's test file has a "shows zod error as error text on submit" case; `FormMarkdownEditor.test.tsx` has no such case, which is exactly why the missing error-wiring above went unnoticed.
Add a zod-schema error-display test once the underlying bug is fixed.

[SEVERITY: Medium] [FILE: libs/forms/src/FormFilePicker/FormFilePicker.tsx:12-31] [CATEGORY: API consistency]
`name` is destructured out of props for `useController` and never re-applied to the underlying element — the real `<input type="file">` ends up with no `name` attribute, breaking native form semantics/autofill and name-based queries.
Explicitly set `name={field.name}` on the `FilePickerField` call, mirroring `FormTextInput`/`FormTextArea`.

[SEVERITY: Medium] [FILE: libs/forms/src — všech 8 field wrapperů] [CATEGORY: duplication]
All 8 wrappers repeat the identical shape: destructure `name`/`error`/`hint`/`defaultValue`, call `useController` with a `(defaultValue ?? X) as never` cast, then spread props with `error={fieldState.error?.message ?? error}`. Each field reimplements the same ~10 lines of RHF glue.
Extract a small internal `useFormField(name, defaultValue)` helper that each wrapper calls.

[SEVERITY: Medium] [FILE: libs/forms/src — všech 8 field wrapperů (FormTextInput.tsx:22 atd.)] [CATEGORY: typing]
`defaultValue: (defaultValue ?? X) as never` appears identically in all 8 wrappers to bypass `useController`'s constraint. `never` suppresses all structural checking — equivalent to `any` for that argument, repeated rather than centralized.
Centralize the cast inside a shared typed helper with one documented assertion instead of eight ad hoc ones.

[SEVERITY: Low] [FILE: libs/forms/src/FormTextInput/FormTextInput.tsx:32 (+ TextArea, Toggle, FilePicker)] [CATEGORY: typing]
`ref={field.ref as unknown as Ref<HTMLInputElement>}` double-casts through `unknown` — suggests RHF's `field.ref` and the DS component's `Ref<T>` prop aren't reconciled at the type level.
Type a shared helper's return so the ref cast happens once.

[SEVERITY: Low] [FILE: libs/forms/src/FormSelect/FormSelect.tsx:26] [CATEGORY: typing]
`value={(field.value ?? "") as T}` casts generic RHF field value directly to the caller's generic `T` with no runtime check.
Accept the risk documented once in the shared helper, or validate against `options` before casting.

[SEVERITY: Low] [FILE: libs/forms/src/zodResolver.ts:12] [CATEGORY: typing]
`_zodResolver(schema as any)` is the one explicit `any` in the library (with eslint-disable and comment about @hookform/resolvers/zod version type mismatch). Legitimate today, but an upstream type upgrade could silently change behavior.
Add a version-tied TODO note and/or narrow the cast.

[SEVERITY: Low] [FILE: libs/forms/src/Form/Form.tsx:18-34,45-60] [CATEGORY: duplication]
`useFormControls` and `Form` both independently call `useForm`, build `submit`, and wrap children in `FormProvider` + `<form>` — `Form` does not reuse `useFormControls`.
Implement `Form` in terms of `useFormControls`'s `renderForm`.

[SEVERITY: Low] [FILE: libs/forms/src/FormSelect/FormSelect.tsx] [CATEGORY: API coverage gap]
DS `SelectField` supports multi-select mode, but `FormSelect` only wraps `SelectFieldSingleProps` — no RHF-bound multi-select wrapper exists, so screens needing one must hand-roll a `Controller`, defeating the "app imports only from @zibby/forms" convention.
Add a `FormMultiSelect` (or extend `FormSelect`) if multi-select forms are needed.

[SEVERITY: Low] [FILE: libs/forms/src (all field wrappers)] [CATEGORY: missing testid/DS coverage]
`SelectField`, `SegmentPickerField`, and `DropZoneField` still have no `data-testid` enum of their own (tests fall back to adjacent primitives' enums), so `FormSelect`/`FormSegmentPicker`/`FormDropZone` inherit that gap. (Pozn.: konvenční poznámka "testid jen TextInput+TextArea" je zastaralá — ToggleField, FilePickerField, NumberField, HighlightTextAreaField, MarkdownEditor už TestId enumy mají.)
Add dedicated `TestId` enums to `SelectField`, `SegmentPickerField`, and `DropZoneField` in the DS.

STATS: 27 files, 1508 total lines. No file exceeds 300 lines; library is intentionally small and uniform.

---
BATCH: web-agents

[SEVERITY: High] [FILE: apps/web/features/agents/DetailScreen.tsx:70-101] [CATEGORY: Duplication]
Own-rule editor state machine (editingRule state, saveRule closure, watchedGates/watchedGateRuleIds derivation, setGates helper) and the canSave/canCreate name+instructions validity check are duplicated verbatim in apps/web/features/agents/components/NewAgentDialog.tsx:47-74 — same ~30 lines maintained in two places.
Extract a shared hook (e.g. useAgentRuleEditor(form)) into agentEditValues.ts or a new hooks file and use it from both DetailScreen and NewAgentDialog.

[SEVERITY: Medium] [FILE: apps/web/features/agents/DetailScreen.tsx:75] [CATEGORY: Business logic in component]
The pipeline-usage filter (`pipelines.filter(p => p.phases.some(ph => ph.agent === agent.name))`) is reimplemented independently in apps/web/features/agents/Screen.tsx:55-56 (as `pipelineCount`) instead of living in one selector/util.
Extract a shared `agentPipelineUsage(pipelines, agentName)` util and reuse it in both screens.

[SEVERITY: Medium] [FILE: apps/web/features/agents/components/agentEditValues.ts] [CATEGORY: Missing test coverage]
`toFormValues`, `applyFormValues`, and `ownRuleToInitial` carry non-trivial mapping logic (empty-string→undefined normalization, gates/gateRuleIds defaulting) shared by both the detail screen and create dialog, but have no dedicated unit test file.
Add agentEditValues.test.ts covering round-trip conversion and the empty-string-to-undefined edge cases.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/AgentRulesSection.tsx:34-103] [CATEGORY: Component boundaries]
GroupHeading and LinkedRuleRow are fully-fledged sub-components defined inline in the same file as the 152-line main component, pushing the file to 257 lines and mixing three concerns.
Move GroupHeading and LinkedRuleRow into their own component files under components/.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/AgentRulesSection.tsx:34-44] [CATEGORY: Missing typing convention]
GroupHeading, LinkedRuleRow (same file) and ChipToggle in AgentEditBasics.tsx:18-26 type their props as inline object literals instead of a named, exported `<Component>Props` interface, diverging from the project's stated props convention.
Give each an exported `XxxProps` interface per CLAUDE.md convention.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/AgentCard.tsx:39] [CATEGORY: Duplication]
The `agent.glyph as IconName | undefined ?? "bot"` cast-with-fallback pattern is repeated identically at DetailScreen.tsx:158, Screen.tsx:171 (cat.glyph), and NewAgentDialog.tsx:101 (watchedGlyph).
Add a small `toIconName(glyph, fallback = "bot")` helper and reuse it instead of re-casting at each call site.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/ApprovalCard/ApprovalCard.tsx:23] [CATEGORY: Typing]
Prop type widens the contract `Approval` via an ad-hoc inline intersection (`Approval & { riskType?: string; kind?: string }`), signalling the enriched backend payload isn't fully modeled in the contracts package.
Model the enriched approval payload as a named contract/DTO type rather than an inline intersection at the component boundary.

[SEVERITY: Low] [FILE: apps/web/features/agents/components/NewAgentDialog.tsx] [CATEGORY: Missing test coverage]
NewAgentDialog (create flow + tabs), AgentRulesSection (link/unlink/add/edit/delete-rule interactions) and AgentEditBasics (field bindings, tool-toggle, glyph-picker) have no dedicated test files; only indirectly touched via DetailScreen.test.tsx/Screen.test.tsx smoke tests.
Add focused component tests for the rule-linking and tool-toggle interaction branches, which carry the most logic.

STATS: 26 files, 1816 total lines. Top 3 by size: components/AgentRulesSection.tsx (257), DetailScreen.tsx (245), Screen.tsx (211). No file in this batch exceeds 300 lines.

---
BATCH: web-app-shell

[SEVERITY: Medium] [FILE: apps/web/features/memory/mutations/useCreateNoteMutation.ts:1] [CATEGORY: Missed pattern]
`useCreateNoteMutation` invalidates `["memory"]` key with boilerplate query-client code; identical pattern to ~40 other mutations but reinvents instead of using `makeInvalidatingMutation`.
Refactor to `makeInvalidatingMutation(apiClient.memory.createNote.useMutation, () => ["memory"])` to match convention.

[SEVERITY: Medium] [FILE: apps/web/features/memory/mutations/useUpdateNoteMutation.ts:1] [CATEGORY: Missed pattern]
`useUpdateNoteMutation` invalidates `["memory"]` key with boilerplate query-client code; same pattern as create-mutation.
Refactor to use `makeInvalidatingMutation` helper.

[SEVERITY: Low] [FILE: apps/web/app (root)] [CATEGORY: Missing boundary]
No `error.tsx` in app root or `(dashboard)` segment — App Router best practice recommends error boundaries at segment boundaries.
Add `app/error.tsx` and optionally `app/(dashboard)/error.tsx`.

[SEVERITY: Low] [FILE: apps/web/state/makeInvalidatingMutation.ts:24] [CATEGORY: Type inference]
Generic `TResult` on the returned hook function is inferred but never explicitly constrained; queries with uncommon response shapes might pass through without static validation.
Add constraint mirroring the `useMutation` return shape for tighter type safety.

STATS: 47 souborů (34 app/ pages/layouts + 5 state + 6 utils + 2 hooks + request.ts + domain.ts), 817 řádků. App shell je celkově čistý — page.tsx soubory jsou tenké wrappery.

---
BATCH: web-automations

[SEVERITY: Medium] [FILE: apps/web/features/automations/schedule.ts:1-352] [CATEGORY: file-size]
Modul mísí 4 nezávislé zodpovědnosti (cron matcher, cron→descriptor, friendly Schedule⇄cron konverze, relative-time formatting) v jednom souboru přes 300 řádků, přestože jsou interně jasně oddělené komentářovými sekcemi.
Rozdělit na samostatné soubory/moduly (cron-matcher.ts, cron-descriptor.ts, schedule-cron.ts, relative-time.ts) nebo složku schedule/ s barrel exportem.

[SEVERITY: Medium] [FILE: apps/web/features/automations/components/AutomationFormDialog.tsx:49-53] [CATEGORY: duplication]
`scheduleValid` v dialogu ručně opakuje stejnou validační logiku, jakou už počítá `useAutomationFormState().canSave()` v AutomationFormFields.tsx:60-64 — dvě místa, která se musí udržovat synchronně, jinak se validace rozejde.
Nahradit `scheduleValid` voláním `form.canSave()`.

[SEVERITY: Medium] [FILE: apps/web/features/automations/Screen.tsx:41-58] [CATEGORY: duplication]
`resolveTarget` v Screen.tsx a `TARGET_GLYPH`/`taskGlyph` v AutomationCard.tsx:33-50 nezávisle implementují překrývající se mapování target.type/target.target?.kind → glyph, s mírně odlišnou logikou pro `task` typ (riziko budoucí divergence, komentář v AutomationCard to sám přiznává).
Vytáhnout sdílenou čistou funkci `resolveTargetGlyph(target)` (např. do schedule.ts sousedního util modulu nebo nového `target.ts`) a použít ji na obou místech.

[SEVERITY: Low] [FILE: apps/web/features/automations/Screen.tsx:45] [CATEGORY: typing]
`(agent?.glyph as IconName) ?? "bot"` přetypovává volně typované pole bez runtime validace; pokud backend uloží libovolný string, ikonka může tiše selhat/vykreslit nic.
Typovat `agent.glyph` jako `IconName` už na úrovni kontraktu, nebo validovat přes bezpečný lookup s fallbackem místo `as`.

[SEVERITY: Low] [FILE: apps/web/features/automations/components/TriggerFields.tsx:69] [CATEGORY: typing]
`onValueChange={(v) => form.setTriggerType(v as TriggerType)}` přetypovává obecnou hodnotu ze `SegmentPickerField` bez runtime kontroly proti množině `TriggerType`.
Zúžit typ pomocí type-guardu nebo generického `SegmentPickerField<TriggerType>` místo `as`.

[SEVERITY: Low] [FILE: apps/web/features/automations/components/AutomationFormDialog.tsx:26-29] [CATEGORY: business-logic-in-component]
`deriveName(text)` je čistá textová transformační funkce definovaná přímo v komponentě, mimo sdílený util modul — funkčně v pořádku, ale netestovaná samostatně a umístěná mimo konvenci "business logika mimo komponentu".
Přesunout do util souboru (např. vedle `slug.ts`) a pokrýt jednotkovým testem.

[SEVERITY: Low] [FILE: apps/web/features/automations/components/AutomationCard.tsx:84-115] [CATEGORY: business-logic-in-component]
Odvození `scheduleText`, `next`, `lastLabel`, `nextLabel`, `targetText` je netriviální prezentační logika vsazená přímo do render těla komponenty (byť dobře komentovaná a pod 300 řádků).
Zvážit extrakci do malého view-model hooku (např. `useAutomationCardView(automation, locale, now)`) pro snazší izolované testování.

[SEVERITY: Low] [FILE: apps/web/features/automations/ (multiple)] [CATEGORY: test-coverage]
AutomationFormDialog.tsx, AutomationFormFields.tsx, TriggerFields.tsx, useCronLabel.ts a query hooky (useAutomationQuery/useAutomationsQuery/useAutomationsSearchQuery) nemají vlastní test soubor — pokrytí jde jen nepřímo přes Screen.test.tsx / DetailScreen.test.tsx / AutomationCard.test.tsx.
Doplnit alespoň úzké testy pro `useCronLabel` (formátovací větve) a `AutomationFormFields`/`TriggerFields` validaci.

STATS: files=19, total_lines=2180, top3=[schedule.ts:352, components/AutomationCard.tsx:278, DetailScreen.tsx:214]

---
BATCH: web-chat-components

[SEVERITY: High] [FILE: apps/web/features/chat/components/ChatScreen.tsx:148-748] [CATEGORY: Component size]
ChatScreen je 748 řádků a kombinuje top-bar, scanline/grid dekorace, scénu, tasks panel, task-detail column, composer, palette a detail dialog v jedné funkci s ~15 useState/useRef a ~10 odvozenými hodnotami.
Rozděl na podkomponenty (např. ChatScreenTopBar, ChatScreenComposer) a vytáhni orchestraci stavu do vlastního hooku (např. useChatScreenState), aby zůstal jen kompoziční shell.

[SEVERITY: High] [FILE: apps/web/features/chat/components/ChatScreen.tsx:460-479] [CATEGORY: Business logic in component]
Odvození `SceneMode` (dlouhý vnořený ternární řetězec kombinující error/waiting-approval/tool/streaming/thinking/speaking/listening stavy z pěti různých zdrojů) je čistá byznys logika napsaná přímo v render těle komponenty.
Vytáhni do samostatné čisté funkce/hooku (např. `deriveSceneMode` ve `scene/`), aby šla jednotkově testovat bez renderu celé obrazovky.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:353-378] [CATEGORY: Duplicate pattern — event listener]
Dva téměř identické `useEffect` bloky ručně registrují `window.addEventListener("keydown", ...)` (Escape pro paletu, ⌘K pro otevření palety) — ad-hoc listener pattern místo sdíleného hooku; v repu neexistuje `useKeyboardShortcut`/`useHotkey` hook.
Zaveď sdílený `useKeyboardShortcut`/`useHotkey` hook a nahraď oba efekty jedním voláním na komponentu.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:481-482] [CATEGORY: Duplicate/util miss]
`timeStr` je ručně sestaven přes `padStart` (`HH:MM`) místo použití existujícího, locale-aware `clockTime(iso, locale)` util z `apps/web/utils/time.ts`, který projekt už jednou opravoval kvůli přesně tomuto UTC/locale bugu (viz phase-9 rail timezone fix).
Nahraď ruční formátování voláním `clockTime`.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:598-602,ChatTaskDetailColumn.tsx:65-69] [CATEGORY: Duplicate pattern — layout]
Vzor „vnější `pointer-events-none absolute inset-y-0 ... lg:flex` wrapper + vnitřní `pointer-events-auto`" pro doky/panely je copy-pasted mezi ChatScreen (gutter panelu úkolů) a ChatTaskDetailColumn (a dle komentářů i SubsystemDrawer mimo batch) s ručně psanými Tailwind třídami přímo v `apps/web`, což je proti konvenci „apps/web nepíše vlastní Tailwind třídy".
Zobecni do sdílené DS/local primitivy (např. `DockedColumn`) parametrizované stranou/šířkou.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatScreen.tsx:536-556] [CATEGORY: Duplicate pattern — raw button]
Tlačítka "New chat" a "Close" jsou raw `<button>` prvky se stejným dlouhým řetězcem Tailwind tříd duplikovaným doslovně na obou místech, místo DS `Button`/`IconButton` kompozice.
Nahraď DS `Button` variantou (ghost/outline) se sdílenou konfigurací, ať se třídy nepíší ručně a neduplikují.

[SEVERITY: Medium] [FILE: apps/web/features/chat/components/ChatPalette.tsx:82,90,101,111; TargetIdentity.tsx:13; ChatDetailDialog.tsx:56] [CATEGORY: Typing — repeated cast]
Vzor `(x.glyph as IconName | undefined) ?? "bot"` (resp. `"flow"/"wait"/"brain" as IconName`) se opakuje identicky na 6+ místech napříč třemi soubory — doménové typy (`Agent.glyph`, `TaskTarget.glyph`) nesou `glyph` jako obyčejný `string`, takže každé místo spotřeby musí přetypovávat ručně.
Zaveď jeden sdílený helper (např. `asIconName(glyph, fallback)`) nebo zpřísni typ `glyph` už v kontraktu, aby se cast nemusel opakovat.

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatPalette.tsx:43-47] [CATEGORY: Duplicate pattern — filter logic]
`matchesQuery` je lokální case-insensitive substring filtr, jehož vlastní komentář říká, že „mirrors CommandLine's mention-picker filter" — tedy stejná logika už existuje jinde v `CommandLine` (mimo tento batch), ale je re-implementovaná zde.
Vytáhni sdílený `matchesQuery`/`fuzzyIncludes` util a importuj na obou místech místo dvou nezávislých kopií.

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatScreen.tsx:663-685] [CATEGORY: Prop drilling]
`ChatTaskDetailColumn` dostává 11 jednotlivě rozbalených props (`run`, `glyph`, `avatar`, `now`, `onStop`, `stopping`, `onDelete`, `deleting`, `onResume`, `resuming`, `onClose`) místo předání již existujícího `runActions` objektu (z `useRunActions`) a `selectedRun` jako celků.
Zvaž seskupení do `runActions`/`run` objektových props, ať se rozhraní komponenty nerozpadá při každé další akci.

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatButton.tsx, ChatTranscript.tsx] [CATEGORY: Test coverage]
Tyto dva soubory nemají vlastní `.test.tsx` (na rozdíl od všech ostatních komponent v adresáři) — `ChatTranscript` navíc obsahuje netriviální podmínku `hasLive` řídící přechod live bubliny na commitnutou zprávu.
Doplň testy zejména pro `ChatTranscript`'s live→commit přechod (riziko duplicitního/chybějícího bublinu).

[SEVERITY: Low] [FILE: apps/web/features/chat/components/ChatRunCard.tsx:51-88] [CATEGORY: Business logic in component file]
`runProgress` a `runDetail` jsou needexportované čisté transformační funkce (progress caption, výběr detail komponenty) umístěné přímo v souboru komponenty místo v `runs`-doménovém util modulu, takže je nelze samostatně jednotkově testovat mimo render.
Přesuň do `features/runs/run.ts` (kde už žijí `runAvatar`/`runGlyph`/`runTitle`) a exportuj pro přímé testování.

STATS: 13 zdrojových souborů (bez testů), 1985 řádků zdrojového kódu (celkem včetně testů 3669 řádků napříč 24 soubory). Top 3 nejhorší podle počtu řádků: ChatScreen.tsx (748, zdroj), ChatScreen.test.tsx (647, test), ChatMessage.test.tsx (264, test) — mezi zdrojovými soubory po ChatScreen následují ChatMessage.tsx (195) a ChatRunCard.tsx (195).

---
BATCH: web-chat-core

[SEVERITY: Medium] [FILE: apps/web/features/chat/hooks/useAutoSpeak.ts:1-331] [CATEGORY: Component/file splitting]
Soubor má 331 řádků a mísí tři odlišné odpovědnosti v jednom modulu: čisté chunkovací funkce (hardSplit, chunkForSpeech), stavový přehrávací kontrolér (SpeakSession, ensureSynth/finish/abandon/discard/stop/fail/playChunk) a samotný React hook.
Doporučení: Vytáhnout chunkForSpeech/hardSplit do samostatného pure-util modulu a SpeakSession kontrolér do vlastní továrny mimo hook, useAutoSpeak nechat jako tenký React wrapper.

[SEVERITY: High] [FILE: apps/web/features/chat/hooks/useAutoSpeak.ts:196-201] [CATEGORY: Fetch logika mimo TanStack Query hook]
Hook volá `apiClient.speech.synthesize.mutate(...)` přímo, přestože v `mutations/useSynthesizeSpeechMutation.ts` už existuje dedikovaný mutation hook pro stejný endpoint — vzniká duplicitní fetch cesta mimo konvenci per-domain hooků a mimo centrální `MutationCache.onError` toast.
Doporučení: Volat mutaci přes `useSynthesizeSpeechMutation()` (např. `mutateAsync` uložené v ref pro stabilní identitu kontroléru) místo přímého `apiClient` volání.

[SEVERITY: Medium] [FILE: apps/web/features/chat/hooks/useChatStream.ts:132] [CATEGORY: Chybějící typování]
`JSON.parse(event.data) as ChatTurnEvent` přetypuje nedůvěryhodná SSE data bez runtime validace — poškozený nebo neúplný frame projde beze změny a přistupuje se k jeho polím (`parsed.turnId`, `parsed.tool`) jako by byla garantovaná.
Doporučení: Validovat parsovaný payload proti zod schématu (nebo alespoň type guardu) před přetypováním na ChatTurnEvent.

[SEVERITY: Medium] [FILE: apps/web/features/chat/hooks/useAutoSpeak.ts:167-183; apps/web/features/chat/hooks/useSpeechRecognition.ts:71-78; apps/web/features/chat/hooks/useChatStream.ts:113-116] [CATEGORY: Duplicitní vzor napříč soubory]
Vzor "udržet poslední hodnotu v ref, aby se nerebuildoval stabilní callback" (tRef/voiceRef/onSettledRef, langRef/onFinalRef/onErrorRef, handlersRef) je ručně opakovaně implementován ve třech hoocích bez sdílené abstrakce.
Doporučení: Vytáhnout sdílený `useLatestRef<T>(value: T)` hook a použít ho na všech třech místech.

[SEVERITY: Medium] [FILE: apps/web/features/chat/ChatContext.tsx:29-33,89,98-105] [CATEGORY: Duplicitní vzor napříč soubory]
SSR-guarded čtení z localStorage + synchronizační effect je zde znovu napsán od nuly; stejný vzor je duplicitně (ad hoc) implementován i v `MainLayout.tsx` a `settings/Screen.tsx` jinde v appce.
Doporučení: Vytáhnout sdílený `usePersistedState(key)` hook a nahradit jím všechny tři výskyty.

[SEVERITY: Low] [FILE: apps/web/features/chat/ChatContext.tsx:135-147] [CATEGORY: Business logika v komponentě]
Globální ⌘/Ctrl+J keydown listener je zapojen přímo v provideru přes syrový `window.addEventListener` efekt namísto znovupoužitelného shortcut hooku.
Doporučení: Vytáhnout drobný `useGlobalShortcut(key, handler)` hook, aby modifier/key-matching logika nebyla inline v provideru.

[SEVERITY: Low] [FILE: apps/web/features/chat/Screen.tsx:43-49] [CATEGORY: Business logika v komponentě]
Hydratace transkriptu (ref-guarded one-shot seed conversationId/messages z query) je inline useEffect logika přímo v route-level komponentě místo pojmenovaného, samostatně testovatelného hooku.
Doporučení: Vytáhnout do `useHydrateChatTranscript(transcript, setConversationId, setMessages)`.

[SEVERITY: Low] [FILE: apps/web/features/chat/hooks/usePrefersReducedMotion.ts:1-23] [CATEGORY: Chybějící abstrakce/generalizace]
Obecný browser-capability hook bez jakékoli chat-specifické závislosti leží pod features/chat/hooks; aktuálně má jen jednoho konzumenta, ale nic ho k chatu neváže.
Doporučení: Až přibude druhý konzument (např. jiná WebGL/motion-sensitive komponenta), přesunout do sdíleného umístění (apps/web/hooks nebo libs/design-system) místo duplikace.

STATS: 22 souborů (root + hooks + mutations + queries, včetně testů), celkem 2646 řádků. Top 3 podle velikosti: hooks/useAutoSpeak.test.tsx (433), hooks/useAudioPlayback.test.ts (336), hooks/useAutoSpeak.ts (331).

---
BATCH: web-chat-scene

[SEVERITY: High] [FILE: apps/web/features/chat/scene/sceneController.ts:253] [CATEGORY: file-size/single-responsibility]
`createSceneController` is a single ~745-line closure (lines 253–997, file total 1006) that owns renderer/camera setup, mini-orb construction, net-geometry buffer building, the mitosis entry animation (collapse/apply/finish), projection plumbing, resize, the frame-budget/throttle decision, the RAF loop, and the returned public API — far too much in one function to navigate or test in isolation.
Doporučení: Extract cohesive builders (`buildNet`, `createMiniOrbs`, `createEntryAnimation`, `createProjector`) into sibling modules and have the controller compose them.

[SEVERITY: High] [FILE: apps/web/features/chat/scene/CosmicScene.tsx:128] [CATEGORY: business-logic-in-component]
The mount effect (~105 lines) inlines heavy imperative side-effect logic: the three-source visibility gate (visibility/blur/focus), an IntersectionObserver, the dynamic `import()` + controller lifecycle, dev-only `window` exposure, and full teardown — all in the component body behind an `exhaustive-deps` disable.
Doporučení: Move it into a dedicated `useCosmicSceneController` hook so the component stays a thin shell and the lifecycle logic is independently testable.

[SEVERITY: Medium] [FILE: apps/web/features/chat/scene/backgroundLayer.ts:259] [CATEGORY: file-size/single-responsibility]
`createBackgroundLayer` (501-line file) mixes two large GLSL shader strings, the half-res render-target/upscale pass, and full construction of the node-web/proximity-lines/dust geometry in one function.
Doporučení: Split the node-web (pass 2) construction into its own builder and consider moving the sky/upscale shaders alongside `glsl.ts`.

[SEVERITY: Medium] [FILE: apps/web/features/chat/scene/CosmicScene.tsx:242] [CATEGORY: duplication/missing-hook]
The prev-value diffing for `streamChars` (prevChars ref) and `completedTick` (prevTick ref) is two near-identical inline effects computing a delta against a ref.
Doporučení: Extract a small `usePreviousDelta`/`useIncrementCallback` hook and reuse for both signals.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/dockLayer.ts:79] [CATEGORY: performance/cleanup]
`makeChip` (line 79) and `setItems` (line 101) schedule `requestAnimationFrame` callbacks whose ids are never stored or cancelled; on `dispose()` a pending rAF still fires (`this.measure()` runs `getBoundingClientRect` after the map is cleared, fade-in writes style on a detached node). Harmless today but an uncancelled-rAF pattern.
Doporučení: Track the rAF id and `cancelAnimationFrame` it in `dispose`.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/tokens.ts:89] [CATEGORY: duplication]
The "read a CSS var via `getComputedStyle` once, then cache in a module-level `let x = null`" pattern is duplicated three times (`resolveSceneTokens`, `resolvePipelineAccentHex`, `resolveForegroundFaintHex`), each with its own cache var and test-reset seam.
Doporučení: Factor a `memoizedCssVar(name, fallback)` helper and derive the three resolvers from it.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/orbLayer.ts:218] [CATEGORY: performance]
`update()` calls `resolveSceneTokens()` on every frame for every orb (central + 8 minis ≈ 9 calls/frame); it is cached so cost is trivial, but the resolved token record could be captured once at factory time since it never changes for a given mount.
Doporučení: Resolve tokens once in `createOrbLayer` and close over the result instead of re-fetching per frame.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx:133] [CATEGORY: performance/memoization]
The `ordered` roster (`filter` + `sort`) is recomputed on every React render, and the per-node `ref` callbacks (lines 163, 192) are fresh closures each render, forcing React to run ref detach/attach cycles. Negligible at 8 nodes, but avoidable.
Doporučení: `useMemo` the `ordered` array and hoist stable ref-setter callbacks (or use a `useCallback`-keyed map).

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx:111] [CATEGORY: correctness/edge-case]
The label/badge fade-in effect only re-runs on `reducedMotion` change; subsystems added to the feed after mount get no `opacity: 0` seed and skip the delayed fade (they pop in at full opacity), and their new `fadeRefs` entries are never initialised.
Doporučení: Seed opacity per-node on mount (e.g. inline initial style or an effect keyed on the node set) rather than a one-shot list-wide effect.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/CosmicScene.tsx:180] [CATEGORY: typing]
`window` is reached via `window as unknown as { __cosmicScene?: SceneController }` at three sites (180, 226) and similar `as unknown as {...}` feature-detect casts appear in `canMountWebGL.ts:20-23`.
Doporučení: Declare a typed `global`/`Window` augmentation for `__cosmicScene` and the WebGL globals so the casts disappear.

[SEVERITY: Low] [FILE: apps/web/features/chat/scene/ringsLayer.ts:89] [CATEGORY: duplication]
The exponential damping easing `x += (target - x) * (1 - Math.exp(-dt * RATE))` is reimplemented inline here, in `orbLayer.ts` (`damp`, line 141), and as `glowColor.lerp(..., 1 - Math.exp(-dt*4))` in `backgroundLayer.ts:445`.
Doporučení: Share a single `damp(current, target, dt, rate)` util across the layers.

STATS:
- Source files analyzed: 16 (3980 lines); plus 6 test files (1306 lines) reviewed for coverage only. 23 files total in batch.
- Top 3 largest source files: sceneController.ts (1006), backgroundLayer.ts (501), CosmicScene.tsx (320).
- Overall: mature, exceptionally well-documented WebGL code with disciplined RAF/geometry/material disposal (`dispose()` is thorough — no real memory leaks found) and strong throttle/park test coverage. Main debt is concentration of logic in two oversized units (`sceneController.ts` factory, `CosmicScene.tsx` mount effect); remaining items are minor perf/duplication polish.

---
BATCH: web-companies

POZN. ORCHESTRÁTORA: dva nálezy níže označené jako Critical jsou reálně High/Medium (extrakce komponenty a duplikace UI komponenty nejsou bezpečnostní/produkční riziko) — při agregaci normalizovat. Duplikace PersonRow napříč companies/projects je ale potvrzená i z batche web-projects-core (PersonRow + 9 label props tam hlášen nezávisle).

[SEVERITY: Critical] [FILE: apps/web/features/companies/DetailScreen.tsx:53-110] [CATEGORY: Component size / Extraction]
PersonRow komponenta (58 řádků) je definovaná v DetailScreen.tsx a měla by být extrahovaná do samostatného souboru. Sníží se tím velikost DetailScreen z 339 na ~280 řádků. (Reálná severity: Medium)
Vytvořit `components/PersonRow.tsx`, přesunout PersonRow i PersonRowProps, importovat v DetailScreen.

[SEVERITY: Critical] [FILE: apps/web/features/companies/DetailScreen.tsx:53-110, apps/web/features/projects/ProfileScreen.tsx:127-176] [CATEGORY: Code duplication]
PersonRow komponenta se opakuje v companies/DetailScreen.tsx i v projects/ProfileScreen.tsx (identický kód). Měla by být extrahovaná do sdíleného místa. (Reálná severity: High)
Vytvořit sdílený PersonRow v `apps/web/components/` a importovat z obou míst.

[SEVERITY: High] [FILE: apps/web/features/companies/DetailScreen.tsx:204-219] [CATEGORY: Prop drilling]
PersonRow přijímá 11 propů (labely/placeholdery) pokaždé ze `useTranslations()` v rodičovi. PersonRow by měl přímo volat `useTranslations("companies")`, místo aby je přijímal jako props.
Přesunout `useTranslations()` do PersonRow, zjednoduší se callsite ze 14 propů na 3 (person, onChange, onRemove).

[SEVERITY: High] [FILE: apps/web/features/companies/CompanyBasicsPanel.tsx:35-45, apps/web/features/projects/components/ProjectBasicsPanel.tsx:85-96] [CATEGORY: Code duplication]
Funkce `toPositiveInt()` a `toPositiveFloat()` se opakují na dvou místech s identickým kódem.
Vytvořit `apps/web/utils/budgetParsers.ts` a importovat v obou panelech.

[SEVERITY: High] [FILE: apps/web/features/companies/CompanyBasicsPanel.tsx:102-119, apps/web/features/projects/components/ProjectBasicsPanel.tsx:120-140] [CATEGORY: Code duplication]
Transformace budgetových polí (parsování stringů na budget objekt) se opakuje mezi Company a Project BasicsPanel.
Vytvořit utility `buildBudgetFromValues(values)` v `utils/budgetTransform.ts`, sdílet oběma panely.

[SEVERITY: High] [FILE: apps/web/features/companies/DetailScreen.tsx:239, apps/web/features/companies/LinkProjectDialog.tsx:40] [CATEGORY: Code duplication / Pattern]
Filtrování projektů se opakuje: DetailScreen filtruje `companyId === id`, LinkProjectDialog `companyId !== companyId`.
Vytvořit `projectFilters.ts` s `getLinkedProjects(projects, companyId)` a `getUnlinkedProjects(projects, companyId)`.

[SEVERITY: Medium] [FILE: apps/web/features/companies/CompanyBasicsPanel.tsx:1-238] [CATEGORY: Component size]
CompanyBasicsPanel je 238 řádků (blízko 300). Obsahuje 7 form fields pro budget (řádky 174-219), které by mohly být extrahované do `BudgetFieldsPanel` subkomponenty.
Vytvořit `components/BudgetFieldsPanel.tsx`, extrahovat řádky 167-219.

[SEVERITY: Medium] [FILE: apps/web/features/companies/DetailScreen.tsx:167] [CATEGORY: Magic string]
Prefix "company-" ve fallback id (`slug(body.name) || company-${Date.now()}`) je hardkódnutý — stejný vzor jako `project-${Date.now()}` v projects (hlášeno v web-projects-core).
Sdílet `generateEntityId(prefix, name)` util.

STATS: 18 souborů (9 production, 9 testů), 876 řádků production kódu. Top 3: DetailScreen.tsx (339), CompanyBasicsPanel.tsx (238), LinkProjectDialog.tsx (108).

---
BATCH: web-components-a

[SEVERITY: High] [FILE: apps/web/components/EmptyState/EmptyState.tsx, apps/web/components/ConfirmDeleteDialog/ConfirmDeleteDialog.tsx, apps/web/components/DialogTitle/DialogTitle.tsx, apps/web/components/HudCard/HudCard.tsx, apps/web/components/HudPanel/HudPanel.tsx, apps/web/components/Collection/Collection.tsx] [CATEGORY: design-system-promotion]
Šest komponent je čistě prezentačních, skládají se výhradně z DS primitiv (`Card`, `Stack`, `IconTile`, `Typography`, `Grid`…), neobsahují žádnou app-specifickou logiku ani i18n závislost a jsou znovupoužívány napříč 15+ feature moduly. `HudCard` má dokonce komentář "Dumb by design". `libs/design-system` neobsahuje ekvivalent (ověřeno grepem).
Doporučení: přesunout do `libs/design-system` jako generické primitivy/composite komponenty s Storybook + testid enum podle DS konvencí.

[SEVERITY: Medium] [FILE: apps/web/components/CategoryDialog/CategoryDialog.tsx:6] [CATEGORY: coupling/naming]
Komponenta je v docstringu popsána jako "resource-agnostic" a sdílená napříč katalogy (agents, skills, projects), ale natvrdo importuje `AGENT_GLYPHS` z `state/config` místo toho, aby seznam glyphů dostávala jako prop.
Doporučení: přidat prop `glyphs: IconName[]` a volat CategoryDialog s catalog-specifickým seznamem.

[SEVERITY: Medium] [FILE: apps/web/components/DialogFormFooter/DialogFormFooter.tsx:1-35] [CATEGORY: duplicate-pattern]
Na rozdíl od sourozeneckých sdílených dialog komponent (`ConfirmDeleteDialog`, `CategoryDialog`), které dostávají popisky přes props, `DialogFormFooter` si sám volá `useTranslations()` — nekonzistentní vzor ztěžuje promotion do DS (DS má být i18n-agnostic).
Doporučení: sjednotit na prop-driven labels (`cancelLabel`, `saveLabel`, `deleteLabel`) po vzoru `ConfirmDeleteDialog`.

[SEVERITY: Medium] [FILE: apps/web/components/CategoryDialog/CategoryDialog.tsx] [CATEGORY: missing-tests]
Chybí testový soubor — komponenta obsahuje netriviální logiku (duplicate-name guard, glyph picker se stavem, `canSubmit` derivace).
Doporučení: doplnit `CategoryDialog.test.tsx` pokrývající duplicitní jméno, výběr glyphu a submit/cancel.

[SEVERITY: Medium] [FILE: apps/web/components/DialogFormFooter/DialogFormFooter.tsx] [CATEGORY: missing-tests]
Chybí testový soubor — podmíněné renderování Delete tlačítka (`!isNew && onDelete`) a `disabled={!canSave}` logika nejsou ověřeny.
Doporučení: doplnit test pro create/edit režimy a canSave gating.

[SEVERITY: Low] [FILE: apps/web/components/DialogTitle/DialogTitle.tsx] [CATEGORY: missing-tests]
Triviální prezentační komponenta bez testu; nízké riziko, ale znovupoužívaná.
Doporučení: volitelně doplnit render test při promotion do DS.

[SEVERITY: Low] [FILE: apps/web/components/HudPanel/HudPanel.tsx:2] [CATEGORY: type-import]
`CardProps` je importován bez `type` klíčového slova, ačkoliv je použit pouze jako typ (`CardProps["tone"]`).
Doporučení: `import { Card, type CardProps, ... }`.

[SEVERITY: Low] [FILE: apps/web/components/EntityFormModal/EntityFormModal.tsx:58] [CATEGORY: style-consistency]
`open={true}` místo zkráceného booleovského `open`, jak je konzistentně jinde.
Doporučení: sjednotit na `open` shorthand.

STATS: files=24, total_lines=1292, top3=[HudCard.tsx (138), CategoryDialog.tsx (118), EntityFormModal.tsx (92)] — žádný soubor nepřekračuje 300 řádků.

---
BATCH: web-components-b

[SEVERITY: Critical] [FILE: apps/web/components/LoadingScreen/LoadingScreen.tsx, BrandMark.tsx, CircuitTraces.tsx, Corner.tsx, StatusLine.tsx, Wordmark.tsx, BootProgress.tsx] [CATEGORY: custom Tailwind on DOM]
Sedm souborů v apps/web přímo vypisuje desítky raw Tailwind utility tříd (`fixed inset-0 z-50 overflow-hidden bg-background font-mono...`) na holých `div`/`span`/`svg` uzlech místo skládání z DS primitiv — porušuje "apps/web nikdy nepíše vlastní Tailwind třídy". Souborová `eslint-disable react/forbid-dom-props` řeší jen `style`, className zůstává zcela mimo lint dohled.
Doporučení: přesunout boot-splash vizualizaci (nebo alespoň strukturální obálky) do libs/design-system jako dedikovanou komponentu s vlastním API.

[SEVERITY: High] [FILE: apps/web/components/layout/SkipLink/SkipLink.tsx:20-24] [CATEGORY: custom Tailwind na DOM]
Raw `<a>` s dlouhým literálem `className="sr-only focus:not-sr-only focus:fixed focus:top-3 ..."` — kompletně mimo DS.
Doporučení: povýšit do libs/design-system jako `SkipLink`/`VisuallyHidden` primitivu s tokenizovanými focus styly.

[SEVERITY: High] [FILE: apps/web/components/layout/GlobalSearch/useGlobalSearch.ts, GlobalSearch.tsx] [CATEGORY: chybějící testy]
155řádkový hook (debounce, agregace 5 zdrojů, ⌘K handling, navigace) i wrapper komponenta nemají žádný test soubor — nejrozsáhlejší netestovaná logika v tomto batchi.
Doporučení: doplnit unit testy na `useGlobalSearch` (debounce, sections, handleSelect) a integrační test na `GlobalSearch`.

[SEVERITY: Medium] [FILE: apps/web/components/layout/GlobalSearch/useGlobalSearch.ts:14-21] [CATEGORY: duplicitní vzor / drift]
Lokální `ROUTES` mapa duplikuje cesty už definované v `apps/web/state/config.ts` `NAV_ITEMS`. Dva nezávislé zdroje pravdy pro "kam vede entita X".
Doporučení: odvodit `ROUTES` z `NAV_ITEMS`/`state/config.ts`.

[SEVERITY: Medium] [FILE: apps/web/components/layout/TopBar/SelfFreshness.tsx:100-171, apps/web/components/layout/LimitsRings/LimitsRings.tsx:38-84] [CATEGORY: duplicitní vzor]
Identický hover/focus popover vzor (onBlur/onFocus/onMouseEnter/onMouseLeave + absolutně umístěná Card, zIndex 60) doslovně zopakovaný ve dvou komponentách.
Doporučení: extrahovat sdílený `useHoverPopover()` hook nebo DS `Popover`/`HoverCard` primitivum.

[SEVERITY: Medium] [FILE: apps/web/components/layout/TopBar/SelfFreshness.tsx:38-48, apps/web/components/layout/LimitsRings/LimitsRings.tsx:14-19] [CATEGORY: duplicitní vzor]
Obě komponenty ručně definují stejný "fallback shape, dokud query nedoběhne" vzor (FALLBACK_STATUS, CLAUDE_LIMITS).
Doporučení: sjednotit přes `placeholderData` v TanStack Query nebo sdílený util.

[SEVERITY: Medium] [FILE: apps/web/components/layout/MainLayout/MainLayout.tsx:66,71,110; apps/web/components/layout/Sidebar/Sidebar.tsx:24] [CATEGORY: chybějící DS prop / raw style]
Raw `style={{ width: 224/324, backgroundColor: "var(--color-background-deep)" }}` a `style={{ display:"flex", flexDirection:"column", minHeight:0 }}` opakovaně obchází sealed sizing API. DS má `minW0`, ale ne výškový ekvivalent.
Doporučení: přidat `minH0`/šířkové tokeny do `Stack`/`Container` v DS.

[SEVERITY: Medium] [FILE: apps/web/components/layout/TopBar/SelfFreshness.tsx:1-173] [CATEGORY: business logika v komponentě]
Mutation handling, parsování chybové zprávy, retry-attempt state a toast emitování žijí přímo v komponentě spolu s renderem.
Doporučení: extrahovat do `useSelfUpdate()` hooku (features/self).

[SEVERITY: Low] [FILE: apps/web/components/layout/BootSplash/BootSplash.tsx] [CATEGORY: business logika v komponentě / chybějící testy]
Ruční RAF animační smyčka s ease-out křivkou a min-visible logikou je vnořená přímo v useEffect; žádný test časovací logiky.
Doporučení: extrahovat do `useBootProgress(minVisibleMs)` hooku a pokrýt testem s fake timers.

[SEVERITY: Low] [FILE: apps/web/components/LoadingScreen/constants.ts:3] [CATEGORY: netokenizované barvy]
`ACCENT = "rgba(91,141,239,1)"` a gradienty natvrdo mimo token systém (konvence je useTokens() pro SVG/canvas), spotřebované napříč šesti soubory.
Doporučení: přesunout přes theme token / useTokens().

[SEVERITY: Low] [FILE: apps/web/components/layout/TopBar/TopBar.tsx:35,44] [CATEGORY: raw style na DS komponentě]
`style={{ height: "100%" }}` na Stack a `style={{ flex: "0 1 360px", margin: "0 auto" }}` na Container — statické ad-hoc hodnoty, ne "genuinely dynamic".
Doporučení: zvážit DS prop pro "centered flexible column".

[SEVERITY: Low] [FILE: apps/web/components/Toaster/Toaster.tsx:24-31] [CATEGORY: chybějící cleanup]
Každý toast zakládá vlastní `setTimeout` bez uchování reference a bez clearnutí při unmountu — jen `unsubscribe` je uklizen. Riziko nízké (Toaster se neodmountuje), ale nekonzistentní s cleanup disciplínou.
Doporučení: sbírat timer handly a mazat je v cleanup funkci efektu.

STATS: 69 souborů, 3336 řádků celkem. Top 3 (bez test/stories): layout/TopBar/SelfFreshness.tsx (173), layout/GlobalSearch/useGlobalSearch.ts (155), LoadingScreen/LoadingScreen.tsx (142).

---
BATCH: web-feat-tiny

[SEVERITY: High] [FILE: apps/web/features/goals/mutations/useResumeGoalRunMutation.ts:7-11] [CATEGORY: Convention Violation]
Inline kóduje `useQueryClient()` + `useMutation()` s `onSuccess` namísto abstrakce `makeInvalidatingMutation()`, kterou používá ~40 ostatních mutations v projektu. Invaliduje jen jeden queryKey, takže abstrakce by se měla bez problémů použít. (Reálná severity spíš Medium — konzistence, ne riziko.)
Doporučení: Migrovat na `makeInvalidatingMutation(apiClient.taskRuns.resumeTaskRun.useMutation, allTaskRunsKey)`.

[SEVERITY: Medium] [FILE: apps/web/features/notifications/useNotifications.ts:13-22] [CATEGORY: Business Logic in Hook]
Hook destructuruje výsledky tří queries a aplikuje `selectNotifications()` transformaci přímo; vrací array přímo místo useQuery objektu — nestandardní rozhraní.
Doporučení: Zvážit umístění logiky / zdokumentovat vzor kompozitního hooku.

[SEVERITY: Low] [FILE: apps/web/features/approvals/queries/useApprovalsQuery.ts:16-18] [CATEGORY: Custom Select Function]
Používá vlastní `selectApprovals()` select namísto `selectApiResponseBody`. Funkčně správně (rozšíření schématu), ale odchylka od vzoru.
Doporučení: Ponechat, jen zdokumentovat proč.

[SEVERITY: Low] [FILE: apps/web/features/machine/mutations/useUpdateMachineConfigMutation.ts:13-20] [CATEGORY: Multiple Invalidations]
Invaliduje dva queryKeys místo jednoho, proto nemůže používat `makeInvalidatingMutation()`. Pattern je oprávněný.
Doporučení: Žádná akce potřebná.

STATS: 21 souborů (bez index.ts), 514 řádků bez testů. Top 3: notifications/notificationRules.ts (57), health/queries/useHealthQuery.ts (31), pins/components/PinButton.tsx (30). Tiny features jsou celkově čisté a drží konvence.

---
BATCH: web-gates-approvals

[SEVERITY: High] [FILE: apps/web/features/approvals] [CATEGORY: test-coverage]
Celá approvals feature (approval.ts, ApprovalPreview, RiskBadge, SeverityMeter, useApprovalsQuery, useApproveMutation, useRejectMutation) nemá žádný test soubor, přestože jde o schvalovací/zamítací tok s vysokým rizikem (platba/mazání) a `parseApprovalDetail` obsahuje netriviální JSON parsing/fallback logiku.
Doporučení: přidat alespoň unit testy pro `parseApprovalDetail` (fallback na plain text) a smoke test pro `ApprovalPreview` per preview kind.

[SEVERITY: Medium] [FILE: apps/web/features/approvals/approval.ts:79-94] [CATEGORY: typing]
`parseApprovalDetail` po slabé heuristické kontrole (`"preview" in data || "riskType" in data || "summary" in data`) provede `data as ApprovalEnrichment` bez schema validace — malformovaný/neúplný `detail` JSON od runneru projde beze změny a může způsobit, že se pro high-risk schválení (platba/mazání) zobrazí nesprávný nebo neúplný preview.
Doporučení: validovat enrichment JSON přes zod schema místo prostého type-castu.

[SEVERITY: Medium] [FILE: apps/web/features/gates/components/GateRulesSection.tsx:93] [CATEGORY: typing]
`(a.glyph as IconName | undefined) ?? "bot"` castuje libovolný string z API na `IconName` bez validace.
Doporučení: validovat proti známé sadě IconName (whitelist/lookup) místo přímého castu.

[SEVERITY: Medium] [FILE: apps/web/features/approvals/components/ApprovalPreview.tsx:50-52,88,110,123] [CATEGORY: design-system]
Barvy pro diff/cart preview jsou hardcodované jako `rgba(...)` literály místo `var(--color-*)` tokenů, které jinde v obou featurách (RuleCard, RuleParts, SeverityMeter) jsou používány důsledně.
Doporučení: nahradit hardcoded rgba hodnoty semantic color CSS proměnnými (ok/bad/warn dim varianty).

[SEVERITY: Medium] [FILE: apps/web/features/gates/components/RuleCard.tsx:38 a apps/web/features/gates/components/GlobalRuleCard.tsx:76] [CATEGORY: duplication]
Identický vzor `borderLeft: 3px solid meta.cssVar` + `eslint-disable-next-line react/forbid-dom-props` je duplikovaný ve dvou souborech pro totožný účel (barevné odlišení podle decision).
Doporučení: extrahovat do sdílené obálky (např. `DecisionAccentCard`) v `RuleParts.tsx`.

[SEVERITY: Low] [FILE: apps/web/features/approvals/components/ApprovalPreview.tsx:171-172] [CATEGORY: ux-correctness]
Preview kind "command" vykresluje pro KAŽDÝ target ikonu `trash` s tónem `bad`, bez ohledu na skutečnou povahu příkazu — vizuálně naznačuje destrukci i u nedestruktivních akcí, což může matoucím způsobem ovlivnit rozhodování při schvalování.
Doporučení: řídit ikonu/tón podle skutečného risk typu approval, ne staticky "trash"/"bad".

[SEVERITY: Low] [FILE: apps/web/features/gates/queries/useGateRulesQuery.ts:17 a apps/web/features/gates/queries/useSystemPolicyQuery.ts:13] [CATEGORY: duplication]
Oba soubory duplikují stejný jednořádkový custom `select` (`(response) => response.body.rules`) namísto kompozice okolo sdíleného `selectApiResponseBody`.
Doporučení: sjednotit do jedné sdílené utility (např. `selectRulesBody`) v `gates/queries/`.

[SEVERITY: Low] [FILE: apps/web/features/gates/components/RuleModal.tsx:56-112] [CATEGORY: organization]
Čisté transformační funkce (`matchToFields`, `buildMatch`, `leafNode`, `buildResolve`) žijí v souboru komponenty místo v `gate.ts`, kde už existují analogické "read-side" transformace (`matchText`, `flattenResolve`) — logika read/write strany matcheru je rozdělena mezi dva soubory bez zjevného důvodu.
Doporučení: přesunout tyto pure funkce do `gate.ts`, komponenta zůstane jen na renderu formuláře.

[SEVERITY: Low] [FILE: apps/web/features/gates/components/RuleModal.tsx] [CATEGORY: file-size]
292 řádků, těsně pod 300řádkovou hranicí — kombinuje matcher-builder logiku, resolve-leaf editor a celý dialog v jednom souboru.
Doporučení: pokud poroste, vytáhnout resolve-leaf editor (~237-288) do samostatné subkomponenty `ResolveEditor`.

STATS: 29 souborů (27 s obsahem, 2 index re-exporty), celkem 1894 řádků. Top 3: gates/components/RuleModal.tsx (292), gates/components/GateRulesSection.tsx (224), approvals/components/ApprovalPreview.tsx (200).

---
BATCH: web-integrations

[SEVERITY: Medium] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:1-504] [CATEGORY: File size / separation of concerns]
Soubor kombinuje testid enum, 150řádkový custom hook `useIntegrationFormState` (state pro 5 druhů configu + build/validate logika) a 200řádkovou komponentu ve stejném souboru; 504 řádků je nejhorší v batchi.
Doporučení: rozdělit na `useIntegrationFormState.ts` (hook + typy `IntegrationFormState`) a `IntegrationFormFields.tsx` (jen komponenta + testid enum).

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:144-202] [CATEGORY: Business logika mimo util]
`buildConfig`/`configReady` obsahují per-kind transformační a validační pravidla (5 větví switch) přímo uvnitř hooku definovaného v komponentovém souboru, ne jako samostatná util funkce/soubor, což ztěžuje samostatné testování bez renderu formuláře.
Doporučení: vytáhnout `buildConfig`/`configReady` do čistých exportovaných funkcí v `integrationFormConfig.ts`, testovatelných bez React.

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:316] [CATEGORY: Chybějící typování]
`onValueChange={(v) => form.setKind(v as IntegrationKind)}` type-castuje hodnotu ze `SelectField` na union `IntegrationKind` bez běhové validace.
Doporučení: validovat/zúžit hodnotu (např. `Object.values` guard nebo generický `SelectField<IntegrationKind>`) místo přímého `as`.

[SEVERITY: Medium] [FILE: apps/web/features/integrations/components/InboxPanel.tsx:81-99] [CATEGORY: Duplicitní vzor]
`InboxPanel` a `NeedsAttentionPanel` (components/NeedsAttentionPanel.tsx:108-130) mají identickou kostru: `useChannelItemsQuery()` → filtr podle `projectId` → další filtr specifický pro panel → `reverse().slice(0, 12)` → early-return `null` při prázdném seznamu → `Container`+`HudPanel` wrapper. Číslo 12 i vzor "recent" jsou duplikované natvrdo ve dvou souborech.
Doporučení: vytáhnout sdílený hook `useRecentChannelItems(projectId, predicate, limit = 12)` do `queries/`, který oba panely použijí.

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:107-266] [CATEGORY: Komponenta na míru / obecnost]
Formulářová logika je psaná ručně (useState na 17 polí) místo přes `@zibby/forms` (RHF+zod adapter), který je standardní vrstva pro formuláře; validace (`idError`, `configReady`) se dělá ručně na každém keystroke.
Doporučení: zvážit migraci na `@zibby/forms` se zod schématem per-kind, pokud se přidá další kind nebo pole.

[SEVERITY: Low] [FILE: apps/web/features/integrations/components/IntegrationFormFields.tsx:283-504] [CATEGORY: Prop drilling]
Jediný `form: IntegrationFormState` prop nese 34 polí (17 hodnot + 17 setterů) — objekt je nadměrně široký pro jednu komponentu a znesnadňuje partial reuse (např. jen email podformulář).
Doporučení: pokud přibude další kind, rozklad `form` na per-kind pod-objekty nebo Context.

Pozitiva (bez nálezu): queries/ a mutations/ jsou vzorové (makeInvalidatingMutation / selectApiResponseBody + getXxxQueryKey), žádné `any`, žádné credentials v cache (`Integration` nese jen `hasCredentials: boolean`), žádné inline styly/vlastní Tailwind, žádné logování credentials. Testy explicitně ověřují, že secret/token nikdy neputuje v create/patch payloadu.

STATS: 24 souborů, 1780 řádků celkem. Top 3: components/IntegrationFormFields.tsx (504), DetailScreen.tsx (188), components/IntegrationFormDialog.test.tsx (152).

---
BATCH: web-mcp-chains-hooks

[SEVERITY: High] [FILE: apps/web/features/chains/Screen.tsx:49-282] [CATEGORY: File size / component splitting]
Screen.tsx (331 řádků) dělá čtyři věci najednou: katalogový list, master-detail panel vybraného řetězce, seznam běhů (run rows) a delete-confirm flow; navíc obsahuje dvě lokální podkomponenty (ChainCard, StepFlow) v témže souboru.
Rozdělit na samostatné soubory v `chains/components/`: `ChainCard.tsx`, `ChainDetailPanel.tsx` (hlavička + StepFlow) a `ChainRunsList.tsx`, po vzoru `mcp`/`hooks/components/`.

[SEVERITY: Medium] [FILE: apps/web/features/chains/Screen.tsx vs apps/web/features/mcp/DetailScreen.tsx, apps/web/features/hooks/DetailScreen.tsx] [CATEGORY: Duplicitní vzor / nekonzistentní architektura]
Stejný katalog+detail vzor je implementován dvěma různými způsoby: `mcp` a `hooks` mají oddělený `Screen` (katalog) a `DetailScreen` (edit stránka, N4e grammar), zatímco `chains` drží list i detail sloučené v jednom `Screen` volaném jak z `/chains`, tak z `/chains/[id]` přes `selectedId` prop.
Sjednotit chains na stejný katalog/`DetailScreen` vzor jako mcp a hooks, nebo explicitně zdůvodnit odchylku (dnes to vypadá jako nedokončená migrace na N4e).

[SEVERITY: Medium] [FILE: apps/web/features/chains/mutations/useStartChainMutation.ts:6] [CATEGORY: Mrtvý kód]
`useStartChainMutation` je exportován z `mutations/index.ts`, ale nikde v `apps/web` není volán — spouštění řetězce jde jinou cestou přes `useNewTask().open(...)` v `chains/Screen.tsx`.
Odstranit nepoužitý hook, nebo ho zapojit, pokud je to zamýšlené API.

[SEVERITY: Medium] [FILE: apps/web/features/mcp/components/McpServerFormDialog.tsx a apps/web/features/hooks/components/HookFormDialog.tsx] [CATEGORY: Chybějící ošetření stavu / double-submit riziko]
Na rozdíl od `NewChainDialog`, které přijímá `isPending` a blokuje submit po dobu mutace, `McpServerFormDialog` a `HookFormDialog` žádný pending stav nepředávají do `DialogFormFooter` — tlačítko Submit zůstává aktivní po celou dobu in-flight mutace a rychlý dvojklik může vyvolat duplicitní POST.
Přidat `isPending`/`loading` prop do obou dialogů a do `DialogFormFooter`.

[SEVERITY: Medium] [FILE: apps/web/features/chains/components/NewChainDialog.tsx:49-64] [CATEGORY: Business logika v komponentě]
Na rozdíl od mcp (`useMcpFormState`) a hooks (`useHookFormState`), kde je form-state, validace i payload-building extrahován do hooku, `NewChainDialog` drží state, validaci (`canSubmit`) i stavbu payloadu (vč. `slug(name)`) přímo v komponentě.
Extrahovat do `useChainFormState` hooku pro sjednocení vzoru napříč všemi třemi features.

[SEVERITY: Low] [FILE: apps/web/features/mcp (chybí index.ts) a apps/web/features/hooks (chybí index.ts)] [CATEGORY: Nekonzistentní architektura]
`chains/index.ts` deklaruje explicitní "public surface" feature; `mcp` a `hooks` agregační index nemají — cizí feature by musela importovat přímo z internals.
Přidat stejný `index.ts` do `mcp` a `hooks` pro konzistenci.

[SEVERITY: Low] [FILE: apps/web/features/mcp/components/McpServerFormFields.tsx:189] [CATEGORY: Typování]
`onValueChange={(v) => form.setType(v as McpTransport)}` — cast není staticky ověřen; stejný vzor v `hooks/components/HookFormFields.tsx:164` (`v as HookEvent`).
Použít generickou variantu SelectField, nebo runtime guard sdílený oběma místy.

[SEVERITY: Low] [FILE: apps/web/features/mcp/components/McpServerCard.tsx a apps/web/features/hooks/components/HookCard.tsx] [CATEGORY: Duplicitní vzor / zobecnění]
Obě karty mají identickou strukturu (aside Tag+StatusDot, actions Stack s truncated mono textem + Configure Button nad HudCard) — liší se jen poli. `chains`' ChainCard naproti tomu HudCard vůbec nepoužívá — "jedna karta na katalogovou položku" je ve třech features realizována dvěma odlišnými vzory.
Zvážit sdílený `CatalogItemCard` primitive v DS a sjednotit i chains.

STATS: 44 souborů, 2448 řádků celkem. Top 3: chains/Screen.tsx (331), mcp/components/McpServerFormFields.tsx (268), hooks/components/HookFormFields.tsx (201).

---
BATCH: web-memory

[SEVERITY: Medium] [FILE: apps/web/features/memory/filterGraph.ts:27] [CATEGORY: Dead code]
`filterGraphByProject` je exportovaná funkce testovaná ve `filterGraph.test.ts`, ale nikde v aplikaci se nepoužívá — Screen.tsx filtruje graf jen podle `tier`, project-scope byl dle poznámky "Phase 108" odstraněn.
Doporučení: odstranit `filterGraphByProject` (a příslušné testy), nebo pokud je plánovaný návrat project-scope filtru, přidat komentář/TODO odkazující na plán.

[SEVERITY: Medium] [FILE: apps/web/features/memory/components/NoteEditorDialog.tsx:34-58, apps/web/features/memory/components/QuickCapture.tsx:29-58] [CATEGORY: Duplicitní vzor]
Obě komponenty nezávisle implementují stejnou logiku "auto-slug title→id", každá s mírně odlišným chováním (NoteEditorDialog trackuje `idDirty`, QuickCapture generuje timestamp fallback) — riziko rozjetí chování při budoucí úpravě jednoho místa.
Doporučení: extrahovat sdílený hook (např. `useAutoSlugId`) do sdíleného modulu.

[SEVERITY: Low] [FILE: apps/web/features/memory/components/NoteEditorDialog.tsx:76-91, apps/web/features/memory/components/ImportDialog.tsx:57-72] [CATEGORY: Duplicitní vzor]
Obě dialogová okna staví téměř identický `actions` blok (Cancel ghost tlačítko + primary submit s `loading`/`disabled`) — stejný vzor se opakuje i v jiných feature dialozích napříč apps/web (NewTaskDialog, NewChainDialog aj.), takže jde o širší duplicitu.
Doporučení: zvážit DS-level `DialogActions`/`ConfirmActions` primitivum pro pár Cancel+Submit tlačítek s loading stavem.

[SEVERITY: Medium] [FILE: apps/web/features/memory/Screen.tsx] [CATEGORY: Chybějící pokrytí testy]
Screen.tsx (237 řádků, nejrozsáhlejší soubor v batchi) orchestruje loading/error/empty stavy, tier filtr, search filtr a tři dialogy, ale neexistuje `Screen.test.tsx`.
Doporučení: přidat test na loading/error/empty state a na filtrování search hitů podle tier.

[SEVERITY: Low] [FILE: apps/web/features/memory/components/MemoryGraph.tsx] [CATEGORY: Chybějící pokrytí testy]
Existuje pouze `MemoryGraph.simulate.test.ts` pro čistou simulační funkci; samotná komponenta (render SVG uzlů/hran, klik → `onSelect`, zvýraznění `selectedId`) nemá vlastní test.
Doporučení: doplnit lehký render test ověřující, že klik na uzel volá `onSelect` se správným id.

[SEVERITY: Low] [FILE: apps/web/features/memory/Screen.tsx:38-237] [CATEGORY: Komponenta na míru / kompozice]
Screen.tsx skládá header/toolbar/quickCapturePanel/editorDialog/importDialog jako lokální JSX proměnné uvnitř jedné funkce místo menších pojmenovaných subkomponent — zatím pod hranicí 300 řádků, ale vzor roste s každou fází.
Doporučení: při další fázi extrahovat `SearchResultsPanel` (řádky 186-213) a `MemoryToolbar` (řádky 122-135) do samostatných souborů.

[SEVERITY: Low] [FILE: apps/web/features/memory/components/QuickCapture.tsx:29-31] [CATEGORY: Business logika v komponentě]
`untitledId()` je modulová čistá funkce, ale generování id (timestamp-based slug) je byznys pravidlo duplicitní se slug logikou v `NoteEditorDialog`.
Doporučení: sloučit s navrhovaným `useAutoSlugId` hookem.

STATS: 20 souborů (source + testy), 1584 řádků celkem. Top 3: Screen.tsx (237), NoteView.tsx (202), MemoryGraph.tsx (184).

---
BATCH: web-overview

[SEVERITY: Medium] [FILE: apps/web/features/overview/components/ActivityFeed/ActivityFeed.tsx:44] [CATEGORY: duplicitní logika]
`relativeTime` je lokální reimplementace formátování relativního času s jinou signaturou než sdílený `apps/web/utils/time.ts` (`relativeTime`/`compactAgo`), který už jiné feature soubory (`SubsystemDrawer/AktivitaTab.tsx`, `ArtefaktyTab.tsx`) korektně reužívají.
Doporučení: nahradit lokální funkci sdíleným `compactAgo`/`relativeTime` z `utils/time.ts` a smazat duplicitní implementaci.

[SEVERITY: Medium] [FILE: apps/web/features/overview/Screen.tsx:66] [CATEGORY: duplicitní logika]
Výpočet `isFresh` (workspace je prázdný, pokud skills/integrations/agents/pipelines mají délku 0) je identicky zkopírovaný i v `SummaryWidget.tsx:46` — obě místa musí zůstat ručně synchronní.
Doporučení: vytáhnout do sdíleného hooku/util (např. `useIsWorkspaceFresh(...)`) v `overview/` a použít na obou místech.

[SEVERITY: Low] [FILE: apps/web/features/overview/SummaryWidget.tsx:15] [CATEGORY: duplicitní logika]
Lokální `pad2` helper (`String(n).padStart(2, "0")`) je ad-hoc reimplementace stejného vzoru, který se opakuje minimálně v `features/tasks/task.ts`, `features/automations/schedule.ts`, `features/automations/useCronLabel.ts` a `features/chat/components/ChatScreen.tsx`.
Doporučení: sjednotit do jedné sdílené util funkce (např. `utils/format.ts:padDigits`).

[SEVERITY: Low] [FILE: apps/web/features/overview/components/QuickLaunchPanel/QuickLaunchPanel.tsx:68] [CATEGORY: chybějící typování]
`(agent.glyph as IconName | undefined) ?? "bot"` — `agent.glyph` je v kontraktu záměrně `z.string().optional()`, takže cast na `IconName` je nekontrolovaný a neplatná hodnota glyfu projde bez fallbacku, na rozdíl od `Record`-lookup vzorů použitých jinde v tomto batchi, které selžou bezpečně na default.
Doporučení: validovat proti známé množině `IconName` (lookup s fallbackem) místo přímého `as` castu.

[SEVERITY: Low] [FILE: apps/web/features/overview/SummaryWidget.tsx:1] [CATEGORY: chybějící pokrytí testy]
`SummaryWidget.tsx` (HUD hlavička se zdravím systému, statistikami a "isFresh" titulkem) nemá žádný test soubor, na rozdíl od ostatních komponent ve stejné složce.
Doporučení: přidat `SummaryWidget.test.tsx` pokrývající health tone/dot mapping a fresh/allRunning title větvení.

[SEVERITY: Low] [FILE: apps/web/features/overview/components/ApprovalsPanel.tsx:1] [CATEGORY: chybějící pokrytí testy]
`ApprovalsPanel.tsx` (empty-state, MAX_SHOWN=4 ořez, approve/reject mutace) nemá test soubor.
Doporučení: přidat `ApprovalsPanel.test.tsx` pokrývající empty state, ořez na 4 karty a approve/reject click handlery.

[SEVERITY: Low] [FILE: apps/web/features/overview/Screen.tsx:39] [CATEGORY: obecnost komponenty]
`Screen()` orchestruje 4 primární query stavy (pending/error/fresh) ručně přes pole `primaryQueries` + `.every()` — vzor honest-load-state, který existuje jen zde; při druhém výskytu to bude copy-paste.
Doporučení: při druhém konzumentovi extrahovat do sdíleného `useAllOrNothingLoadState(queries)` hooku; zatím akceptovatelné.

STATS: 18 souborů (zdrojové + testy), 1590 řádků celkem. Top 3: Screen.tsx (185), Screen.test.tsx (132), SummaryWidget.tsx (130). Žádný soubor nepřekračuje 300 řádků.

---
BATCH: web-pipelines

[SEVERITY: High] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx:190-231] [CATEGORY: Performance]
Global `mousemove`/`mouseup` effect lists `graph` in its dep array (needed only so `commit`'s closure sees fresh state for `isUpstreamRework`), so during every node-drag frame `setGraph` mutates `graph` → the effect tears down and re-attaches both window listeners on each mouse move. Listener churn + full re-subscribe per frame.
Doporučení: Keep `graph`/`pending` in refs read inside the handlers and depend only on `pending`/`nodeDrag` booleans so listeners attach once per drag gesture.

[SEVERITY: High] [FILE: apps/web/features/pipelines/Screen.tsx:117-137] [CATEGORY: Duplication]
The save/diff logic (call `graphToPhases`, rebuild `initialPhases` via `graphToPhases(phasesToGraph(...))`, `JSON.stringify` compare, assemble the `UpdatePipelineInput` patch with name/desc trims) is duplicated almost verbatim in `PipelineDialog.tsx:104-110`. Two copies of the same non-trivial patch-building business logic will drift.
Doporučení: Extract a pure `buildPipelinePatch(initial, graph, name, desc, agents)` util next to `pipeline-graph.ts` and call it from both.

[SEVERITY: High] [FILE: apps/web/features/pipelines/Screen.tsx:76-137] [CATEGORY: Business logic in component]
Screen embeds a full inline-edit state machine (editingId/editGraph/editName/editDesc/showPalette + startEdit/cancelEdit/addAgentToEdit/saveEdit and validity/canSave derivation) directly in the component, on top of query/loading/error branches and avatar/duplicate mutations — driving the 431-line size.
Doporučení: Move the edit lifecycle into a `usePipelineInlineEdit(selected, agents)` hook returning graph/name/desc/handlers, leaving Screen as presentation.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx:1-441] [CATEGORY: Component size]
441 lines: geometry helpers (portPt/flowPath/reworkPath), ~10 graph-mutation closures (delNode/cycleModel/setProduces/patchRework/…), drag/port mouse handlers, the commit reducer, and three SVG+DOM render passes all in one component.
Doporučení: Split the graph-mutation closures into a `usePipelineGraphMutations(setGraph)` hook and the SVG edge layer (`flow`/`rework`/pending paths) into a `<CanvasEdges>` subcomponent.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineCanvas.tsx:347-374] [CATEGORY: Performance]
`AgentNode` is not memoized, and per render the canvas rebuilds `reworkByFrom` (new Map) and calls `nodeById` (linear `find`) + `hasOutgoing` (linear `some`) inside each `.map`, i.e. O(n²) per render — and it re-renders on every mousemove while an edge is being dragged (pending.cursor updates). Every node re-renders each frame.
Doporučení: `memo` AgentNode, precompute an id→node Map and an outgoing set once per render, and isolate the pending-cursor preview so node cards don't re-render during a drag.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:258-265] [CATEGORY: Convention/Tailwind]
Raw `<input>` carries bespoke app-authored Tailwind classes incl. arbitrary values (`text-[10px]`, `focus-visible:ring-accent`); same pattern in `EdgeControls.tsx` (inputs, `STEP`, delete buttons) and `PipelineDialog.tsx:169,177` (name/desc inputs with `bg-[var(--color-background-deep)]`). CLAUDE.md states apps/web must not write its own Tailwind classes / compose from DS primitives.
Doporučení: Replace with a DS text-input primitive (or a small DS "canvas inline input" component) so styling lives in the design system, not arbitrary app utilities.

[SEVERITY: Medium] [FILE: apps/web/features/pipelines/components/PipelineDialog/PipelineDialog.tsx:72-80] [CATEGORY: Duplication]
`addAgent` (find agent → `makeNode(agent, i+1, x ?? 60 + i*26, y ?? 150 + i*18)` → append) is duplicated in `Screen.tsx:105-114` as `addAgentToEdit`, including the identical fallback-position magic numbers.
Doporučení: Move to a shared helper `appendAgentNode(graph, agents, agentId, x?, y?)` in the graph module.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:23-53] [CATEGORY: Prop drilling]
AgentNode takes ~18 props, ~10 of them individual callbacks drilled straight from PipelineCanvas (onPortDown/onNodeDown/onDelete/onCycleModel/onCycleThink/onSetProduces/onPortEnter/…).
Doporučení: Group the wiring callbacks into a single `handlers` object (or a small context) to shrink the surface and reduce churn.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:58] [CATEGORY: Typing]
`agents.find(...)?.glyph as IconName` casts an unvalidated string to the DS `IconName` union (also in `AgentPalette.tsx:32` and `glyphForPhase` usage); a bad stored glyph silently becomes an invalid icon name with no fallback narrowing.
Doporučení: Validate against the known icon set (or a typed lookup) instead of `as IconName`, or keep the `?? "bot"` fallback behind a guard that also catches unknown names.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx:55-58] [CATEGORY: Duplication]
`glyphOf` exists here and a near-identical `glyphOf` in `AgentPalette.tsx:32`; both resolve an agent's glyph with a `"bot"` fallback.
Doporučení: Export one `agentGlyph(agent)` helper and reuse.

[SEVERITY: Low] [FILE: apps/web/features/pipelines/components/PipelineDialog/pipeline-graph.ts:86-88] [CATEGORY: Correctness]
`guid` relies on a module-level mutable `_gid` counter shared across all canvas instances and never reset; safe today only because ids are used within one edit session and phases-diff ignores edge ids, but it makes ids non-deterministic and test-order-sensitive.
Doporučení: Fine as-is, but document the "session-unique, not persisted" contract at the call sites, or scope the counter per graph instance to avoid future cross-instance surprises.

STATS:
Files: 28 (7 test/spec files read only cursorily). Total lines: 3257.
Top 3 by lines (non-test source): PipelineCanvas.tsx (441), Screen.tsx (431), pipeline-graph.ts (313).

Note on quality: `pipeline-graph.ts` is well-factored — pure, dependency-free, side-effect-free, with a dedicated 298-line test covering ordering, consumes-threading, upstream-rework and validation; the graph⇄phases conversion is correct given the enforced one-out/one-in invariant. The mutations/queries layer cleanly follows the project's TanStack conventions (per-domain hooks, `getXxxQueryKey`, `select: selectApiResponseBody`, SSE-gated fallback polling) with no issues found. No `any`, no `@ts-ignore`/`@ts-expect-error` anywhere in the batch.

---
BATCH: web-projects-components

[SEVERITY: High] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:401] [CATEGORY: File size]
Soubor má 401 řádků a slučuje pět nesouvisejících sekcí formuláře (logo upload, budget caps, checks, env, delete) do jedné komponenty.
Rozdělit na subkomponenty ProjectLogoField, ProjectBudgetFields, ProjectChecksField (a ponechat env na existujícím KeyValueEditor), řízené přes Controller/watch z rodiče.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:118-137] [CATEGORY: Business logic in component]
handleLogoFile obsahuje validaci typu/velikosti souboru a FileReader side-effect přímo v komponentě místo ve vyčleněném hooku.
Extrahovat do custom hooku (např. useLogoUpload) vracejícího { logo, onFile, clear }.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:62-68] [CATEGORY: Duplication]
fromRows (kolaps KeyValueRow[] na Record, drop prázdných klíčů) je identická s fromRows v ProjectSecretsPanel.tsx:19-24 — stejná logika duplikovaná ve dvou souborech.
Přesunout fromRows/toRows jako sdílený export z KeyValueEditor.tsx nebo do utils.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectCard.tsx:19-64] [CATEGORY: Duplication / generalization]
BudgetBar a CostBar jsou téměř identické (label + used/cap řádek + Progress bar), liší se jen formátováním hodnoty (číslo vs. formatCostUsd) — dvě samostatné komponenty pro tentýž vzor.
Sloučit do jedné LabeledProgressBar s formatValue propem, případně přesunout do DS jako obecný primitiv.

[SEVERITY: Medium] [FILE: apps/web/features/projects/components/ProjectCard.tsx:93-110] [CATEGORY: Duplication]
Blok pro vykreslení per-status task-stat odkazů (Link + Stat z useProjectTaskStats groups) je téměř totožný s blokem v ProjectRunSummary.tsx:43-55.
Vytáhnout sdílenou komponentu (např. ProjectTaskStatLinks) používanou oběma místy.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectCompanyPanel.tsx:119-193] [CATEGORY: Generalization]
Vzor "empty-state Typography s data-testid" se opakuje třikrát v tomto souboru a znovu v ProjectPullRequestsPanel.tsx a ProjectIntegrationActivityPanel.tsx — ad-hoc inline místo sdílené DS komponenty.
Zvážit jednoduchý EmptyState primitiv v DS (label + testid prop) pro tento opakovaný vzor napříč panely.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectIntegrationsPanel.tsx:50-80] [CATEGORY: Business logic in component]
onCreate a onTest obsahují víckrokovou mutation-orchestraci (podmíněné nastavení credentials, navigace po úspěchu, mapování chyby na toast state) přímo v komponentě.
Zvážit přesun této orchestrace do dedikovaného hooku (např. useCreateIntegrationFlow) v features/integrations.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/KeyValueEditor.tsx] [CATEGORY: Test coverage]
Sdílená, znovupoužívaná komponenta (basics env, secrets) nemá vlastní test soubor — pokrytí existuje jen nepřímo přes ProjectBasicsPanel.test.tsx, který navíc netestuje env řádky vůbec.
Přidat KeyValueEditor.test.tsx pro add/remove/change/secret-masking chování.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectSecretsPanel.tsx, ProjectSelect.tsx, ProjectIntegrationsPanel.tsx] [CATEGORY: Test coverage]
Tři netriviální komponenty v tomto batchi (write-only secrets flow, integrations create/test/toggle flow, project dropdown) nemají žádný test soubor.
Doplnit alespoň smoke/interaction testy pro tyto tři komponenty.

[SEVERITY: Low] [FILE: apps/web/features/projects/components/ProjectBasicsPanel.tsx:84-94] [CATEGORY: Business logic in component]
toPositiveInt/toPositiveFloat jsou čisté parsovací funkce definované lokálně v komponentě, ačkoliv jde o obecně použitelnou budget-parsing logiku.
Přesunout do sdíleného utils souboru, pokud se stejný parsing objeví i jinde (např. u company budgetu).

STATS: 17 souborů, 2259 řádků celkem. Top 3: ProjectBasicsPanel.tsx (401), ProjectBasicsPanel.test.tsx (225), ProjectCompanyPanel.tsx (199).

---
BATCH: web-projects-core

[SEVERITY: High] [FILE: apps/web/features/projects/ProfileScreen.tsx:195-685] [CATEGORY: File size / component decomposition]
ProfileScreen je 685 řádků a v jedné funkci kombinuje routing (tab state), 3× duplicitní "controlled-draft vs server-data" stavový vzor (people/autonomy/rhythm), 4 save handlery s transformační logikou a 4 inline JSX bloky (teamPanel, autonomyPanel, rhythmPanel, standupPanel) o desítkách řádků každý.
Rozdělit na ProfileScreen (orchestrace + tabs) + samostatné TeamPanel/AutonomyPanel/RhythmPanel komponenty v `./components/`, po vzoru už existujících ProjectBasicsPanel/ProjectCompanyPanel.

[SEVERITY: High] [FILE: apps/web/features/projects/ProfileScreen.tsx:324-517] [CATEGORY: Duplicitní vzor napříč souborem]
Team/Autonomy/Rhythm/Standup panely jsou psány jako inline JSX konstanty přímo v ProfileScreen, zatímco sesterské sekce (Basics, Company, Integrations, Secrets, PullRequests) jsou už extrahované komponenty v `./components/`. Nekonzistentní vzor v rámci stejné obrazovky.
Extrahovat všechny čtyři panely do vlastních souborů se stejnou konvencí jako ostatní `Project*Panel` komponenty.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.tsx:233-303] [CATEGORY: Business logika v komponentě]
Tři téměř identické bloky "local state nebo server data" (`people`/`effectivePeople`, `autonomy`/`effectiveAutonomy`, `rhythm`/`effectiveRhythm`) a čtyři save-handlery (saveBasics/saveTeam/saveAutonomy/saveRhythm) s filtrací/dedupe logikou žijí přímo v komponentě místo v custom hooku.
Vytáhnout do `useProjectProfileForm(id, profileQ.data)` hooku, který zapouzdří draft state + save mutace pro všechny tři sekce.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.tsx:112-184] [CATEGORY: Prop drilling]
PersonRow přijímá 9 samostatných label/placeholder/help props místo aby si `t()` z `useTranslations("projects.profile")` volal sám.
Nahradit prop-drilling přímým `useTranslations` uvnitř PersonRow.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.tsx:530-537] [CATEGORY: Business logika v komponentě]
Odvozený stav pro clone banner (cloneTarget, showMissingCloneBanner, showClonedFromCloneRoot) je počítán inline v render těle namísto v hooku/pure helperu.
Přesunout do malé pure funkce (např. `resolveCloneBannerState(project, localState)`) nebo do `useProjectLocalStateQuery` jako odvozené pole.

[SEVERITY: Medium] [FILE: apps/web/features/projects/ProfileScreen.test.tsx] [CATEGORY: Testové pokrytí]
Test soubor pokrývá basics/team/rhythm/clone/new-project flow, ale neobsahuje žádný test pro Autonomy panel (respond_as toggle, vip_escalation, can_do_alone/always_ask multi-select + saveAutonomy), přestože je to jeden z nejsložitějších bloků byznys logiky v souboru.
Doplnit test(y) pro saveAutonomy pokrývající filtrování prázdných hodnot a undefined-defaulting.

[SEVERITY: Medium] [FILE: apps/web/features/projects/Screen.tsx:140] [CATEGORY: Chybějící typování]
`(cat.glyph as IconName) ?? "code"` je nevalidovaný type cast z libovolného stringu (kategorie z API) na `IconName` — chybí runtime guard.
Přidat guard funkci nebo validaci proti známé množině IconName hodnot s fallbackem.

[SEVERITY: Low] [FILE: apps/web/features/projects/ProfileScreen.tsx:102-106] [CATEGORY: Chybějící typování]
`asProjectTab` používá `(value as ProjectTab)` cast namísto type predicate; funkčně bezpečné, ale šlo by bez castu.
Zvážit `function isProjectTab(v: string): v is ProjectTab`.

[SEVERITY: Low] [FILE: apps/web/features/projects/ProfileScreen.tsx:69-93] [CATEGORY: Umístění kódu]
AUTONOMY_ACTIONS vokabulář a `actionOptions()` jsou nezávislá čistá doména, ale žijí v 685řádkovém souboru.
Přesunout do `./autonomyActions.ts`.

[SEVERITY: Low] [FILE: apps/web/features/projects/queries/keys.ts:1-22] [CATEGORY: Duplicitní vzor napříč souborem]
Cache-key definice u `useBudgetQuery`/`useCiStatusQuery` jsou vyčleněné do keys.ts (kvůli cyklu s runEvents), zbylých 12 hooků má `getXxxQueryKey` u sebe — nekonzistentní umístění stejného konceptu (zdokumentované).
Ponechat, ale přidat vysvětlující komentář do `queries/index.ts`.

[SEVERITY: Low] [FILE: apps/web/features/projects/ProfileScreen.tsx:260-266] [CATEGORY: Business logika v komponentě]
Generování id nového projektu (`slug(body.name) || \`project-${Date.now()}\``) je inline v handleru `saveBasics` — doménová logika (fallback-id strategie) mimo util.
Přesunout do `utils/slug.ts` jako `generateProjectId(name)`.

STATS: 29 zdrojových souborů (3 root, 15 queries, 11 mutations) + test zběžně; 1413 řádků bez testů. Top 3: ProfileScreen.tsx (685), Screen.tsx (171), useProjectIntegrationActivityQuery.ts (50).

---
BATCH: web-runs-components

[SEVERITY: Critical] [FILE: apps/web/features/runs/components/RunDetail.tsx:411-420] [CATEGORY: DS violation]
`RunInputSection` renders a raw `<a>` with a hand-written Tailwind `className` (`"inline-block w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"`) wrapping `FilePreview` — direct violation of "apps/web never writes its own Tailwind classes"; no DS passthrough or eslint-disable is used, unlike the sanctioned `style` passthrough pattern.
Add an `onOpen`/`href` prop to the DS `FilePreview` primitive instead of hand-rolling a styled anchor in the app.

[SEVERITY: High] [FILE: apps/web/features/runs/components/RunDetail.tsx:1-858] [CATEGORY: file size / component boundary]
Single file is 858 lines and owns 8 separate concerns as top-level function components (`LimitPausedPanel`, `MetaCell`, `AssignProjectControl`, `PrOutputCard`, `RunOutputPanel`, `RunInputSection`, plus the `RunDetail` header/meta-strip/action logic) plus two free-floating util functions (`firstUrl`, `attachmentOpenHref`).
Split into `RunDetailHeader.tsx`, `RunOutputPanel.tsx`, `RunInputSection.tsx`, `LimitPausedPanel.tsx`, and a `run-output.ts`/`run-links.ts` util module; keep `RunDetail.tsx` as the thin orchestrator.

[SEVERITY: High] [FILE: apps/web/features/runs/components/PipelineStageTimeline.tsx:1-522] [CATEGORY: file size / component boundary]
522-line file mixes a pure data-transform (`buildPhaseNodes`, ~55 lines), three log-fetching components (`StageLog`, `LiveStageLog`, `TerminalStageLog`), `RetryBlock`, and the main timeline — whose per-node row header is itself a ~75-line inline IIFE built inside JSX (lines 403-478).
Extract `buildPhaseNodes` to `pipeline-stage-nodes.ts`, move `StageLog`/`RetryBlock` to their own files, and pull the inline IIFE header into a named `PhaseRowHeader` subcomponent.

[SEVERITY: High] [FILE: apps/web/features/runs/components/RunParkedPanel.tsx:38-65 ; apps/web/features/runs/components/GoalDetailPanel.tsx:274-294] [CATEGORY: duplication]
The "resume with note" form (TextAreaField + note state + end-aligned Button calling `resume.mutate({ params: { runId }, body: { note: note.trim() || undefined } })`) is duplicated near-verbatim across two components, differing only in which mutation hook is used.
Extract a shared `ResumeWithNoteForm` component parameterized by the mutation hook/runId.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/RunDetail.tsx:184-191] [CATEGORY: business logic in component]
`firstUrl` (regex URL extraction) and `attachmentOpenHref` (API URL construction) are pure utility functions defined inline in the component file rather than alongside the project's existing `utils/cost.ts` / `utils/time.ts` helpers.
Move both to a `utils/` module (e.g. `utils/url.ts`) with their own unit tests.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/GoalDetailPanel.tsx:57-69] [CATEGORY: business logic in component]
The daily/weekly budget-window calculation (`within`, `budget`, `budgetPct`) is nontrivial date-filtering logic embedded directly in the render body, mirroring backend budget-guard logic but untested in isolation.
Extract to a pure `computeGoalBudgetUsage(iterations, goal, now)` util and unit-test it directly.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/GoalDetailPanel.tsx:112-253] [CATEGORY: component size]
The iteration-timeline `.map()` body is ~140 lines of nested JSX (row header, verifier status, expandable maker/verifier logs) inlined in the parent render — file sits at exactly 300 lines already.
Extract a `GoalIterationRow` subcomponent taking the iteration + open/close state as props.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/ChainStepsPanel.tsx:21-26] [CATEGORY: duplicate pattern]
`stepTone(status)` is an ad-hoc, locally-defined status→tone map ("done"→ok, "failed"→bad, "running"→run) that parallels the canonical `RUN_STATE`/`runStateTone` map already defined in `run.ts` and used everywhere else in this feature.
Fold chain-step statuses into the shared `RUN_STATE` map (or a documented subset of it) instead of a second parallel mapping.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/PipelineStageTimeline.tsx:358-360] [CATEGORY: missing/weak typing]
`(agent?.glyph as IconName | undefined)` casts a free-form `z.string().optional()` contract field (`agent.schema.ts:48`) straight to the closed `IconName` union with no validation — an unrecognized glyph string passes typecheck but can render an invalid icon at runtime.
Validate/narrow via a lookup table or a runtime guard (`isIconName`) before casting, falling back to the existing `bot`/`check` default on a miss.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/RunLogStream.tsx:1-99 vs PipelineStageTimeline.tsx:143-218] [CATEGORY: inconsistent duplicate pattern]
Two different "tail a run's log" renderings coexist: `RunLogStream` (used by `RunDetail` and `GoalDetailPanel`) renders the raw text through a plain `CodeBlock`, while `PipelineStageTimeline`'s `StageLog`/`LiveStageLog`/`TerminalStageLog` parse the same kind of agent transcript through `RunTranscript` (markdown + foldable tool calls). If both are meant to show the same transcript shape, this is an unintentional divergence rather than a documented design choice.
Confirm whether top-level run logs should also render via `RunTranscript`; if the difference is intentional, document why in the component doc comment.

[SEVERITY: Medium] [FILE: apps/web/features/runs/components/RunApprovalGate.tsx:83-104] [CATEGORY: componentization opportunity]
The severity-tinted "consequence" callout (icon + label + body over a `color-mix`-derived background/border) is a bespoke, one-off `<div style={{...}}>` block with a properly-used `eslint-disable-next-line react/forbid-dom-props` — legitimate per the DS passthrough rule, but the same "tone-tinted callout" shape recurs conceptually across the runs/approvals surfaces.
Consider promoting this to a DS `Callout`/`InlineNotice` primitive so future consumers don't need their own `eslint-disable` + inline style block.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/RunDetail.tsx:216 ; 367] [CATEGORY: duplication]
`window.open(url, "_blank", "noopener,noreferrer")` is repeated ad hoc in two places within the same file (`PrOutputCard`, `RunOutputPanel`).
Factor into a tiny `openInNewTab(url)` helper.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/ParkedRunsPanel.tsx:20] [CATEGORY: business logic in component]
Client-side `runs.filter((r) => r.status === "parked")` filtering happens directly in the component instead of via a `select` on the query hook.
Add a `select` (or a dedicated `useParkedRunsQuery`) mirroring the `selectApiResponseBody` convention.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/RunParkedPanel.tsx:32-36] [CATEGORY: business logic in component]
Trailing-log-tail computation (split/filter/slice/join, `TAIL_LINES = 30`) is inline transform logic in the render body.
Extract to a small `tailLines(text, n)` util, reusable if other panels need the same trimming.

[SEVERITY: Low] [FILE: apps/web/features/runs/components/ChainStepsPanel.tsx ; ParkedRunsPanel.tsx] [CATEGORY: test coverage]
Neither `ChainStepsPanel.tsx` (fetch + toggle + status-tone logic) nor `ParkedRunsPanel.tsx` (client-side filter) has a corresponding `.test.tsx`, unlike every sibling panel of comparable complexity in this batch.
Add unit tests covering the open/close toggle and the empty-state (`null` return) branches.

STATS: 22 files, 4471 total lines. Top 3 largest: RunDetail.tsx (858), RunDetail.test.tsx (609), PipelineStageTimeline.tsx (522).

---
BATCH: web-runs-core

[SEVERITY: Medium] [FILE: apps/web/features/runs/Screen.tsx:100-121] [CATEGORY: business-logic-in-component]
Odvozovací logika filtru (parsování `?filter=` do `FeedStatus[]`, `isBucket`, `activeBucketId`, `bucketCount`, `count`, `timeLabel`/`relative`) je napsaná přímo v komponentě, ne jako custom hook (`useRunsFeedFilter`) ani util modul — znesnadňuje unit test bez renderu celé stránky a soubor tím roste (295 řádků, těsně pod hranicí 300).
Doporučení: vytáhnout filter/bucket/time odvozovací logiku do samostatného hooku nebo `runsFeed.ts` util modulu, otestovat izolovaně.

[SEVERITY: Medium] [FILE: apps/web/features/runs/queries/useRunsQuery.ts:86-127] [CATEGORY: duplicate-pattern]
`useRunGlyphMap`/`useRunAvatarMap` používají doslovné literály `["skills"]`, `["agents"]`, `["pipelines"]` jako query key místo importu kanonických `getSkillsQueryKey()` (existuje v `features/skills/queries`), `getAgentsQueryKey()` a `getPipelinesQueryKey()` (existují ve `features/agents`/`features/pipelines`) — riziko tichého rozjetí klíčů při refaktoru cizí domény.
Doporučení: importovat a použít kanonické `getXxxQueryKey()` z domén skills/agents/pipelines místo duplikace literálů.

[SEVERITY: Medium] [FILE: apps/web/features/runs/mutations/useAssignRunProjectMutation.ts:3] [CATEGORY: duplicate-pattern]
Všech 6 mutation souborů importuje `allTaskRunsKey` z `../queries/useRunsQuery` (re-export "pro existující importéry", viz komentář v `queries/keys.ts`) místo z kanonického, na Reactu nezávislého `../queries/keys` modulu, který byl explicitně vytvořen pro tento účel — nový kód by měl mířit na kanonickou cestu, ne na re-export.
Doporučení: přepnout import ve všech mutation souborech na `../queries/keys`.

[SEVERITY: Low] [FILE: apps/web/features/runs/mutations/useDeleteAgentRunMutation.ts:7-12] [CATEGORY: duplicate-pattern]
`useDeleteAgentRunMutation` a `useDeletePipelineRunMutation` jsou identická implementace (stejný `apiClient.taskRuns.deleteTaskRun.useMutation`, stejná invalidace) lišící se pouze jménem; totéž platí pro `useResumePipelineRunMutation` vs. `useResumeTaskRunMutation` (oba volají `resumeTaskRun.useMutation` beze změny).
Doporučení: zvážit sjednocení na jeden `useDeleteTaskRunMutation`/jeden resume hook (per-kind název zachovat jen v call-site, pokud je čitelnost důležitá) — nebo alespoň komentářem zdůvodnit, proč zůstávají oddělené.

[SEVERITY: Medium] [FILE: apps/web/features/runs/runEvents.tsx:93] [CATEGORY: missing-typing]
`JSON.parse(event.data) as RunStatusEvent` je nevalidovaný type cast — try/catch chytí jen syntaktickou chybu JSON, ne špatný tvar payloadu (chybějící/špatně typované `scope`/`runId`), takže SSE zpráva s neočekávaným tvarem projde beze varování a tiše rozbije `if (parsed.scope === …)` větvení.
Doporučení: validovat payload přes existující zod schéma (pokud kontrakt SSE eventů existuje) místo slepého `as`.

[SEVERITY: Medium] [FILE: apps/web/features/runs/useRunLogStream.ts:84] [CATEGORY: missing-typing]
Stejný vzor jako výše: `apply((await res.json()) as RunLogChunk)` a `apply(JSON.parse(event.data) as RunLogChunk)` (řádek 104) castují síťovou odpověď na `RunLogChunk` bez runtime validace.
Doporučení: sjednotit s runEvents.tsx nálezem — zavést sdílenou runtime validaci SSE/JSON payloadů (např. `RunLogChunkSchema.parse`) na jednom místě, ať se vzor neopakuje ve dvou souborech.

[SEVERITY: Low] [FILE: apps/web/features/runs/queries/useRunsQuery.ts:49-54] [CATEGORY: convention-deviation]
`useRunsQuery` vrací `{ runs, isPending, isError, refetch }` místo přímého výsledku `useQuery`, což je explicitní odchylka od projektové konvence pro query hooky. Zdůvodněno v komentáři (mnoho call-sites destructuruje `runs`), ale je to trvalý precedent, který se v mutation-import vzoru dál replikuje.
Doporučení: ponechat jako vědomou výjimku, ale zvážit, zda nový kód v této feature má tuto výjimku dál následovat, nebo se řídit konvencí.

[SEVERITY: Low] [FILE: apps/web/features/runs/queries/useRunsQuery.ts:98-100] [CATEGORY: missing-typing]
`s.glyph as IconName` / `a.glyph as IconName` castuje řetězcové pole z katalogu bez runtime kontroly, že jde o platný `IconName`.
Doporučení: buď typovat `glyph` v kontraktu jako `IconName` union přímo, nebo validovat/fallbackovat na výchozí glyph při neplatné hodnotě.

[SEVERITY: Low] [FILE: apps/web/features/runs/runEvents.tsx:1-192] [CATEGORY: coupling]
`RunEventsProvider` importuje query-key buildery z 9+ cizích domén (agents, approvals, chains, projects, overview×3, integrations, pipelines, tasks) do jednoho `onmessage` handleru s dlouhým if/else-if řetězcem přes `scope` — funkčně zdůvodněno jako centrální invalidation hub, ale zvyšuje "blast radius" jednoho souboru při každé změně cizí query-key struktury.
Doporučení: pokud řetězec dál poroste, zvážit rozpad na mapu `scope → handler[]` registrovanou z jednotlivých domén (inverze závislosti), místo že `runs` zná klíče všech ostatních.

[SEVERITY: Low] [FILE: apps/web/features/runs/Screen.tsx:256-281] [CATEGORY: prop-drilling]
`RunDetail` dostává 10 jednotlivých primitivních/derivovaných props (`avatar`, `deleting`, `glyph`, `now`, `onDelete`, `onResume`, `onStop`, `resuming`, `run`, `stopping`) místo menšího tvaru (např. `run` + `actions`-bag z `useRunActions`), což zvyšuje šanci na nekonzistenci při přidání další akce.
Doporučení: zvážit předání `RunActions` objektu (z `useRunActions`) přímo místo jeho rozbalení na jednotlivé props na volajícím místě.

STATS: 21 souborů, celkem 1483 řádků. Top 3 podle počtu řádků: Screen.tsx (295), run.ts (276), runEvents.tsx (192).

---
BATCH: web-settings

[SEVERITY: Medium] [FILE: apps/web/features/settings/components/SystemSection.tsx:33] [CATEGORY: missing-loading-error-state]
`SystemSection`/`ChatSection`/`ChatUiSection`/`MachineSection`/`ActivitySection`/`MandateSection` all silently `return null` while the config query is pending or errored, unlike `AutomationsSection`/`SelfKnowledgeSection` which render `QueryLoading`/`QueryError`. Operator sees a blank panel with no feedback on slow load or API failure.
Standardize all six sections on the `QueryLoading`/`QueryError` pattern already used by `AutomationsSection`.

[SEVERITY: Medium] [FILE: apps/web/features/settings/components/SystemSection.tsx:31] [CATEGORY: duplication]
The "query → `if (!config) return null` → remount editor with `key={...}` to reseed local state → whole-document PUT on save" wrapper pattern is copy-pasted near-identically across `SystemSection`, `ChatSection`, `ChatUiSection`, and `MachineSection` (4 files), including the same partial-update-via-full-PUT posture and remount-via-`key` trick.
Extract a shared `useConfigEditor`-style hook or generic `<ConfigSection query={...}>` wrapper that owns load/error/remount, so each concrete section only supplies fields and the save shape.

[SEVERITY: Medium] [FILE: apps/web/features/settings/Screen.tsx:139] [CATEGORY: business-logic-in-component]
`Screen()` owns three pieces of side-effecting logic inline: localStorage read/write for the "caffeinate" toggle, a raw `document.cookie` write for locale, and URL `?tab=` parsing/routing — none extracted into a custom hook, and the file has no test coverage at all (no `Screen.test.tsx` exists, unlike every sibling component in this folder).
Extract `useCaffeinatePreference()` and `useSettingsTab()` hooks and add a `Screen.test.tsx` covering tab deep-linking and locale/caffeinate persistence.

[SEVERITY: Medium] [FILE: apps/web/features/settings/Screen.tsx:139] [CATEGORY: dead-or-incomplete-logic]
The "caffeinate" toggle persists `zibby.caffeinate` to `localStorage` but no other file in the app reads that key (confirmed via grep) — the control changes state that nothing consumes, presenting a no-op setting to the operator as if it does something.
Either wire the value into whatever should keep the Mac awake, or remove/mark the control until the daemon-side consumer exists.

[SEVERITY: Low] [FILE: apps/web/features/settings/components/ChatSection.tsx:46] [CATEGORY: type-safety]
`ButtonGroup.onChange` is typed `(value: string) => void`, so `choose(v as ChatPersona)`, `choose(group, v as ActivityViewMode)` in `ActivitySection.tsx:61`, and `setLocale(v as Locale)` in `Screen.tsx:179` are unchecked casts trusting the DS only calls back with an id from the options list — no runtime narrowing like `asSettingsTab` uses.
Add a small runtime guard (or a generic `ButtonGroup<T>` in the DS) instead of raw `as` casts at each call site.

[SEVERITY: Low] [FILE: apps/web/features/settings/Screen.tsx:46] [CATEGORY: bespoke-component]
`SettingRow` and `InfoRow` are defined locally in `Screen.tsx` (label/hint/control and mono key-value row) but are generic layout patterns likely reusable by other settings-shaped pages; not exported or shared.
If another screen needs the same row shape, promote these to the design system or a shared `components/` location.

[SEVERITY: Low] [FILE: apps/web/features/settings/components/SystemSection.tsx:56] [CATEGORY: business-logic-in-component]
The `tick`/`positive` numeric coercion helpers (clamp-to-non-negative-integer, clamp-to-min) are defined inline inside `SystemEditor` on every render rather than as a module-level pure util.
Hoist `tick`/`positive` to module scope (or a shared numeric-coercion util) so they can be tested without rendering the form.

[SEVERITY: Low] [FILE: apps/web/features/settings/components/MandateSection.tsx:46] [CATEGORY: missing-test-coverage]
`MandateSection.test.tsx`, `MachineSection.test.tsx`, `ActivitySection.test.tsx`, and `ChatSection.test.tsx` only exercise the happy path — none test the `!data` early-return branch or a pending/error query state, so the Medium loading/error-state gap above is also untested.
Add a test per section asserting the panel behavior before data resolves.

STATS: files=25 (13 component .tsx, 6 component .test.tsx, 2 mutations, 2 queries, 2 index barrels, 1 Screen.tsx), total_lines=2509 (1890 excluding tests), top3=[Screen.tsx:272, SystemSection.tsx:180, ChatUiSection.test.tsx:138]

---
BATCH: web-skills-commands

[SEVERITY: High] [FILE: apps/web/features/skills/DetailScreen.tsx:52-159, apps/web/features/commands/DetailScreen.tsx:57-155] [CATEGORY: Duplicate pattern]
SkillEditor a CommandEditor jsou téměř identické — stejný isError/isPending/!data guard, stejná PageHeader se Save/Delete/Back tlačítky a testid vzory, stejný ConfirmDeleteDialog wrapper i useFormControls flow, lišící se jen konkrétními poli formuláře.
Extrahovat sdílenou `<DetailScreenShell>`/`useDetailQueryGuard` + `<DetailHeaderActions>` kompozici parametrizovanou title/save/delete callbacky.

[SEVERITY: High] [FILE: apps/web/features/commands/components/CommandTile.tsx:17-53, apps/web/features/skills/components/SkillTile.tsx:14-48] [CATEGORY: Duplicate pattern]
Obě dlaždice mají identickou strukturu (Card>Container>Stack>IconTile+Typography+StatusDot); komentář v CommandTile explicitně říká "Mirrors SkillTile" — liší se jen zdrojem glyfu a druhým řádkem textu.
Vytáhnout generický `<CatalogTile>` composite (DS nebo lokální) se sloty pro glyph/title/subtitle/statusTone.

[SEVERITY: Medium] [FILE: apps/web/features/commands/components/AddCommandModal/AddCommandModal.tsx:10-19, apps/web/features/commands/DetailScreen.tsx:26-35] [CATEGORY: Duplicate validation]
Identické zod schéma (8 polí) je doslovně zkopírované mezi create dialogem a detail screenem.
Přesunout schéma vedle `CommandFormFields.tsx` (např. `commandFormSchema.ts`) a importovat na obou místech.

[SEVERITY: Medium] [FILE: apps/web/features/skills/components/AddSkillModal/AddSkillModal.tsx:11-16, apps/web/features/skills/DetailScreen.tsx:25-30] [CATEGORY: Duplicate validation]
Stejný vzor jako u commands — identické zod schéma duplikované mezi create dialogem a detail screenem.
Přesunout schéma vedle `SkillFormFields.tsx` a sdílet.

[SEVERITY: Medium] [FILE: apps/web/features/commands/DetailScreen.tsx:16] [CATEGORY: Misplaced business logic]
`parseTools` je čistá parsovací utilita, ale je definovaná a exportovaná z `AddCommandModal.tsx` (dialogové komponenty); `DetailScreen.tsx` importuje detail implementace sourozenecké komponenty místo sdíleného utilu.
Přesunout `parseTools` do samostatného `commands/utils/parseTools.ts`.

[SEVERITY: Medium] [FILE: apps/web/features/skills/Screen.tsx:52-104] [CATEGORY: Business logic/render logic in component]
`renderSection` je ~50řádková closure definovaná uvnitř těla `Screen` (rekreovaná při každém renderu), která míchá JSX rendering, empty-state větvení a delete-category akci — fakticky samostatná subkomponenta schovaná jako lokální funkce.
Vytáhnout do samostatné `<SkillCategorySection>` komponenty.

[SEVERITY: Medium] [FILE: apps/web/features/skills/Screen.tsx:34-208, apps/web/features/commands/Screen.tsx:17-107] [CATEGORY: Duplicate pattern]
Obě obrazovky opakují identický `isPending ? QueryLoading : isError ? QueryError : empty ? EmptyState : content` řetězec pro stav načítání katalogu.
Vytáhnout sdílený `<CatalogQueryState>` wrapper/hook použitelný oběma (a dalšími katalogovými screeny).

[SEVERITY: Low] [FILE: apps/web/features/skills/queries/useSkillsQuery.ts:26, apps/web/features/skills/DetailScreen.tsx:61, apps/web/features/skills/Screen.tsx:143] [CATEGORY: Missing/weak typing]
Tři samostatná místa přetypovávají nedůvěryhodný string z API (`glyph`) na `IconName` přes `as`, bez runtime validace.
Zavést jeden sdílený `toIconName(value): IconName` guard s fallbackem.

[SEVERITY: Low] [FILE: apps/web/features/skills/components/SkillFormFields.tsx:33-52, apps/web/features/skills/components/AddSkillModal/AddSkillModal.tsx:43, apps/web/features/skills/DetailScreen.tsx:61] [CATEGORY: Prop drilling / leaky abstraction]
`glyph` žije jako samostatný `useState` mimo RHF formulář (duplikovaně v AddSkillModal i SkillEditor) a `setInstructions` je surový imperativní callback protahovaný dolů, aby dítě mohlo zavolat `form.setValue` zvenčí.
Zaregistrovat `glyph` a merge-import jako reálná pole formuláře (přes `useFormContext` uvnitř `SkillFormFields`).

[SEVERITY: Low] [FILE: apps/web/features/commands/DetailScreen.tsx:21-24, apps/web/features/skills/DetailScreen.tsx:20-23] [CATEGORY: Duplicate pattern]
`CommandDetailScreenTestId` a `SkillDetailScreenTestId` jsou copy-paste enumy s identickými členy `Save`/`Delete`.
Po extrakci sdílené header-actions komponenty sloučit do jednoho sdíleného testid enumu.

[SEVERITY: Low] [FILE: apps/web/features/skills/hooks/useSkillFileList.ts] [CATEGORY: Missing test coverage]
Hook nese reálnou business logiku (filtrování přípon, řazení podle cesty, toggle, merge se separátorem), ale nemá vlastní unit test.
Přidat `useSkillFileList.test.ts` pokrývající drop-filtrování, toggle a merge-separator chování.

[SEVERITY: Low] [FILE: apps/web/features/commands/components/CommandFormFields.tsx, apps/web/features/skills/components/SkillFormFields.tsx] [CATEGORY: Missing test coverage]
Obě sdílené form-fields komponenty (použité na 2 místech každá) nemají vlastní test soubor.
Přidat cílené render testy pokrývající zapojení polí a větve idLocked/tab-switch.

[SEVERITY: Low] [FILE: apps/web/features/skills/components/AddSkillModal/SkillFileList.tsx] [CATEGORY: Missing test coverage]
Prezentační, ale netriviální (odvození folder-path, rendering checked stavu) list komponenta nemá test soubor.
Přidat test pokrývající logiku dělení folder-path a disabled stav import tlačítka.

STATS: 31 souborů (bez testových), 1617 řádků celkem. Top 3: skills/Screen.tsx (208), skills/components/SkillFormFields.tsx (164), skills/DetailScreen.tsx (159).

---
BATCH: web-subsystems

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx:141-322] [CATEGORY: file-size]
Component file is 322 lines, mixing the hero band (image/gradient rendering, close button, identity block), tab-shell composition, and two lifecycle effects (seen-tracking, Escape handling, focus management) in one function.
Split the hero band (image + close button + name/tagline/mandate/status block) into a `SubsystemDrawerHeader` subcomponent, keeping `SubsystemDrawer` as the composition root.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx:1-304] [CATEGORY: file-size]
File is 304 lines and combines the pure fit-to-view geometry math (`computeFitTransform`), a `ResizeObserver`-driven canvas subcomponent, and the tab's own pipeline/chain listing + dialog wiring.
Move `computeFitTransform` (and its `FitTransform`/constants) into a sibling geometry-only util file, mirroring the `SubsystemWeb/particle-mapping.ts` precedent already used elsewhere in this feature.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx:85-105] [CATEGORY: business-logic-in-component]
`computeFitTransform` is real, non-trivial geometry logic (bbox, scale, centering) defined directly inside a component file rather than a dedicated, non-React util module, unlike this feature's own `particle-mapping.ts`.
Extract to a pure util file (e.g. `roster-canvas-fit.ts`) so it's imported rather than co-located with rendering code.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/ArtefaktyTab.tsx:65-95] [CATEGORY: business-logic-in-component]
`nextStepPipelineId` and `consumerSubsystemName` implement chain-traversal/derivation logic (walking `chains[].steps` to resolve an artifact's downstream consumer) inline in the component file instead of a testable util module.
Move both functions to a util (e.g. `artefakty-derivation.ts`) alongside `particle-mapping.ts`'s pattern for pure, unit-testable logic.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/AktivitaTab.tsx:113-114] [CATEGORY: duplication]
The `ago` relative-time translator closure is defined byte-identically in `ArtefaktyTab.tsx:249-250` — same three-branch logic (agoNow/agoM/agoH) duplicated verbatim across two files in this batch.
Extract one shared `useRunAgoFormatter()` (or plain util taking `tRuns`) and import it from both tabs.

[SEVERITY: Medium] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx:222-223] [CATEGORY: duplication]
The `list.filter((x) => x.ownerSubsystem === subsystem.id)` pattern for pipelines/chains is reimplemented independently in `RosterTab.tsx` (pipelines+chains), `AktivitaTab.tsx:96-101` (pipeline/chain id sets), `ArtefaktyTab.tsx:223` (pipelines), and `GatesTab.tsx:217` (rules) — four near-identical ownership filters with no shared helper.
Add a shared selector/hook (e.g. `useOwnedPipelines(subsystemId)` / `useOwnedChains(subsystemId)`) so the ownership contract lives in one place.

[SEVERITY: Low] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/AktivitaTab.tsx:93] [CATEGORY: duplication]
`const [now] = useState(() => Date.now())` with the identical "render-stable now" comment is repeated in `ArtefaktyTab.tsx:217`.
Factor into a shared `useStableNow()` hook used by both tabs.

[SEVERITY: Low] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx:165-179] [CATEGORY: duplication]
Raw `document.addEventListener("keydown", …)` Escape handling plus manual focus-save/restore reimplements an a11y idiom the DS `Dialog` already owns, and the same ad-hoc pattern recurs in `ChatDetailDialog.tsx`, `ChatPalette.tsx`, `ChatScreen.tsx`, and `CommandLine.tsx` (outside this batch) — five independent implementations of the same behavior project-wide.
Extract a shared `useEscapeKey`/`useFocusTrap` hook (could live in DS or a shared web hook) rather than each consumer wiring its own listener.

[SEVERITY: Low] [FILE: apps/web/features/subsystems/components/SubsystemDrawer/GatesTab.tsx:1-248] [CATEGORY: composition]
File hosts three fairly distinct concerns — mad-libs sentence rendering (`GateRuleSentenceRow`), the per-project autopilot dial (`ProjectAutopilotRow`/`AutopilotSummary`/`hasAutonomyPolicy`), and the tab shell hosting `GateRulesSection` — all as local functions in one file. Under the 300-line threshold today but trending up.
Consider splitting `GateRuleSentenceRow` and the `AutopilotSummary` family into sibling files before the tab grows further.

STATS: files=16, total lines=2847, top 3 largest: SubsystemDrawer.tsx (322), RosterTab.tsx (304), ArtefaktyTab.tsx (300).
No `any`, `@ts-ignore`/`@ts-expect-error`, or unsound `as` casts found in this batch (all `as Route` uses are the project's standard Next.js typed-route idiom). Query/mutation hooks are clean and follow conventions. Test coverage across all five tab/component files is thorough.

---
BATCH: web-tasks-components

[SEVERITY: Critical] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:1-1099] [CATEGORY: File size / component decomposition]
Single file at 1099 lines mixes mention-picker state machine, caret DOM measurement, file upload/drag-drop, highlight computation, and rendering all in one component.
Split into `useMentionPicker` (mention/caret/keyboard-nav state), `useAttachmentUpload` (upload/drag-drop/remove), a `MentionMenu` subcomponent (the portaled dropdown, ~lines 954-1029), and a `caretRect.ts` util (measureCaretRect + CARET_MIRROR_PROPS).

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:288-323] [CATEGORY: Business logic in component]
`measureCaretRect` performs raw DOM layout measurement (creates/injects a mirror `<div>` into `document.body`, reads computed style and offsets) directly inside the component file rather than an isolated, independently-testable utility module.
Extract to a standalone `caret.ts` util so it can be unit-tested without mounting the component.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:442-454] [CATEGORY: Duplicate pattern — ad-hoc event listener]
The mention panel's scroll/resize reposition effect is a raw `window.addEventListener("scroll"/"resize", ...)` pair; the same fixed-menu reposition-on-scroll/resize pattern already exists independently in `libs/design-system/src/components/Dropdown/Dropdown.tsx`, `MenuButton/MenuButton.tsx`, and `DropDownButton/DropDownButton.tsx` (the code comment even says it "mirrors DropDownButton's fixed-menu reposition").
Factor a shared `useAnchoredPosition`/`useFloatingReposition` hook (DS-level) and reuse it in all four places instead of a fourth ad-hoc copy.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:184-188] [CATEGORY: Duplicate logic]
The `paths` derivation (`extractPaths(text)` merged with the selected project's path, deduped via `[...new Set(all)]`) plus the `selectedProject` lookup are byte-for-byte duplicated in `apps/web/features/tasks/components/NewTaskDialog.tsx:78-90`.
Extract a shared `useProjectScopedPaths(text, projectId)` hook or a `mergePathsWithProject` util in `../task.ts` and use it in both places.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/TaskAttachments.tsx:1-87] [CATEGORY: Dead code / duplicated logic]
The `TaskAttachments` component (drop-zone, upload, error state, remove) is never rendered anywhere in the app — only its exported `TaskAttachmentSet` type is imported elsewhere (`AutomationFormDialog.tsx`, `automations/DetailScreen.tsx`); the only JSX usage is in its own test file. Meanwhile `CommandLine.tsx` reimplements the same upload/error/remove flow inline (lines 678-721) against the same `useUploadTaskAttachmentsMutation`.
Delete the unused component (keep just the `TaskAttachmentSet` type, or move it to `task.ts`), or if it's meant to stay reachable, wire it in and share the upload logic with `CommandLine` via one hook.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:54-98] [CATEGORY: Prop drilling]
`TaskCommandLineProps` re-declares roughly 18 "presentational pass-throughs, forwarded verbatim" that duplicate `CommandLineProps` field-for-field, then forwards them unchanged into `CommandLine` at the bottom of the component; the two interfaces can silently drift.
Derive the passthrough slice via `Pick<CommandLineProps, ...>` (or spread a single `commandLineProps` object) instead of hand-copying each field.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:94-123] [CATEGORY: Business logic in component]
Merging an explicit `@`-mention `target` with the classifier's `activeRouting` into `previewRouting`, and the render-phase tool-grant reseeding (`proposedGrantsKey` comparison), are nontrivial business rules living directly in the dialog component rather than alongside `useTaskClassification`.
Move `previewRouting` derivation and grant-reseeding into a hook (e.g. extend `useTaskClassification` or a new `useTaskRoutingPreview`) so the dialog stays presentational.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:152-244] [CATEGORY: Component written for one place]
The `@`-mention query matcher, caret-anchored dropdown, and highlight-tone resolution (`checkMention`, `mentionRanges`, `MENTION_QUERY_RE`) are generic rich-text-composer behavior, not task-specific, but live entirely inside this one feature component with no DS-level counterpart.
Consider promoting this to a DS-level `MentionTextAreaField`/`useMentionPicker` primitive per the project convention that DS is the default source of primitives — apps/web currently owns machinery that would benefit any future composer (chat, automations) needing `@`-mentions.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:661] [CATEGORY: Type safety]
`id: result.id as SubsystemId` — `MentionResult.id` is typed as plain `string` across all three kinds, forcing a cast to reconstruct a `subsystem`-kind `TaskTarget`.
Type `MentionResult` as a discriminated union keyed on `kind` (mirroring `TaskTarget`) so the `subsystem` branch's `id` is `SubsystemId` without a cast.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/TaskOutputField.tsx:33] [CATEGORY: Type safety]
`onValueChange={(v) => onOutputTypeChange(v as OutputType)}` and the sibling `v as FileDest` cast the untyped string from `SelectField` without narrowing/validating against the actual union.
Consider a small `asOutputType(v: string): OutputType` guard (shared with `LoopComposer.tsx`'s identical `value as VerifierKind` cast) instead of a bare `as`.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:494,550] [CATEGORY: Hooks discipline]
Two `// eslint-disable-next-line react-hooks/exhaustive-deps` suppressions (injected-target consumption effect, pending-suggestion submit effect) intentionally read stale closures over `text`/`injectedTarget`; justified by comments but still a hidden-stale-closure risk if the surrounding logic changes.
No action required now, but flag these two effects for extra scrutiny in future edits to this file.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:352-372] [CATEGORY: Component decomposition]
The classification-ack row (OrbitLoader + two Typography lines + dismiss button) is a self-contained ~20-line visual block inlined at the bottom of the 375-line container.
Extract to a small `AckRow` subcomponent to shrink `TaskCommandLine` back under the 300-line guideline.

STATS: 11 source files (test files excluded from line count), 2184 total lines. Top 3 largest: CommandLine.tsx (1099), CommandLine/TaskCommandLine.tsx (375), NewTaskDialog.tsx (215).

---
BATCH: web-tasks-core

[SEVERITY: Critical] [FILE: apps/web/features/tasks/hooks/useTaskClassification.ts:94-99] [CATEGORY: React Anti-pattern]
Direct setState volání v těle hooku (render time) místo v useEffect; "adjust state on prop change" pattern se implementuje synchronně bez efektu. Řádky 94-99 se měly balit do useEffect s závislostí na `proposedGoalKey`.
Přesuň setState volání do useEffect s explicitní závislostí na `proposedGoalKey`, nebo použij derived state pattern.
POZN. ORCHESTRÁTORA: render-time "adjust state during render" JE oficiálně dokumentovaný React pattern (react.dev: "Adjusting state when a prop changes") — severity pravděpodobně nadsazená, ověřit při agregaci; skutečný problém je spíš duplikace tohoto vzoru na 3 místech bez sdíleného hooku.

[SEVERITY: Critical] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:114-123] [CATEGORY: React Anti-pattern]
Stejná chyba jako v useTaskClassification: setState volání v render body (řádky 120-123 se volají během render, ne v efektu).
Přesuň do useEffect s závislostí na `proposedGrantsKey`.
POZN. ORCHESTRÁTORA: viz pozn. výše — vzor je legální, problém je duplikace bez `useSeededState` abstrakce.

[SEVERITY: Critical] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:471-482] [CATEGORY: React Anti-pattern]
setState volání v render body pro injected target. Komentář (467-470) obhajuje jako "React's pattern".
Přesuň setState volání (řádky 472-481) do useEffect s závislostí na `injectedTarget`, respektive `prevInjectedTarget`.
POZN. ORCHESTRÁTORA: viz pozn. výše.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:1] [CATEGORY: Component size]
Komponenta má 1099 řádků. Mention dropdown (řádky 954-1029), file attachment tiles (řádky 887-912), suggestion chips (řádky 1033-1049) jsou samostatné UI unitky ideální pro extrakci.
Rozděl CommandLine na menší komponenty: MentionDropdown (~80 řádků), AttachmentTiles (~50 řádků), SuggestionChips (~30 řádků).

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:54-99] [CATEGORY: Prop drilling]
Interface TaskCommandLineProps má 30+ properties. Mnohé jsou pass-through do CommandLine (rows, maxRows, placeholder, label, atd.), jiné jsou task-specifické.
Seskup pass-through properties do objektu (CommandLineOptions) a task-specific do jiného; nebo vytvoř type mapping helper.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:55-150] [CATEGORY: Prop drilling]
CommandLineProps má 18+ properties. Těžko se pamatuje, které jsou povinné. `renderTrailing` callback (147-149) je ad-hoc pattern.
Zvážit: group properties do objektů (draft, actions, ui).

[SEVERITY: Medium] [FILE: apps/web/features/tasks/hooks/useTaskSubmit.ts:88-89] [CATEGORY: Type safety]
Parameter `res` v callbacku `handleCreateTaskSuccess` nemá explicitní typ.
Přidej explicitní type annotation.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:70-71] [CATEGORY: Duplicitní state pattern]
`checkedGrants` / `seededGrantsKey` pattern (řádky 70-71, 114-123) je stejný jako v useTaskClassification (`seededKey`). Mělo by to být v custom hooku `useSeededState` nebo `usePropToStateSync`.
Extrahuj do custom hooku.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:471-495] [CATEGORY: State coherence]
Inject target pattern (471-482) je setState v renderu, ale `onInjectedTargetConsumed` callback (489-495) je v efektu čtoucím text z closure bez dependency — nesoulad dvou polovin téhož flow.
Sjednotit obě akce do jednoho místa s explicitními dependencies.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:256-278] [CATEGORY: Vyčlenitelné utility]
CARET_MIRROR_PROPS array (256-278) je 20+ property stringů pro DOM měření; measureCaretRect ~40 řádků logiky přímo v souboru komponenty.
Vytvoř `utils/caretMeasure.ts` s `measureCaretRect` a CARET_MIRROR_PROPS jako export.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/hooks/useTaskClassification.ts:45-165] [CATEGORY: Complex logic]
Hook má 165 řádků s komplexní logikou: dispatch mutation, debounce, loop state management, target picker logic.
Rozděl do dvou hooků: `useClassifyTask` (dispatch) + `useTaskClassificationState` (ui state).

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:86-90] [CATEGORY: Computed state duplication]
`paths` se počítá v NewTaskDialog (useMemo) a předává do useTaskClassification — není jasné, která strana je kanonická.
Vyjasnit vlastnictví výpočtu paths.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:202-205] [CATEGORY: Code style]
Funkce `computeRows` je lokální drobný helper použitý v inline výrazu.
Přesuň do `task.ts` utility functions, aby byla znovupoužitelná a testovatelná.

[SEVERITY: Low] [FILE: apps/web/features/tasks/mutations/index.ts] [CATEGORY: Barrel export pattern]
Mutations re-exportovány z index.ts, queries index.ts pokrývá jen část hooků — nekonzistence.
Sjednotit barrel exporty.

STATS: ~25 zdrojových souborů (4 root + 4 hooks + 1 query + 5 mutations + 11 components), ~4200 LOC bez testů. Top 3: CommandLine.tsx (1099), TaskCommandLine.tsx (375), NewTaskDialog.tsx (215). Critical 3 / High 3 / Medium 5 / Low 3.

