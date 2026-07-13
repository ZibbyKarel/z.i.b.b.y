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
