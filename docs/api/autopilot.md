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
  this when it targets PR review comments, comment replies, a review whose `event` is absent
  or `COMMENT`, or issue/PR comments. APPROVE and REQUEST_CHANGES reviews, PATCH and DELETE
  all stay `gh.api_write`.
- `floor-git.push` for intent `git.push`, but only onto a `zibby/<…>` branch (ZIBBY's own run
  branches). Pushes to `main`, a feature branch, or with no branch, plus every force push,
  are not covered.

A covered hit resolves as `notify` and carries `via: "autopilot"`. It is folded into the
floor bucket only when it is strictly stricter than what is already there. The evaluator
then picks the strictest result across the agent's own rules, the department rules and the
floor. This means another global `ask` on the same intent still wins. An agent's or
department's `ask`, `deny` or `requires_approval` also still wins: agent tightening holds.

**Approval side** (`autopilotCoversApproval`). A park site checks this right after it raises
a fresh approval, and approves it immediately with `decidedBy: "autopilot"`:

| Approval kind         | Covered when                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `pr-review`           | action `github.pr.review`. Posted as `COMMENT`; autopilot never picks a review event                  |
| `workflow-gate`       | it carries `suggestedReviewEvent` (the pr-review workflow's sign-off). Posted as `COMMENT`            |
| `pr-address-comments` | action `github.pr.comment` (replies), or a `git.push` onto a `zibby/*` head that has no open question |
| `pr-fix-ci`           | a `git.push` onto a `zibby/*` head of ZIBBY's own PR                                                  |
| `channel`             | action `channel-reply`. A parked reply always has a concrete draft; no draft means no approval        |

Everything else is not covered: merge, deploy, payments, spend past cap, deletes, force push
and rebase, `gh.api_write`, email, operator questions, PR opening sign-off, Jira creates,
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
