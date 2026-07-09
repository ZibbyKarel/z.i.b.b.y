# Phase 99 — Chat subsystem detail drawer: wider, closeable, Add-rule clickable

> TODO ("Další nalezené věci"):
> - _"Chat UI - detail subsystému by měl být širší aby se tam všely všechny informace v pohodě"_
> - _"Chat UI - detail subsystému nejde zavřít"_
> - _"Chat UI - detail subsystému - Tlačítko přidat pravidlo nelze zmáčknout"_

## Recon (verified)

Component: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`
(the phase-84 frame; tab bodies `RosterTab`/`AktivitaTab`/`GatesTab`/`ArtefaktyTab` beside it).
Mounted by `apps/web/features/chat/components/ChatScreen.tsx` (l.462–467) when a subsystem orb
is selected; `onClose` → `setSelectedSubsystemId(null)` (l.464).

The close button (l.209–217, `onClick={onClose}`, testid `subsystem-drawer-close`) AND the
GatesTab "Add rule" button (`apps/web/features/gates/components/GateRulesSection.tsx` l.195–197,
`onClick={()=>setEditing("new")}`) are **both correctly wired** — the handlers work. The reported
"can't click" is a **z-index / stacking-context trap**, not a handler bug:

- The drawer lives inside ChatScreen's main area which is `relative z-10` (`ChatScreen.tsx:443`)
  — that `position:relative`+z creates a **stacking context**, so the drawer's internal `z-20`
  is confined below the root-level `z-10`.
- Two root-level siblings paint at `z-20` (above the trapped drawer):
  1. **`SubsystemOrbsOverlay`** (`apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx:140`,
     root `z-20`, with `pointer-events-auto` 44px orb hit-targets at l.180) — its orbs sit in the
     top-third and overlap the drawer's **top-right close button**, stealing its clicks.
  2. **Composer bar** (`ChatScreen.tsx:532`, `relative z-20`) — the drawer `Panel` has inline
     `maxHeight: calc(100vh - 96px)` + `overflowY:auto` (l.194), taller than the main area, so
     the panel bottom (where **Add rule** lands when scrolled) extends into the composer band and
     is covered.

Width is hard-coded at l.178: `... w-full ... lg:w-[380px]` (inner wrapper + `Panel` are `w-full`
and follow the root).

## Goal

The subsystem drawer sits **above** the orb overlay and composer so every control in it is
clickable, closes via its X and Escape, and is wide enough to hold its content comfortably.

## Approach

1. **Fix the stacking trap (root cause for close + Add-rule).** Lift the drawer out of the
   `z-10` main-area stacking context so it is a root-level sibling of the overlay/composer, and
   give it a higher z-index than both (e.g. render the `<SubsystemDrawer>` at the ChatScreen root
   level, sibling to `CosmicScene` and the composer, with `z-30` — above the overlay/composer
   `z-20`). Keep its `pointer-events-none` positioning wrapper with a `pointer-events-auto` inner
   Panel so the scene stays interactive where the drawer isn't. Verify the drawer still mounts
   only when a subsystem is selected and `onClose` still clears selection.
   - Simplest concrete move: relocate the `{selectedSubsystem && <SubsystemDrawer .../>}` block
     from inside the `z-10` main area to the ChatScreen root (next to `CosmicScene`/composer) and
     bump the drawer root class from `z-20` to `z-30`. Confirm no layout regression (it is
     `absolute inset-y-0 right-0`, self-positioning).
2. **Clear the composer overlap.** Reduce the drawer `Panel` `maxHeight` so its bottom clears the
   composer band (e.g. reserve the composer height — `calc(100vh - <composer+inset>)`), and/or now
   that the drawer is `z-30` above the composer, ensure the bottom Add-rule button is both visible
   and clickable. Prefer expressing height through the DS `Panel`/`Container` props rather than a
   new inline style; if an inline `style` is unavoidable it must go through a DS component's
   `style` passthrough (Panel already spreads `...rest`), never a raw DOM element in apps/web.
3. **Widen the drawer.** Change `lg:w-[380px]` → a comfortably wider value (`lg:w-[520px]`,
   keep `w-full` below lg). Check the tab content (RosterTab table, GatesTab rules) reflows fine
   at the new width.

## Files

- `apps/web/features/chat/components/ChatScreen.tsx` (move drawer to root level / z-index)
- `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx` (root z-index,
  width, Panel maxHeight)
- Tests: `SubsystemDrawer.test.tsx` — keep close-button + Escape assertions (they already exist);
  add/keep the width testid assertion if one is asserted. If ChatScreen has a test asserting the
  drawer mount location, update it.

## Verification

- `pnpm check:types` clean.
- Scoped lint on touched files.
- `pnpm exec vitest run apps/web/features/subsystems apps/web/features/chat apps/web/features/gates`
  green.
- Manual reasoning / (if feasible) a Playwright check: open chat, click a subsystem orb → drawer
  opens wider; the top-right X closes it; scroll GatesTab to the bottom and the "Add rule" button
  is clickable (opens RuleModal). Escape also closes.

## Constraints

- No inline `style` on raw DOM in apps/web (use DS passthrough). No `any`, no forwardRef.
- Do not regress the scene interactivity: the orb overlay must still receive clicks where the
  drawer is not covering. Keep the drawer's `pointer-events-none` wrapper + `pointer-events-auto`
  inner. Keep the diff tight.
