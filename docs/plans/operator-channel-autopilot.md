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
- [ ] Phase 2 — inbound operator messages
- [ ] Phase 3 — thread feedback
- [ ] Phase 4 — autopilot
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
