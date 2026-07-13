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
