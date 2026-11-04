# TODO 43 — Interleave tool calls with agent text in the run phase log

## Raw item (operator's words)

> v dlouhém runnu fáze běhu například http://localhost:3000/dashboard?run=pr-address-comments_1793613537229 se volané nástroje (scripty) vyppisují úplně ve spod pod místem kam loguje claude. Problém je že pak nemám ale kontext o tom, kdy se co volalo. Místo jednoho místa na konci by se volané scripty a nástroje a ostatní měly vypisovat hned v průběhu a né až na konci. Jen to musíme vizuálně odlišit aby se logy s volanými scripty a nástroji nepletly.

## Meaning

In the run-detail phase feed (`RunLiveFeed` → `AgentBody`), all of an agent's text is
joined into one markdown block and every tool call is collected into one `LogStream`
panel below it. The tool calls must instead appear inline, in the order they happened
between the agent's text, and stay visually distinct from the text.

## Findings

- The ordering already exists: the flattened per-phase log
  (`apps/api/src/runner/claude-stream-format.ts`) is chronological, and
  `groupTranscript(parseTranscript(...))` yields text and toolCall groups in order.
  `agentBody` in `apps/web/features/runs/runDetailModel.ts` throws the order away.
- No API, contract or SSE change is needed.

## Decision

`agentBody` returns ordered `blocks`: `{ kind: "text", markdown }` and
`{ kind: "tools", lines: LogStreamLine[] }`, where consecutive tool calls are batched into
one block and ordinals keep counting across the whole round. `AgentBody` renders text
blocks as markdown and each tools block as the existing `Panel` + `LogStream`. The panel
(mono, framed, numbered rows) is the visual distinction. A raw tool phase is a single
tools block.
