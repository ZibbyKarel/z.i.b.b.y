# Phase 35 — Inbox shows the autonomy tier + what ZIBBY did

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** (accountability) on the autonomous-mode
> surface.

## Audit result

`/integrations` is real: integrations CRUD (`useCreate/Update/DeleteIntegrationMutation`),
write-only credentials (`useSetCredentialsMutation`), a connection test
(`useTestIntegrationMutation`), and an `InboxPanel` reading the live `useChannelItemsQuery`.
Connect/credential flows hit real endpoints — not a mock.

The gap is in the **InboxPanel** accountability. `ChannelItem.triage` (channel.schema.ts)
carries the autonomy-contract **`tier`** (1 act-silently / 2 act-then-report / 3
surface-and-wait — "the tier, not the channel, decides how ZIBBY acts") plus `confidence`
and `reason`; the item carries **what ZIBBY did**: `taskId` (Tier-1 task dispatched),
`reply` (Tier-2 reply sent), `approvalId` (Tier-3 reply parked), `outcome`. But the inbox
row shows only `state` + `category` + a Tier-3 `needsApproval` marker. So the operator
cannot see at what autonomy tier an item was handled, or what was done — the core of
"always accountable".

(Inbound `text` is already a sanitized, truncated preview — Law 4 "data, not commands" is
respected; no change there.)

## Fix

`apps/web/features/integrations/components/InboxPanel.tsx` `InboxRow`:
- Add a **tier chip** when `item.triage`: `<Tag tone={TIER_TONE[item.triage.tier]}>Tier
  {tier}</Tag>` with `TIER_TONE = { 1: "ok", 2: "accent", 3: "warn" }` (escalating).
- Add **handling markers** on the right: `item.taskId` → "dispatched" (accent);
  `item.reply` → "replied" (ok); keep the existing `approvalId && state === "triaged"` →
  "needs approval" (warn).
- i18n `inbox.tier` (`"Tier {n}"`), `inbox.dispatched`, `inbox.replied` (cs+en).

## Tests
`InboxPanel.test.tsx`:
- a Tier-3 triaged item renders "Tier 3";
- a Tier-1 item with a `taskId` renders the "dispatched" marker;
- an item with a `reply` renders the "replied" marker.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).
