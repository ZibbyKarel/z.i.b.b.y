# F8e — Restore the operator's on-demand briefing trigger

Part of the HUD → Chat UI migration. Small, and it closes a gap F8d deliberately named rather
than shipped quietly.

## The gap

The briefing's "generate now" control lived on `BriefingCard` on `/overview`. F8d deleted that
page, so `useGenerateBriefingMutation` (`features/briefing/mutations/`) now has **zero
callers** — verified by grep. The operator can no longer ask for a briefing on demand; they can
only wait for the morning automation.

That is a capability regression, and the briefing is the butler's primary report to the
operator — "ask what happened and get a straight answer" is a stated law of this system, so
this one matters more than its size suggests.

## What to build

A trigger in Chat that calls `useGenerateBriefingMutation`. F8a already made generation append
the briefing to the transcript as an assistant turn, so **the trigger needs no rendering of its
own** — fire the mutation and the briefing appears in the conversation. That is the whole
feature.

**Preferred home: the ⌘K command palette** (`features/chat/components/ChatPalette.tsx`). It
already composes `SearchMenuSection`s (`agentSection`, `pipelineSection`, `gatesSection`,
`memorySection`) and it is the established "run a thing by name" surface, which is exactly what
this is. Add a briefing action alongside them.

Consider — and state your choice — whether the dock (`ChatToolDock`) is a better home. The
argument against: the dock is navigation (each entry goes to a page), and this is an *action*
with no destination. The argument for: discoverability. If you pick the palette, make sure the
entry is findable by an obvious Czech search term as well as an English one.

## Requirements

- Reflect pending state — generation is not instant. Do not let the operator fire it five times
  because nothing appeared to happen.
- i18n both catalogs (`cs.json`, `en.json`), default locale **cs**.
- Do not re-render the briefing yourself and do not touch `BriefingMessageCard`; F8a owns that.
- Do not resurrect `BriefingCard` or anything from the deleted page.

## Out of scope
The chat "close" affordance and the topbar HUD-switch icon (both flagged in F8d, both operator
calls, both handled separately). F9's orphan sweep. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix`; `pnpm check:lint`.
- **Typechecks raw with exit codes** (D20 — the filtered form prints "No errors found" while
  exiting non-zero):
  `for p in apps/web apps/api libs/contracts libs/design-system; do rtk proxy npx tsc -p $p --noEmit; echo "$p -> $?"; done`
- `pnpm check:cycles`; full `web-components` vitest project.
- **Live browser at 1680px:** fire the trigger and watch a briefing turn actually appear in the
  transcript. That end-to-end path — trigger → API → JSONL → transcript → rendered card — is
  the only thing that proves this works. Report what you saw.
