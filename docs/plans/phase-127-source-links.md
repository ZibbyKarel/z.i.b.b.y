# Phase 127 — source links on inbound-message cards

> TODO.md item 8: _"topbar - U kartiček zpráv, která jsou k návrhu schválení / zamítnutí
> musíme dát vždy odkaz na zdroj té zprávy - tedy do JIRY/Githubu/Slacku/... Taky abychom
> zprávu vždy mohli otevřít v kontextu."_
>
> TODO.md item 9: _"Detail projektu - záložka Integrace - seznam zpráv - musíme dát vždy
> odkaz na zdroj zprávy - tedy do JIRY/Githubu/Slacku/... Taky abychom zprávu vždy mohli
> otevřít v kontextu."_

Both items are the same underlying gap surfaced on two screens: a `ChannelItem` sourced from
Jira/GitHub/Slack has no link back to where it actually lives, so the operator can't jump
into context. Email already has this (`NeedsAttentionPanel`'s `gmailLink`); this phase brings
Jira/GitHub/Slack to parity on the two surfaces the TODO items name.

## Scope

- **127-topbar**: the pending-approval card in the topbar status flyout
  (`FlyoutApprovalRow.tsx`) — the Tier-3 "draft reply" gate for an inbound channel item.
- **127-inbox**: the project detail → Integrace tab → message list
  (`InboxPanel.tsx`'s `InboxRow`) — this project's recent channel items.

**Out of scope**: `NeedsAttentionPanel` (overview "needs attention" cards) — already has its
own Gmail link, not named by either TODO item.

> **Follow-up (post-ship):** the original design here explicitly excluded backfilling
> historical records ("an old record simply renders without the link"). The operator caught
> this the same day — dozens of already-parked Tier-3 approvals stayed link-less, which
> doesn't satisfy the TODO's literal "vždy" (always). See **Backfill** below for the fix:
> `SourceLinkBackfillService`, a one-shot startup sweep that closes the gap for Jira/GitHub
> (Slack still can't be backfilled — see that section for why).

## Data model (`libs/contracts`)

- `ChannelItemSchema` (`channels/channel.schema.ts`) gains `url: z.string().optional()` — the
  human-facing link to view the message at its origin. Stamped only by adapters that can
  cheaply produce one (Jira, GitHub, Slack); other kinds simply omit it.
- `ApprovalSchema` (`approvals/approval.schema.ts`) gains `sourceUrl: z.string().optional()`,
  documented and copied the same way `ownerSubsystem` already is — an optional field stamped
  only by the one call site that has a source to attribute, never invented elsewhere.

## Populating `ChannelItem.url` at ingest (`apps/api/src/channels/adapters`)

- **`jira.adapter.ts`** (`poll()`, building each `InboundMessage`): `url:
  `${baseUrl}/browse/${issue.key}`` — `baseUrl` and `issue.key` are already in hand, no extra
  request.
- **`github.adapter.ts`** (`poll()`, building each `InboundMessage`): `url:
  `https://github.com/${repo}/${isPr ? "pull" : "issues"}/${issue.number}`` — `isPr` is
  already computed in the loop, no extra request.
- **`slack.adapter.ts`** (`poll()`, per message): no field already in hand can build a
  permalink, so call `chat.getPermalink?channel=<channel>&message_ts=<ts>` once per *new*
  message (polling only ever fetches deltas, so this stays cheap) and use `body.permalink`
  when `body.ok`. Best-effort: on a non-ok response or thrown error, leave `url` unset — never
  fail the poll over a permalink lookup, matching this adapter's existing fail-open style for
  rate limits.

## Wiring `Approval.sourceUrl` (topbar card)

`channel-triage-flow.service.ts`'s `parkForApproval` already holds the `ChannelItem` when it
calls `approvals.requestApproval(...)` for the Tier-3 draft-reply gate (the "channel" approval
kind) — add `sourceUrl: item.url` to that call (only when present, same optional-spread style
as `ownerSubsystem` elsewhere in this file).

`ApprovalsService.requestApproval` (`RequestApprovalInput` + the `Approval` it builds) copies
`sourceUrl` through exactly like it copies `ownerSubsystem` today — same conditional spread,
same doc-comment style explaining only run-path callers with a source supply it.

## UI

### `FlyoutApprovalRow.tsx` (topbar)

When `approval.sourceUrl` is set, render a link — `<a href={approval.sourceUrl} target="_blank"
rel="noreferrer">` wrapping DS `Typography` with the `link` icon, reusing the row's existing
`Stack`/`Typography` idiom (see the header `Stack` at the top of the card). Placed in the
top header row, next to the skill/tag line, so it reads before the approve/reject actions.
New i18n key `approval.openSource` (`cs`: "Otevřít zdroj ↗", `en`: matching translation),
alongside the existing `approval.*` keys.

### `InboxPanel.tsx`'s `InboxRow` (Integrace tab)

When `item.url` is set, render the same link treatment, following the precedent already set by
`NeedsAttentionCard`'s `link &&` block in `NeedsAttentionPanel.tsx` (an `<a>` wrapping DS
`Typography`, opens in a new tab). New i18n key `inbox.openSource` (`cs`: "Otevřít zdroj ↗",
mirroring `inbox.attention.openEmail`'s existing style), alongside the existing `inbox.*` keys.

## Backfill (`SourceLinkBackfillService`, follow-up)

A one-shot, idempotent `OnModuleInit` sweep in `channels.module.ts`, mirroring
`OwnerBackfillService`'s pattern (per-entity try/catch, atomic writes via each store's own
`update`, never fatal to boot):

- **Items**: every `ChannelItem` missing `url` is checked; for `kind: "jira"` /
  `kind: "github"` the URL is cheaply re-derivable from data already on disk — the issue key
  (`externalRef.messageId`) plus the owning integration's non-secret `config` (`baseUrl` /
  `repo`) — so no extra network call is needed. GitHub backfills use a uniform
  `/issues/<n>` path (GitHub redirects to `/pull/<n>` when it's actually a PR), sidestepping
  the `isPr` distinction the adapter has at ingest time but the stored item doesn't.
- **Approvals**: every still-`pending`, `kind: "channel"` approval missing `sourceUrl` is
  resolved back to its `ChannelItem` via the existing `<integrationId>/<itemId>` `runId`
  convention (same split `channel-triage-flow.service.ts`'s `itemFromRef` uses) and, if that
  item now has a `url` (freshly backfilled or otherwise), copies it across via a new
  `ApprovalsService.patchSourceUrl(id, url)` — a narrow, lock-guarded patch that touches only
  `sourceUrl`, never `status`/`decidedAt`, and is a no-op against a concurrent decide.
- **Slack is NOT backfilled.** A permalink can only be *fetched live* via `chat.getPermalink`
  at ingest time — there's nothing on a stored `ChannelItem` to reconstruct it from after the
  fact. Backfilling Slack would mean replaying that live call for every historical message,
  reintroducing exactly the per-item API cost the ingest-time design kept off this path. Old
  Slack items get a link only once naturally re-ingested.

Runs on every boot; already-linked items/approvals are skipped, so it converges to a no-op
once the fleet is caught up — same idempotence guarantee as `OwnerBackfillService`.

## Tests

- `libs/contracts`: extend the `ChannelItemSchema`/`ApprovalSchema` parse tests (or their
  nearest existing schema test) to confirm `url`/`sourceUrl` are optional and round-trip.
- `jira.adapter.test.ts` / `github.adapter.test.ts`: assert the new `url` on a polled item.
- `slack.adapter.test.ts`: assert `url` is set from a mocked `chat.getPermalink` success, and
  omitted (not thrown) when that call fails or returns `ok: false`.
- `channel-triage-flow.service.test.ts`: assert `parkForApproval` forwards `sourceUrl` when
  the item has a `url`, and omits it when the item doesn't.
- `apps/web` (`--project web-components`): `FlyoutApprovalRow.test.tsx` — link renders only
  when `sourceUrl` is present; `InboxPanel.test.tsx` — link renders only when `url` is present.

## Definition of done

1. `pnpm exec vitest run libs/contracts` green.
2. `pnpm exec vitest run apps/api/src/channels --project api` (or the project's equivalent
   scoped invocation) green.
3. `pnpm exec vitest run apps/web/features/chat apps/web/features/integrations --project
   web-components` green.
4. `pnpm exec vitest run --project web` green (i18n key parity).
5. Prettier + ESLint clean on every touched file; `tsc -p apps/api/tsconfig.json --noEmit` and
   `tsc -p apps/web/tsconfig.json --noEmit` clean.
6. One commit per logical step (schema, adapters, approval plumbing, topbar UI, inbox UI) on
   `feat/phase-127-source-links`.
