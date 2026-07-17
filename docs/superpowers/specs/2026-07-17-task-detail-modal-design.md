# Task Detail → modal, with open/close animation — Design Spec

> Source of truth for converting `ChatTaskDetailColumn` from a docked, no-backdrop
> column into a true modal over the Velín canvas — the exact same treatment
> `SubsystemDrawer` got in phase 125 (`docs/superpowers/specs/2026-07-17-subsystem-detail-modal-design.md`),
> applied to the chat's other docked detail surface, per operator direction.

## 1. Scope

`ChatTaskDetailColumn` (`apps/web/features/chat/components/ChatTaskDetailColumn.tsx`)
today is a phase-100/122 docked column: pinned to the right of the 300px left tasks
gutter (`ChatTasksPanel`), no backdrop, the gutter and chat stay interactive beside it.
This phase reverses that decision — it becomes a centered modal with a blurred backdrop,
at every viewport size, mirroring `SubsystemDrawer` exactly. `RunDetail` (the body) is
unchanged; only the chrome around it changes.

**Explicitly in scope:**
- Full-screen backdrop (blur + dim + fade) — same values as `SubsystemDrawer`'s
  (`backdropStyle`), replacing the current docked-wrapper positioning
- Centered panel, re-sized from "docked, viewport-minus-rail wide" to the same fixed
  modal width `SubsystemDrawer` uses
- Entrance animation (fade + scale + translate, same custom easing/durations)
- Exit animation (mirrored reverse) — same `"entering" | "open" | "closing"` phase
  machine and deferred-`onClose` pattern as `SubsystemDrawer`
- Backdrop-click-to-close
- Focus trap (Tab cycling) and body-scroll-lock, via the shared `useOverlayStack` hook
  (already exists — `libs/design-system/src/hooks/useOverlayStack.ts`, built and proven
  in the phase-125 fix) — no new hook needed this time
- `prefers-reduced-motion`: fade-only, no scale/translate, both directions

**Explicitly out of scope:**
- `RunDetail` internals (shared with `/runs` — untouched)
- The two-column FLIP layout (`VcTaskDetail` in `design/Z.I.B.B.Y/zibby/velin-c-tasks.jsx`)
  — already descoped by the phase-122 D2 decision (kept single-column, `RunDetail` reused);
  not revisited here
- FLIP-from-card-origin entrance animation (`VcTaskDetail`'s own grow-from-click-position
  choreography) — operator explicitly chose the simpler `SubsystemDrawer`-identical
  scale/fade treatment instead, for one consistent detail-modal language across the app
