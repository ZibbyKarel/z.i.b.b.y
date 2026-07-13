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
