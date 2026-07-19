# F3 — Catalogs A: skills, commands, mcp, hooks

Part of the HUD → Chat UI migration. Read `docs/hud2chat/ROADMAP.md` and
`docs/hud2chat/DECISIONS.md` first (**D5, D7, D10, D12** apply directly).

These four sections are the most uniform in the app: a list `Screen.tsx` + a
`DetailScreen.tsx`, both built from `PageContainer` + `PageHeader` + `HudPanel`. They are
deliberately batched so the migration recipe gets exercised eight times and hardens before
it meets the hard pages (F5/F6).

## The recipe (this is the reusable part — follow it for every page)

For each page:

1. **Shell swap.** Delete the `<PageContainer>` wrapper and the `<PageHeader … />` element.
   Wrap the page in `ImmersivePage` (`apps/web/components/layout/ImmersivePage/`), threading
   the old header's `title` and `subtitle` into its props.
2. **Actions.** Unlike settings, these pages *do* pass `actions` to `PageHeader` (e.g. the
   "add" button). Those move into `ImmersivePage`'s `actions` slot — the header cluster.
   Verify each page's real actions; do not assume.
3. **Padding (D12).** `MainLayout`'s `<main>` used to supply `padding={["300","350"]}`;
   `ImmersiveShell`'s body has none. Add an equivalent padding wrapper inside the shell body.
4. **Width.** `PageContainer` was the only max-width bound (1400px, centred). Keep it
   *inside* the shell body — see `features/settings/Screen.tsx` (commit `d7d2b106`) for the
   exact nesting that works.
5. **Glass (D7).** Pass `surface="glass"` to the page's `HudPanel`s. `HudPanel` is at
   `apps/web/components/HudPanel/HudPanel.tsx` — it is an **app composite, not a DS
   component** (D10; the DS SKILL.md line claiming otherwise is stale).
6. **Route table.** Add the section's routes to `FULLSCREEN_ROUTES` in
   `apps/web/state/config.ts`. `isFullscreenRoute` already prefix-matches, so registering
   `/skills` also covers `/skills/[id]` — confirm that is what you want per section.
7. **Back affordance.** A detail page's back button should return to its **list**, not to
   `/chat` — pass `backHref`. The list page's back button returns to `/chat` (the default).
   This is the one place the four sections differ from settings; get it right.
8. **Redundant back buttons.** *(added after F3)* Detail pages often carry a manual ghost
   "Zpět" button inside `PageHeader`'s actions — a stand-in for the shell back affordance
   that did not exist before F0. `ImmersivePage`'s `backSlot` subsumes it: **remove it**,
   keeping `router` only if something else (e.g. a delete-success redirect) still needs it.
   Do not ship two back affordances, and do not drop it silently — say so in the report.
9. **Tests.** Update the section's existing tests for the new structure and extend
   `AppShell.test.tsx`. *(corrected after F3)* Do **not** assume the route is already in the
   "still HUD chrome" `it.each` list — most are not, so there is nothing to "move". Check
   membership first; add a fullscreen-bypass case either way.

## Scope — eight pages

| Route | File | LOC |
| --- | --- | --- |
| `/skills` | `features/skills/Screen.tsx` | 208 |
| `/skills/[id]` | `features/skills/DetailScreen.tsx` | 159 |
| `/commands` | `features/commands/Screen.tsx` | 107 |
| `/commands/[id]` | `features/commands/DetailScreen.tsx` | 155 |
| `/mcp` | `features/mcp/Screen.tsx` | 91 |
| `/mcp/[id]` | `features/mcp/DetailScreen.tsx` | 129 |
| `/hooks` | `features/hooks/Screen.tsx` | 84 |
| `/hooks/[id]` | `features/hooks/DetailScreen.tsx` | 114 |

## Chat reachability
`/skills`, `/commands`, `/mcp` are already in `ChatToolDock`'s `DOCK_IDS`. **`/hooks` is
not** — the audit calls hooks one of the two fully orphaned sections (no dock icon, no
drawer mention). Add `hooks` to `DOCK_IDS`; it is already in `NAV_ITEMS` with a
`checkpoint` glyph, so this is a one-line change. Detail pages stay reachable by clicking a
card in their list, as today.

## Out of scope
Restructuring any page's content, changing any card/tile component, touching
`GateRulesSection`, deleting `MainLayout`. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY.
- Scoped vitest (`web-components`, `@zibby/design-system`).
- Report per page whether its actions cluster, its max-width bound and its back target are
  right — those are the three things this recipe most easily gets wrong.