- `SubsystemDrawer` — untouched, already shipped
- The shared DS `Dialog` component — untouched (unchanged from phase 125's decision)

## 2. Component placement decision

**Decision: modify `ChatTaskDetailColumn` in place; no new component, no DS primitive.**
Same reasoning as phase 125: exactly one consumer (`ChatScreen.tsx`), animation values
are shared with `SubsystemDrawer` only by *value*, not by a shared component — each
detail surface keeps its own local phase state and its own copy of the
`backdropStyle`/`panelTransitionStyle`-shaped helpers (the two components already
don't share code today; this phase doesn't introduce sharing either. If a third such
surface appears, that's the trigger to extract a shared modal-chrome primitive — not
before).

`RunDetail` stays exactly as-is: same props, same internals. Only the wrapper around it
(currently `ChatTaskDetailColumn`'s docked-column JSX) changes shape.

## 3. Visual spec (verbatim values — identical to `SubsystemDrawer`, phase 125)

### Backdrop
- `position: fixed; inset: 0` — full viewport, sits below the panel in stacking order
- `background: rgba(11, 14, 19, 0.55)`
- `backdrop-filter: blur(14px) saturate(140%)`
- Enter: opacity `0 → 1`, 180ms ease-out
- Click on backdrop → close

### Panel
Reuses the existing `Panel elevated` component as-is — no new surface styling needed,
just re-centered instead of docked right.

- Enter: `opacity: 0 → 1`, `transform: scale(0.96) translateY(8px) → scale(1) translateY(0)`
- Duration/easing: 220ms, `cubic-bezier(0.16, 1, 0.3, 1)`
- No new shadow styling: `Panel`'s existing `elevated` prop already applies
  `--shadow-elevated`.

### Sequence
Both backdrop and panel animations start in the same frame — no stagger (180ms backdrop
/ 220ms panel run concurrently).

### Close
Exact reverse of the enter transition, 140ms, ease-in, on both backdrop and panel.

### Reduced motion
Under `prefers-reduced-motion: reduce`, both enter and exit collapse to **opacity only**
— no `scale`/`translate` on the panel.

## 4. Close state machine

Today: `ChatScreen` mounts `ChatTaskDetailColumn` conditionally
(`{selectedRun && <ChatTaskDetailColumn .../>}`) and `onClose` sets `selectedRunId` to
`null`, unmounting instantly. Same fix as phase 125: the component gains a local phase
and defers calling the `onClose` prop:

```ts
type Phase = "entering" | "open" | "closing";
```

- Mounts in `"entering"`, flips to `"open"` on the next frame via an effect
  (`react-hooks/set-state-in-effect` disabled with the same justification
  `SubsystemDrawer` uses — the jsdom/`act()` timing argument applies identically here).
- Any close trigger (Escape, backdrop click, the existing floating close button) sets
  `"closing"` instead of calling `onClose` directly, then calls the real `onClose` prop
  via `setTimeout` after 140ms (both normal and `prefers-reduced-motion`).
- The existing focus-restore effect's cleanup still fires on the eventual real unmount.

## 5. Sizing

New fixed width: **800px**, same as `SubsystemDrawer`'s `MODAL_WIDTH` — one consistent
detail-modal width across the app — capped by `max-width: calc(100vw - 32px)`. `RunDetail`
has no internal width assumptions (confirmed: no hardcoded widths, no internal
grid/multi-column layout), so narrowing its container from "viewport-minus-316px-rail"
to 800px is a pure reflow, not a layout break.

The existing footer "otevřít celý běh →" link (phase 122) stays, unchanged, below
`RunDetail` inside the scrolling body — it's not part of this phase's scope.

## 6. Layering / gutter interaction

Today `ChatTasksPanel` (the left gutter) and `ChatTaskDetailColumn` sit side by side,
both interactive at once. After this phase, opening a task's detail covers the gutter
too — same as `SubsystemDrawer` already covers `ChatTasksPanel` when a subsystem is
selected (confirmed: `SubsystemDrawer` mounts as a `position: fixed` `z-40` sibling
outside the gutter's `z-10` wrapper). This is not a new interaction pattern; the task
detail modal simply joins it. `ChatScreen`'s existing `overlayOpen` (already
`true` when `selectedRun != null`) needs no change — the bottom bar and live log already
dim correctly.

## 7. Testing implications

- Existing `ChatTaskDetailColumn.test.tsx` assertions that check `onClose` fires
  synchronously (close button) need `vi.useFakeTimers()` + advancing past 140ms before
  asserting the callback fired.
- New coverage: backdrop click closes; focus-trap Tab cycling wraps at both ends;
  `prefers-reduced-motion` collapses timing to fade/no-wait; the shared
  `useOverlayStack` correctly cedes Escape/scroll-lock precedence to a nested `Dialog`
  (same regression shape as `SubsystemDrawer.test.tsx`'s phase-125 test, adapted).
- `backdrop-filter` isn't computed by jsdom — assert the CSS declaration is present in
  the applied style, not the rendered visual blur.

## 8. Open items carried into implementation (none blocking)

None — every value, sizing, and layering question is resolved above, either by direct
reuse of the phase-125 precedent or by the operator's explicit answer (same animation
treatment as `SubsystemDrawer`, not the design file's FLIP-from-card choreography).
