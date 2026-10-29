# Operator channel (Slack) + Autopilot — night run plan

Branch `feat/operator-channel`, worktree `worktrees/operator-channel`. Source brief: the
"Slack operator channel — two-way control of ZIBBY from the phone" assignment (pasted by the
operator on 2026-10-29), phases 1–3 below follow it verbatim except where the decisions override.

## Operator decisions (2026-10-29, binding)

1. **Integration:** one worktree, one commit series per phase, no PRs. When all phases are green,
   merge `feat/operator-channel` into `main` and push. (Overrides the brief's "one PR per phase".)
2. **Scope:** Slack phases 1–3, then Phase 4 Autopilot.
3. **Slack app:** none exists yet. Ship the manifest + setup doc; all tests run against
   `FakeOperatorChannel`. The operator creates the app and stores the `xoxb`/`xapp` tokens later.
   Workspace choice (own vs existing) is left open in the setup doc.
4. **publicBaseUrl:** Tailscale (private tailnet URL). Only the settings field + docs; no Tailscale
   config in code.
5. **Quiet hours:** supported, default off. **Copy:** cs + en parity, default cs.
6. **Approvals from Slack:** stay OFF (link buttons only), as in the brief.

## Phase 4 — Autopilot (operator design)

A dashboard button "Autopilot" (bridge dashboard, the only screen the operator uses).

- **Levels:** `off` | `full`. Manual only — no timer; stays on until the operator turns it off.
- **Full:** gate rules whose decision is `ask` and that cover the classes below resolve as
  **act-then-report (Tier 2)** while autopilot is on:
  - GitHub outbound: posting PR reviews/comments, pushing commits to ZIBBY's own PR branches.
  - Channel replies to clients (Slack / email) — still only when a concrete reply exists
    ("a reply is concrete or it is not drafted" is unchanged).
  Example: someone requests a review → ZIBBY does it and posts it to GitHub as if the operator
  approved it.
- **Never-rules stay:** merge, deploy, payments/spend past cap, credential entry, permission
  changes, irreversible deletes are untouched by autopilot. Calendar decisions untouched.
- **Temporary and non-destructive:** autopilot is an overlay evaluated by the gate, it never
  rewrites the stored gate rules. Turning it off restores the exact previous behaviour.
- **Accountability:** every action autopilot let through is logged (activity + audit with
  `via: autopilot`) and reported to the operator over the operator channel (Slack).
- **Who can toggle:** turning ON requires the operator token (dashboard). Turning OFF is also
  allowed from the Slack operator DM (tightening only; a Slack message can never turn it on — Law 4).
- Autopilot state is a file on disk (`autopilot.json`), contract-first endpoint, North Star /
  autonomy contract docs updated to describe it.

## Progress

- [x] Phase 1 — outbound notifications
- [x] Phase 2 — inbound operator messages
- [x] Phase 3 — thread feedback
- [x] Phase 4 — autopilot
- [ ] Final: project-wide checks, merge to main, push

## Phase 1 notes

Shipped on `feat/operator-channel`: contract (`3d0d1970`), API (`783eb6d8`), web settings card
(`71479177`), docs (the doc commit after it). Reference: `docs/api/operator-channel.md`.

- **Library choice.** No Slack SDK. Plain `fetch` to the Web API covers the four calls Phase 1
  needs (`auth.test`, `conversations.open`, `chat.postMessage`, `chat.update`), following the
  `slack.adapter.ts` precedent. For Phase 2 Socket Mode, `@slack/socket-mode` is preferred over
  `@slack/bolt`, which pulls in express and receivers we don't need. Node's global `WebSocket`
  on `apps.connections.open` is the zero-dependency fallback.
- **Event mapping.** The notifier only subscribes to the activity stream and adds no new emit
  points:
  - `pr-opened` and `run-completed` come from `task-outcome` plus the task's `outcome.pr`.
  - `review-finished`, `budget-cap` and `approval-waiting` come from `approval-requested`.
  - `run-parked` comes from `workflow-parked` (retries/limit only) and `goal-parked`.
  - `ci-red` comes from `monitor-alert` and from `post-merge-outcome` with a fix task.
  - `briefing` comes from `briefing-generated`.
  - Everything else is Tier-1 and is never sent.
- **Gaps.** "PR opened" has no dedicated event. It is derived from the task outcome, so a PR
  opened outside a task run (e.g. by a workflow's own `gh pr create`) isn't announced.
  Failed or dead-lettered runs aren't mapped.
- **Bot-DM exclusion.** It is implemented in `slack.adapter.ts`: both legs skip
  `dmChannelId`.
- **Deferred.**
  - A `GET /deliveries` list endpoint (the status shows only the last delivery).
  - Web editors for quiet hours, `maxPerHour`, `publicBaseUrl` and `operatorUserIds`, and token
    entry. These go through the API for now.
  - `deliveries.jsonl` rotation.
  - Dedupe persistence across restarts (not needed while the stream doesn't replay).
- **Open for the operator.** The real app in _Zibby's_ still needs the `im:*` and
  `users:read` scopes added and a reinstall before the first real send.

## Phase 2 notes

Shipped on `feat/operator-channel`: contract (`listening` in the status), API (inbound
service, Socket Mode, dedupe, guards, tests + e2e), and docs. Reference:
`docs/api/operator-channel.md#inbound-phase-2`.

- **Transport.** Socket Mode runs on Node 24's global `WebSocket` with `apps.connections.open`
  (app token). No new dependency. It acks before handling, refreshes on `disconnect` and
  reconnects with a 1 s → 30 s backoff. `@slack/socket-mode` would add `ws`,
  `@slack/web-api` and an event emitter for the same few lines.
- **Conversation id.** It is `slack-dm-<dmChannelId>`, one stable thread for the top-level
  DM. It is visible in the web chat history. Phase 3 binds thread replies to their own
  conversation. Until then a thread reply is handled like a top-level message, and the
  answer is posted top-level.
- **Confirm buttons.** They are a heuristic: an answer ending with `?` gets Yes/No reply
  buttons, and a tap is the operator's next chat turn (`Ano.` / `Ne.`). The chat has no
  structured "confirm" signal, and adding one would mean changing the shared governor
  prompt. A tap never decides an approval.
- **Guards.** 6 turns per minute, 200 per day, 1 in flight per conversation plus 3 queued,
  4000 characters to the model, 1 placeholder update per 2 s. These are instance fields
  (test seams), not settings. Budget: tasks hit the scheduler's existing budget guard.
- **Autopilot-off hook.** Skipped. Phase 4's chat/MCP tool will reach Slack through the
  chat with no extra code.
- **Deferred.**
  - Per-turn delta streaming (milestones only, as briefed).
  - A `via: slack` marker on transcript messages.
  - Rate-limit counters don't survive a restart (in memory).
  - Escaping runs before splitting, so in rare cases a chunk boundary can split a `&amp;`.

## Phase 3 notes

Shipped on `feat/operator-channel`: API (thread bindings, in-thread replies, follow-up
routing, tests + e2e) and docs. Reference: `docs/api/operator-channel.md#thread-feedback-phase-3`.
No contract change (the binding is an internal file, no new endpoint).

- **Loop entry.** No existing entry fits: a "PR opened" run is `done` (terminal); the loop
  takes new input only while live (`addOperatorMessage`) or parked (`resumeParked`), and the
  chat can't call resume (self-API denylist). Feedback therefore becomes a follow-up task via
  the normal `create_task` path. Its own workflow runs the existing bounded loop, unchanged.
  Linked by `followUpTaskIds` in `thread-bindings.json`, flagged by the task text prefix
  `Navazující úkol k: …`.
- **Conversation id.** `slack-thread-<thread_ts>`, one per bound thread. Top-level DM stays
  `slack-dm-<dmChannelId>`; unbound thread replies use the DM one (Phase-2 behaviour).
- **Clarifying question** is a line in the `about` details, not a classifier.
- **Binding scope.** Only single-event messages bind; coalesced ones don't.
- **e2e root cause (Phase 2 flake).** The "spusť úlohu" test's dispatched run reports
  `run-completed` up to the 3 s coalesce window later, so it landed inside the next tests
  (coalesced with their messages or becoming `sent.at(-1)`). That test now waits for the
  delivery line of its own task. 12/12 green after the fix.
- **Deferred.**
  - Resuming a *parked* run from its `run-parked` thread (`resumeParked` with the reply as the
    operator note). It needs a chat tool, which the self-API deliberately denies today; the
    thread gets the `about` context, and resume stays on the dashboard.
  - The flag is in the task text, not a structured `followUpOf` field on `ScheduledTask`.
  - `branch` is usually absent on `pr-opened` (the pending output is cleared on push); the PR
    url is the reference.
  - Notices (rate limit / busy) are still posted top-level, even for a thread reply.

## Phase 4 notes

Shipped on `feat/operator-channel`: contracts (`autopilot` resource, activity and event
kinds, `via` / `decidedBy` markers), API (service, controller, gate overlay, park-site
approvals, `autopilot_off` chat tool, notifier mapping, tests and e2e), web (the bridge
header toggle) and docs. Reference: `docs/api/autopilot.md`.

- **Allowlist, two seams.** Gate seam: `AUTOPILOT_COVERED_RULES` is keyed by system rule
  id (`floor-gh.pr_comment`, and `floor-git.push` onto `zibby/*` only), and the intent is
  re-checked. Approval seam: `autopilotCoversApproval` covers `pr-review`, the pr-review
  `workflow-gate`, `pr-address-comments` replies plus a push onto `zibby/*`, a `pr-fix-ci`
  push onto `zibby/*`, and `channel` replies.
- **New hook action `gh.pr_comment`.** Before this, PR comments were part of
  `gh.api_write`, which was too broad to lift. A new system ask rule
  (`floor-gh.pr_comment`) keeps the default behaviour the same (ask).
- **Tightening is preserved by construction.** The overlay only rewrites a locked
  global hit, and only when that result is strictly stricter than what the floor already
  has. The evaluator's strictest-of-buckets pick then lets any agent, department or other
  global `ask`/`deny` win.
- **Reviews are posted as `COMMENT`.** Autopilot never chooses APPROVE or REQUEST_CHANGES.
- **Deferred.**
  - The `approval-requested` ping is skipped only if the notifier's lookup already sees
    `decidedBy: autopilot`. In a race, a stale "waiting" ping can still go out before the
    autopilot approval.
  - The `gh pr comment` / `gh pr review` CLI subcommands are not classified (same as before
    this phase). Only `gh api` POSTs map to `gh.pr_comment`.
  - A hand edit of `autopilot.json` only takes effect after a restart (the state is cached).
  - Saved `notify.events` lists don't include `autopilot-action` (documented).
  - The Comms ledger entry stays pending for a reply autopilot sends. This is deliberate: it
    doesn't count toward graduation.
  - A department whose `tierDefault` is `ask` (or one with its own ask rule) blocks the
    overlay for that department. That is the intended tightening, but worth knowing.
  - The workflow-gate approve has a runner-level unit test now (`parkAtGate` via the
    harness), but no e2e: a positive e2e would post to GitHub.
- **Review fixes.** These came out of the code review of Phase 4, one commit each:
  - Push: the hook named the second positional as the branch, so
    `git push origin zibby/1-x main` was lifted. Now `branch` is set only for one plain
    refspec, and every other push lists its destinations in the new `IntendedAction.branches`.
    A branch rule (`gr-push-main`) matches any of them.
  - Reviews: `/pulls/<n>/reviews` is no longer `gh.pr_comment` (`--input`, `--field=event=…`
    bypassed the verdict check). Any `--input` stays `gh.api_write`, and the `--field=` form
    now counts as a POST.
  - `gh.pr_comment` is a subclass of `gh.api_write` in the matcher, so existing
    `gh.api_write` rules still hit comments. The overlay lifts the system `gh.api_write` `ask`
    only for a comment.
  - Channel replies: autopilot sends only an autopilot-eligible draft (actionable, confident,
    mandate reply, not forced to Tier 3, reply gate allow/notify).
  - Approval side: before approving, the park sites ask the gate evaluator for the run's
    agents and department (`autopilotDecides`), and fail closed.
  - Workflow gate: it is covered only when the run's task carries `prReview`, not because of
    the artifact name.
  - Operator channel: one in-flight connect is shared, and reset/stop close the listener's
    socket too.
