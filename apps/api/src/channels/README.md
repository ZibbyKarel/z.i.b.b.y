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
