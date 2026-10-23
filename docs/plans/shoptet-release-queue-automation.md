# Shoptet release-queue automation (idea / design notes)

Status: **idea, not started.** Captured 2026-10-23 from a design discussion; not in TODO.md
because the TODO backlog was being executed at the time.

## Goal

After the operator's PR is merged to `master` in `shoptet/cms4`, ZIBBY watches the release
queue and, when it is the operator's turn, runs the deploy and monitors it. The operator is
notified (and asked) only where judgment is needed.

Shoptet process: merged developers wait in a queue; when it is their turn they run one script
that deploys everything; another script tells who is next.

## What exists in cms4 (verified in `~/Workspace/cms4`)

Docs: `tools/release/docs/*.md`, `docs/release/quick-actions.md`. Code: `tools/release/src/CliCommands`.

| Need | Command | Notes |
| --- | --- | --- |
| Who is next | `st-release-cli release:status` | Safe to run locally (`#[AllowLocal]`). Table of last N commits in release order; columns `needs deploy`, `cherry picked`, note `<-needs task release`. Has `--json-report=FILE` (schema not yet read, see `generateJsonReport`). Outside devenv needs `--skip-env-check`. |
| Commit detail | `st-release-cli release:task-info <SHA>` | Shows if the commit is blocked / blocking others, has migrations. |
| Deploy | `dev-ssh st-release-task <SHA>` | Run from the devenv console. |
| Locks | `release:global-lock:*`, Slack `/cz3-release-lock` | When locked, task release asks for extra confirmation. |

Guards on `st-release-task` (never bypass automatically): `--ignore-lock` (global lock),
`--ignore-timer-lock` (release time window), `--ignore-blocking-check` (older unreleased commit
blocks this one), `--ignore-infra-check`.

Failure semantics from the docs: a failed task release leaves the **global lock in place**;
retry needs `--ignore-lock`, which after success keeps the lock until manual unlock.
Rollback is `st-setup-release-cms4-rollback` and intentionally locks releases until a revert
commit is released. → ZIBBY never retries or rolls back on its own.

## Proposed flow

1. **Trigger** — GitHub watcher sees the operator's PR merged to `master`; stores the merge SHA
   as a release job (`queued`).
2. **Poll every ~5 min** — deterministic command, no LLM: `release:status --json-report`.
   "My turn" = my commit is the oldest `needs deploy` and not cherry-picked, `task-info` does not
   report it blocked, release is not globally locked and not in a timer-lock window.
3. **My turn** — job becomes `ready`; ZIBBY asks the operator once (with `task-info` output).
   Tier 3: `auto-deploy` is on the "Never" floor; the operator moves that rule in the gates page
   when comfortable (start with ask-per-release, later allow for this one command).
4. **Run** — `dev-ssh st-release-task <SHA>` as a run, log streamed over SSE.
5. **Watch** — exit code, timeout, known error patterns. Failure → notification with log tail,
   then wait for the operator. Success → one line in the briefing.

## Slack

- The Slack message "you are next" is posted by `st-slack` (HTTP POST) in `#cz3-release`
  ("mention next person in queue").
- ZIBBY's own Slack adapter (`apps/api/src/channels/adapters/slack.adapter.ts`) polls
  `conversations.history` with a **bot token** per configured channel, but **skips messages with
  `bot_id` / `subtype`** (likely drops that message — unverified) and does not filter mentions.
  It would also need a Slack app installed in Shoptet's workspace.
- The Claude Code Slack connector is a separate path (claude.ai OAuth); ZIBBY's backend can't use it.
- Decision: use `release:status` as the signal, Slack adapter is a possible later fallback only.

## Open questions (verify before implementing)

- Does `st-release-task --no-interaction` skip the confirmation prompt? (Symfony built-in flag;
  other commands check `isInteractive()`; check `CommonReleaseCommand` / `TaskReleaseService`.)
- Schema of the `--json-report` file.
- Where does ZIBBY run relative to the devenv console (`dev-ssh` needs devenv, VPN, SSH agent)?
- What to do when the operator's turn passes unanswered, or the timer-lock window is closed.
- Is running a Slack bot / external token acceptable in Shoptet's workspace (only if Slack fallback is wanted).

## Next step

Resolve the open questions, then write the real implementation plan (workflow + monitor +
gate rule) and file it via `zibby:plan-to-backlog` / TODO.md.
