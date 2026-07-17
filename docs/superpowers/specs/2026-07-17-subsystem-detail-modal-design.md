# Subsystem Detail → modal, with open/close animation — Design Spec

> Source of truth for converting `SubsystemDrawer` from a docked, no-backdrop side panel
> into a true modal over the Velín canvas, with the entrance/exit animation specified by
> the operator (verbatim values below, translated from the Velín-D prototype's own
> animation notes for `VcSubsystemDetail`).

## 1. Scope

`SubsystemDrawer` (`apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`)
today is a phase-84 docked panel: right of the transcript on `lg+`, no backdrop, chat stays
interactive beside it. This phase reverses that decision — it becomes a centered modal with
a blurred backdrop, at every viewport size. The header + four tabs (Roster / Aktivita / Gates
/ Artefakty) are unchanged; only the chrome around them changes.

**Explicitly in scope:**
- Full-screen backdrop (blur + dim + fade), replacing the current docked-wrapper positioning
- Centered panel, re-sized from "docked, viewport-minus-rail wide" to a fixed modal width
- Entrance animation (fade + scale + translate, custom easing)
- Exit animation (mirrored reverse) — requires a new local "closing" state, since nothing
  in this codebase today defers unmount for an exit transition
- Backdrop-click-to-close
- Focus trap (Tab cycling) and body-scroll-lock — both currently absent since the drawer
  isn't a real modal today
- `prefers-reduced-motion`: fade-only, no scale/translate, both directions

**Explicitly out of scope:**
- Any change to Roster/Aktivita/Gates/Artefakty tab content
- The shared DS `Dialog` component — untouched. This is a bespoke backdrop+panel local to
  `SubsystemDrawer`, so no other dialog in the app (settings, confirm, New Task, `CoreOverviewDialog`)
  changes look or behavior.
- `ChatTaskDetailColumn` (the task-detail column, phase 100/122) — same docked-panel pattern,
  not touched by this phase.

## 2. Component placement decision

**Decision: modify `SubsystemDrawer` in place; no new component, no DS primitive.** The
backdrop + panel chrome is added directly to the existing file rather than extracted, because
there is exactly one consumer (`ChatScreen.tsx`) and the animation values are specific to this
one surface (confirmed: scoped, not a new shared `Dialog` variant). If a second consumer needs
this exact backdrop+panel+exit-animation treatment later, that's the trigger to extract a
shared primitive — not before.

The DS `Dialog` component is not modified and not composed into `SubsystemDrawer`: `Dialog`
has no exit-animation capability today (`if (!open) return null` unmounts instantly), and
adding one there would change behavior for every dialog in the app. `SubsystemDrawer` already
hand-rolls Escape-to-close and focus-restore (existing `useEffect`s) — this phase adds the two
pieces it's missing (Tab focus-trap, scroll-lock) locally, following the same instinct
`Dropdown` already sets: portal/positioning mechanics live inline at the one call site, not in
a shared abstraction, until a second caller exists.

## 3. Visual spec (verbatim values)

