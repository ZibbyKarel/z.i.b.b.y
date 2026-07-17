# Task-list idle float — design spec

**Date:** 2026-07-17
**Branch:** feat/chat-ui-design-align

## Goal

Give idle task cards in the chat left tasklist (`ChatTaskRow`, rendered by
`ChatTasksPanel`) a faint, independent "floating on water" drift — not a
mechanical, unison pulse. Only idle cards (`status` not `running` or
`awaiting-approval`) float, so the effect never fights the existing
run-state "breathing" glow (`Card`'s `living` prop), which owns
opacity/shadow motion for genuinely in-flight tasks.

## Non-goals

- No opacity or shadow change — that's the run-state breathing effect's
  territory, untouched here.
- No scale change — would shift the card's hitbox and nudge neighboring
  rows in the list.
- No change to `Card` itself. `Card` stays a generic, unopinionated
  primitive; the float lives in a new, separately composable wrapper.
- No new global animation-toggle file. This codebase already has a
  reduced-motion mechanism (Tailwind's `motion-reduce:` variant, used by
  `LivingGlow`) — reuse it instead of introducing a parallel switch.

## New DS primitive — `FloatingPanel`

`libs/design-system/src/components/FloatingPanel/FloatingPanel.tsx`

A pure visual wrapper with no business logic, reusable beyond the task
list (any DS consumer that wants ambient idle motion around children).

```ts
export enum FloatingPanelTestId {
  Root = "floating-panel-root",
}

export interface FloatingPanelProps {
  children: ReactNode;
  /** Stagger seed — typically the item's list index. Panels sharing the
   *  same index float in lockstep; vary it to break the synchronized wave. */
  index?: number;
}
```

Renders a `w-full` div (no background/border/radius of its own — purely a
transform host so it never changes the wrapped content's appearance) with:

- `className`: `animate-zt-float motion-reduce:animate-none`
- inline `style`: `animationDuration` = `${6 + (index % 4) * 0.7}s`,
  `animationDelay` = `${index * -1.3}s` (negative delay starts each card
  mid-cycle, so cards never visibly start in sync)
- `data-testid={FloatingPanelTestId.Root}`

Ships with the usual DS trio: component, a Storybook story (idle grid of
panels at a few indices), and a test asserting children render, the
animate class is present, and `motion-reduce:animate-none` is present.

## Tokens — `libs/design-system/src/theme/globals.css`

Add alongside the existing `--animate-zt-*` entries:

```css
--animate-zt-float: ztFloat 7s ease-in-out infinite;
```

And a new keyframe (translateY only, amplitude capped at 3px):

```css
@keyframes ztFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
```

Naming follows the existing `zt-live` / `zt-spin` convention.

## Wiring — `ChatTaskRow.tsx`

- Add a required `index: number` prop to `ChatTaskRowProps`.
- `live` is already computed locally
  (`run.status === "running" || run.status === "awaiting-approval"`).
- When `!live`, wrap the existing `<Card>` return value in
  `<FloatingPanel index={index}>`; when `live`, return `Card` bare.

This keeps the live/idle branch as the single source of truth inside the
one component that already owns it, rather than duplicating the check in
`ChatTasksPanel`.

## Wiring — `ChatTasksPanel.tsx`

`renderRow` currently declares only `(r)`, dropping the index
`Array.prototype.map` already passes as the second argument. Add the
`index` parameter and forward it to `ChatTaskRow`.

Both `active.map(renderRow)` and `archived.map(renderRow)` restart their
own index from 0 — the index is only a stagger seed, not an identity, so
no cross-list bookkeeping is needed.

## Testing

- New `FloatingPanel.test.tsx` (DS-level, as above).
- `ChatTaskRow.test.tsx`: assert an idle row renders inside
  `FloatingPanelTestId.Root`, and a running/awaiting-approval row does
  not.
- No changes needed to `ChatTasksPanel.test.tsx` beyond whatever the
  `index` prop threading requires to keep it compiling (props change,
  not behavior it currently asserts).

## Verification

- `pnpm check:lint && pnpm check:types && pnpm test` per project
  convention.
- Live-browser check in `/chat`: idle cards drift independently (no
  visible synchronized wave), a running card's edge/glow breathing is
  unaffected, and toggling OS "reduce motion" freezes the float.
