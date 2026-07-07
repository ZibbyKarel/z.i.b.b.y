# Phase 22 — Bigger agent avatars on cards

> TODO: _"avatary agentů na kartách uděláme větší"_

## Goal

Make the agent avatar/glyph on the **agent cards** in the `/agents` grid visibly
larger, **without** enlarging the avatar on other HudCard-based cards (projects,
pipelines, MCP servers, hooks, automations, integrations).

## Current state (recon)

- `apps/web/features/agents/components/AgentCard.tsx` — thin wrapper, passes
  `glyph` + `logoSrc` into the shared `HudCard`.
- `apps/web/components/HudCard/HudCard.tsx:66` — renders
  `<IconTile ... size="md" />` (34px), **hardcoded**. HudCard is shared by many
  card types, so changing this line directly would enlarge every card's avatar.
- `libs/design-system/src/components/IconTile/IconTile.tsx` — `IconTileSize =
  "sm" | "md" | "lg" | "xl"` → `{ sm:30, md:34, lg:44, xl:56 }`. Inner glyph/logo
  auto-scales with the tile size.

## Approach

Thread an **optional** avatar-size prop through `HudCard`, defaulting to today's
value so no other caller changes; opt the agent card into a larger size.

### 1. `HudCard` — add optional size prop
- Add `avatarSize?: IconTileSize` to `HudCardProps` (import `IconTileSize` from DS).
- Default it to `"md"` (preserves current behavior for all existing callers).
- Pass it to the `IconTile`: `size={avatarSize}` at line 66.

### 2. `AgentCard` — opt into the larger size
- Pass `avatarSize="lg"` (44px) to `HudCard`. `"lg"` is the sensible bump — a clear
  size increase while staying inside the card's existing layout. (`"xl"`/56px risks
  crowding the card header; if `lg` looks too subtle in review, revisit.)

### 3. QuickLaunchPanel — leave as-is
- The quick-launch pins use their own `IconTile size="sm"`; out of scope (the TODO is
  about the agent **cards**). Do not touch.

## Files touched
- `apps/web/components/HudCard/HudCard.tsx` (add prop + default + pass-through)
- `apps/web/features/agents/components/AgentCard.tsx` (pass `avatarSize="lg"`)

## Verification
- `pnpm lint && pnpm typecheck && pnpm test` all green.
- Manually/visually: agent cards show a larger avatar; project/pipeline/etc. cards
  unchanged (regression check the shared HudCard default).
- If HudCard has tests/stories asserting the tile, keep them green (default is
  unchanged).

## Out of scope
- Any redesign of the card layout itself (that's the design-audit phases).
