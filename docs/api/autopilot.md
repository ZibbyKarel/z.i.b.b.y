# Autopilot

Autopilot is a temporary overlay that the operator switches on. While it is on, a short
allowlist of gate `ask` classes behaves as Tier 2: ZIBBY acts first and reports afterwards.
Never-rules and merge are not affected. Only the operator token can turn autopilot on.
Anyone in the operator chat can turn it off.

Code: `apps/api/src/autopilot/`. Contract: `libs/contracts/src/autopilot/`.
Web: the Autopilot toggle in the bridge dashboard header.

## State

`autopilot.json` in the data dir (`AUTOPILOT_DIR` overrides it) holds the state:

```json
{ "level": "full", "since": "2026-10-29T12:00:00.000Z", "by": "operator" }
```

`level` is `off` or `full`, and `by` is `operator` or `chat`. A missing or malformed file
counts as `off`. The file is read once at boot and cached, because the gate evaluator is
synchronous. Use the API to switch the level: a hand edit only takes effect after a restart.

## Endpoints

| Route                | Auth                      | Notes                                                                        |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/autopilot` | none                      | The state plus `pendingApprovals` (the count waiting now)                    |
| `PUT /api/autopilot` | operator token for `full` | `{ level }`. `full` without the token returns `401`; `off` is always allowed |

Setting the level it already has does nothing: the file isn't written and no notice is sent.

The chat MCP tool `autopilot_off` calls the same service with `by: "chat"`. There is no tool
that turns it on. The self-API also denies the `autopilot` router, so `api_call` can't reach
it either.

## What it covers

The allowlist is matched in two places, and both are hard-coded in `autopilot.service.ts`.

**Gate side** (`AUTOPILOT_COVERED_RULES`). This applies only to a **locked system rule** that
has these ids. The intent itself is also checked, so editing a rule's match can never widen
the overlay:

- `floor-gh.pr_comment` for intent `gh.pr_comment`. The hook classifies a `gh api` POST as
  this when it targets a PR review comment, a comment reply, or an issue/PR comment, with
  its fields given inline. Reviews (`/pulls/<n>/reviews`) are never `gh.pr_comment`: every
  review POST, whatever its `event`, stays `gh.api_write` (ZIBBY posts its own reviews
  server-side through the `pr-review` flow). An `--input` body (a file or `-`) can't be
  inspected, so it stays `gh.api_write` too, as do PATCH and DELETE.
- `floor-gh.api_write`, but only for intent `gh.pr_comment`. `gh.pr_comment` is a subclass
  of `gh.api_write`, so a rule on action `gh.api_write` also matches a comment. The system
  `gh.api_write` rule therefore also hits a comment, and its `ask` is lifted only for that
  comment. If the operator moved it to `deny`, or any other rule on `gh.api_write` asks or
  denies, that still wins.
- `floor-git.push` for intent `git.push`, but only onto a `zibby/<…>` branch (ZIBBY's own run
  branches). The hook names that `branch` only for a push with exactly one refspec, with
  `src:dst` and `refs/heads/` normalised (`HEAD:zibby/x` counts). These are not covered:
  several refspecs, a `:dst` delete refspec, `--all`, `--mirror`, `--tags`, `--delete`/`-d`,
  push options (`-o`/`--push-option`), `--repo`, any flag other than `-u`/`-q`/`-v`, no
  refspec at all, and every force push (`-f`, `--force*`, a `+` refspec, which is
  `git.force_push`). For those pushes the hook lists every destination in `branches`
  instead, and a branch rule (`gr-push-main`) matches if any of them is its branch.

A covered hit resolves as `notify` and carries `via: "autopilot"`. It is folded into the
floor bucket only when it is strictly stricter than what is already there. The evaluator
then picks the strictest result across the agent's own rules, the department rules and the
floor. This means another global `ask` on the same intent still wins. An agent's or
department's `ask`, `deny` or `requires_approval` also still wins: agent tightening holds.

**Approval side** (`autopilotCoversApproval`). A park site checks this right after it raises
a fresh approval. A match alone is not enough: the park site then builds the gate intent the
approval stands for (`autopilotIntentFor`: `gh.pr_comment` for a review or replies, or
`git.push` with the exact head branch) and asks `GateEvaluatorService.autopilotDecides`. That
call evaluates the intent for the run's own agents and department (an agent target: that
agent; a workflow target: every phase agent and the workflow's department). It approves, with
`decidedBy: "autopilot"`, only when every evaluation resolves through the overlay
(`via: "autopilot"`). An operator, agent or department `ask`/`deny`, a department
`tierDefault: ask`, an unresolvable target or a missing intent leave the approval pending.

| Approval kind         | Covered when                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pr-review`           | action `github.pr.review`. Posted as `COMMENT`; autopilot never picks a review event                                 |
| `workflow-gate`       | it carries `suggestedReviewEvent` and the run's task carries `prReview` (a real pr-review task). Posted as `COMMENT` |
| `pr-address-comments` | action `github.pr.comment` (replies), or a `git.push` onto a `zibby/*` head that has no open question                |
| `pr-fix-ci`           | a `git.push` onto a `zibby/*` head of ZIBBY's own PR                                                                 |
| `channel`             | action `channel-reply`, and the draft is autopilot-eligible (below)                                                  |

A workflow gate is never covered by its artifact name alone: a workflow whose last phase
writes `zibby-pr-review.md` but whose run has no pr-review task keeps its operator checkpoint.

**Channel replies.** A parked reply is sent by autopilot only when the tier alone parked it.
`parkOrSurface` computes an explicit eligibility flag, and the park site approves only with it.
The flag is set only when all of these hold:

- the verdict is actionable and its confidence is at least the triage floor;
- the mandate allows a reply for the integration;
- the project policy didn't force Tier 3 (`respond_as: "draft_only"`, or a VIP sender with
  `vip_escalation`);
- the reply gate (`channel-reply`, plus `send_email` for email) resolves to `allow` or
  `notify`, with no `ask` or `deny`.

A parked reply always has a concrete draft; no draft means no approval.

Everything else is not covered: merge, deploy, payments, spend past cap, deletes, force push
and rebase, `gh.api_write` other than a comment, email, operator questions, PR opening sign-off, Jira creates,
graduations, and so on.

## Guarantees

- **Overlay only.** Stored gate rules are never modified, and turning autopilot off restores
  the exact previous evaluation (`gate-evaluator.autopilot.test.ts`).
- **Never-rules hold.** A `deny` stays `deny`, and every non-covered `ask` stays `ask` (same test).
- **Pending stays pending.** Only park sites that raise a new approval call `approve`.
  Approvals already waiting when autopilot is switched on are left alone, and the switch
  notice reports how many there are.
- **Comms graduation isn't fed.** A channel reply that autopilot sends is not recorded as an
  operator decision in the graduation ledger.

## Accountability

- Every action the overlay lets through records an `autopilot-action` activity entry. Gate
  hits record the action, branch and rule. Approvals record `decidedBy: "autopilot"` on the
  record and the approval id.
- Switching it on or off records `autopilot-changed`. The summary includes the pending count
  when it is turned on.
- Both kinds map to the operator-channel event `autopilot-action` (Tier 2, on by default,
  toggled in `notify.events`). An approval that autopilot decided does not also send an
  `approval-waiting` ping.