### Backdrop
- `position: fixed; inset: 0` — full viewport, sits below the panel in stacking order
- `background: rgba(11, 14, 19, 0.55)`
- `backdrop-filter: blur(14px) saturate(140%)`
- Enter: opacity `0 → 1`, 180ms ease-out
- Click on backdrop → close (mirrors `Dialog`'s existing `onClick` target-check pattern)

### Panel
Reuses the existing `Panel elevated` component as-is (already `--color-elevated` background /
`--color-border-strong` border / `--radius-lg` (10px) corners — matching the prototype's
"ZtPanel, surfaceHi, border ZT.lineHi, rPanel=10" verbatim) — no new surface styling needed,
just re-centered instead of docked right.

- Enter: `opacity: 0 → 1`, `transform: scale(0.96) translateY(8px) → scale(1) translateY(0)`
- Duration/easing: 220ms, `cubic-bezier(0.16, 1, 0.3, 1)` — the prototype's "overshoot-free
  ease-out… no spring/bounce, system is calm, not playful"
- `box-shadow` needs no new styling: `Panel`'s existing `elevated` prop (already used here)
  already applies its own elevation shadow (`--shadow-elevated`: `0 18px 50px rgba(0,0,0,0.45)`)
  — close enough to the prototype's one-off `0 24px 60px rgba(0,0,0,0.5)` that a second,
  near-duplicate shadow value isn't worth introducing. It's a static class on the same element
  that fades in via opacity, so it "fades in with the panel" automatically — no separate timing
  needed.
- The existing per-subsystem header gradient (`headerBandStyle`, already implemented) needs
  no new timing: it's inside the same panel element that fades/scales as one unit, so it never
  appears before the panel does.

### Sequence
Both backdrop and panel animations start in the same frame — no stagger, no wait between them
(180ms backdrop / 220ms panel run concurrently, panel is simply the longer of the two).

### Close
Exact reverse of the enter transition, 140ms, ease-in, on both backdrop and panel — a plain
reverse, no extra blur ramp beyond what the reverse opacity/scale/translate already produces.

### Reduced motion
Under `prefers-reduced-motion: reduce`, both enter and exit collapse to **opacity only** — no
`scale`/`translate` on the panel, backdrop blur/dim still fades but doesn't need to be skipped
(a static blur is not motion).

## 4. Close state machine

Today: `ChatScreen` mounts `SubsystemDrawer` conditionally (`{selectedSubsystem && <SubsystemDrawer .../>}`)
and `onClose` sets `selectedSubsystemId` to `null`, unmounting instantly. For a real exit
animation the component must stay mounted for the 140ms reverse transition before the parent
actually unmounts it — so `SubsystemDrawer` gains a local phase, and defers calling the
`onClose` prop:

```ts
type Phase = "entering" | "open" | "closing";
```

- Mounts in `"entering"`, flips to `"open"` on the next frame (so the enter transition
  actually plays instead of the browser coalescing the initial and target state into one
  paint) — same idiom as `--animate-scale-in`'s existing `scale-in` keyframe, just needing an
  explicit two-step state now that entry is driven by React state rather than a CSS
  `@keyframes` autoplay.
- Any close trigger (Escape, backdrop click, header close button) sets `"closing"` instead of
  calling `onClose` directly, applies the reverse transition classes, then calls the real
  `onClose` prop via `setTimeout` after the transition duration (140ms in both the normal and
  `prefers-reduced-motion` cases — reduced motion drops the scale/translate, not the fade
  itself, so the wait is unchanged; see §3).
- The existing focus-restore effect's cleanup still fires on the eventual real unmount, so
  focus-return behavior is unchanged — only the *timing* of the prop-level close moves later.

## 5. Sizing

The docked panel currently has no explicit width (fills viewport-minus-316px-rail on `lg+`).
As a centered modal that's numerically the wrong basis — a near-full-width panel that's
suddenly centered rather than docked looks wrong. New fixed width: **800px** (`xl`, matching
the DS `Dialog`'s own `xl` token value, for consistency even though `Dialog` itself isn't
reused), capped by the same `max-width: calc(100vw - 32px)` pattern `Dialog` already uses so
it never overflows a narrow viewport. One centered modal treatment at every viewport size —
no separate "full-width sheet" breakpoint; the width cap already handles small screens.

## 6. Testing implications

- Existing `SubsystemDrawer.test.tsx` assertions that check `onClose` fires synchronously
  (header close button, Escape) need `vi.useFakeTimers()` + advancing past 140ms before
  asserting the callback fired — same pattern as any debounced/deferred callback elsewhere in
  the suite.
- New coverage: backdrop click closes; focus-trap Tab cycling wraps at both ends; the
  `"entering" → "open"` two-step doesn't skip the transition; `prefers-reduced-motion` collapses
  timing to fade/no-wait (mock `matchMedia`, existing precedent for reduced-motion tests in the
  DS if any — otherwise a plain `window.matchMedia` mock returning `matches: true`).
- `backdrop-filter` isn't computed by jsdom — assert the CSS declaration is present in the
  applied class/style, not the rendered visual blur.

## 7. Open items carried into implementation (none blocking)

None — sizing, shadow, and Dialog-vs-bespoke were all resolved above per operator answers.
