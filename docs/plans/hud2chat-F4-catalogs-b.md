# F4 — Catalogs B: agents, automations

Part of the HUD → Chat UI migration.

**The recipe lives in `docs/plans/hud2chat-F3-catalogs-a.md` — read its 9 numbered steps and
follow them.** It was amended after F3 with two steps (redundant back buttons, test-case
membership) that were learned the hard way. Do not re-derive it.

Read also: `docs/hud2chat/DECISIONS.md` (D5, D7, D10, D12), and the two reference migrations
`apps/web/features/settings/Screen.tsx` (`d7d2b106`) and `apps/web/features/skills/`
(`f01c2395`).

## Scope — four pages

| Route | File | LOC | Notes |
| --- | --- | --- | --- |
| `/agents` | `features/agents/Screen.tsx` | 211 | list + `CategoryDialog` + `NewAgentDialog` |
| `/agents/[id]` | `features/agents/DetailScreen.tsx` | 245 | uses `EntityHero`, `RuleModal`, `AgentRulesSection`, `PinButton` |
| `/automations` | `features/automations/Screen.tsx` | 196 | `Collection` + `AutomationFormDialog` |
| `/automations/[id]` | `features/automations/DetailScreen.tsx` | 214 | `CommandLine` + `TriggerFields` |

## What is different from F3 — read before starting

1. **`/agents/[id]` renders `EntityHero`** (a 190px avatar band with a gradient scrim). The
   immersive header now sits directly above it, so there will be two stacked "header" bands.
   Look at it and make a judgement: if it reads as duplication, say so in your report with
   what you would do — **do not restructure `EntityHero` in this phase**. It is shared with
   `features/pipelines/Screen.tsx`, `features/runs/components/RunDetail.tsx` and
   `features/chat/components/ChatDetailDialog.tsx`, so changing it reaches four surfaces.
2. **`/automations` is the second fully orphaned section** in the audit — no dock icon, no
   drawer mention, nothing in Chat UI at all. `automations` is already in `NAV_ITEMS` with a
   `clock` glyph, so add it to `ChatToolDock`'s `DOCK_IDS` (same one-line fix `hooks` got in
   F3). After this phase both audit orphans are reachable from Chat.
3. **`/agents` is already reachable** from Chat two ways (dock icon, and the subsystem
   drawer's Roster crew rows link to `/agents/[id]`). Confirm the Roster links still land
   correctly once `/agents/[id]` is fullscreen — that is a cross-surface regression risk
   nothing else in this phase has.
4. **Dialogs.** All four pages own dialogs (`CategoryDialog`, `NewAgentDialog`, `RuleModal`,
   `AutomationFormDialog`). They are overlays and should be chrome-agnostic, but verify they
   still open and trap focus correctly inside the fullscreen shell — the old `MainLayout`
   provided a different stacking context.

## Out of scope
Restructuring page content. Changing `EntityHero`. Touching `GateRulesSection` or
`AgentRulesSection` internals. Deleting `MainLayout`. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY.
  Both are known-clean on this branch; if either reports errors, they are yours.
- Scoped vitest (`web-components`, `@zibby/design-system`).
- Report the same per-page table F3 used: route · actions moved? · max-width kept? · back
  target · redundant back button removed?
