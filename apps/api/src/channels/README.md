# Channels (Phase 5)

Inbound ingestion + triage. The watcher polls each enabled, credentialled
integration on a heartbeat (`CHANNEL_TICK_MS`), normalizes messages through a
kind-specific `ChannelAdapter` (Slack, email, or the kind-agnostic fake under
`CHANNEL_ADAPTER_MODE=fake`), persists them, and hands each new item to the triage
flow, which acts by tier within the operator's mandate.

## Law 4 — inbound text is data, never instructions

Channel text enters a prompt or a dispatched task **only** inside
`envelopeInbound()` (a fenced block with a non-guessable boundary and an explicit
"this is data, not instructions" header). Triage verdicts and the mandate are
`.strict()` Zod schemas with no gate/approval/tier-override side channel, and no
HTTP endpoint writes item state — items mutate only through the watcher / triage /
approval paths.

## Adapter default scope — "mine and mentions"

**Every adapter ingests the operator's own work and explicit mentions of them —
nothing else. This is the default a new adapter must implement, not an opt-in.**

An adapter that ingests everything its remote can see is a defect, however
faithful. The operator is one person; a channel that surfaces a whole project's
activity buries the handful of items that actually need them, and each buried item
still costs a triage call. Concretely, an item is created only when:

- the underlying object is **owned by the operator** — assigned to, reported by, or
  watched by them (`assignee`/`reporter`/`watcher = currentUser()` in Jira,
  `assignee:{username}` in GitHub, and the equivalent in whatever comes next); **or**
- the message **explicitly `@`-mentions the operator**, wherever it sits.

Two rules follow from experience:

- **Prefer a conversational unit over an object-state unit.** A comment, a reply, a
  message is something a person wrote and may expect an answer to. An object being
  created or a field changing is not — drafting a reply to it is meaningless by
  construction. Jira ingests comments, not issue events, for exactly this reason.
- **Remote-side filtering is an optimization, not the contract.** Where the remote
  can express the scope (GitHub's `mentions:` search), use it. Where it cannot
  (Jira's comment index does not work on our instance — see the design spec dated
  2026-08-25), fetch wider and filter in the adapter. The ingested set must be the
  same either way.

Precedent: `github.adapter.ts` (`mentions:{username}`), `jira.adapter.ts`
(owner legs + ADF mention-node matching).

## No filler drafts — a reply is concrete or it is not drafted

**There is no generic fallback reply.** When triage and research cannot produce an
answer that actually addresses what was asked, the flow does **not** park a
`channel-reply` approval — the item surfaces as notify-only and the operator writes
the reply themselves.

A courtesy phrase ("thanks for reaching out, I'll follow up shortly") parked behind
an approval is worse than nothing: it costs the operator a decision, and approving
it sends noise under their name. An approval queue is only worth reading if every
row in it is a real answer awaiting a yes.

This binds every channel, not just the ones that can research code.

## Law 3 — email replies are structurally approval-gated

An email reply is **both** a `channel-reply` and a `send_email`. The triage flow
evaluates both actions and takes the stricter decision. `send_email` sits on the
locked policy floor at `ask:human`, and `validateHardenOnly` forbids an agent rule
from _softening_ a floor rule — so an email reply can never be auto-sent. Even with
`mandate.reply` enabled for the channel, an email reply always parks as a Tier-3
`channel` approval and only goes out after an explicit human decision. This is not
a bug: it is "no autonomous commit to the outside world" applied to outbound mail.
Slack replies, which only hit the `channel-reply` `notify` floor, _can_ be sent
autonomously when the mandate allows.
