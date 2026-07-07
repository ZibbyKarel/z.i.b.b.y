# Phase 51 — CommandLine: caret-anchored mention panel (portal + flip) & controls inside the input

Covers TODO lines 81 and 83 (both are CommandLine layout; same file → one phase).

## Line 81 — the inline mention panel positions/clips wrong

Phase 45 made the `@`-mention an inline dropdown rendered as a DS `MenuSurface`
(`placement="anchored"`) sibling of the `HighlightTextAreaField`, i.e. anchored under the whole
FIELD via CSS. Three problems:
1. It shows under the INPUT, not under the CURSOR — wrong when CommandLine is expanded to many rows
   (the panel should appear at the caret line).
2. On the HUD **Overview**, the panel is covered/clipped by CommandLine's own wrapper div (the
   `chrome` Panel's stacking/overflow context traps it).
3. In **Chat UI**, CommandLine sits at the bottom of the page, so a panel rendered BELOW doesn't fit —
   it must flip and render ABOVE the caret when there isn't room below.

### Approach (line 81)
Rework the mention panel positioning in `apps/web/features/tasks/components/CommandLine/CommandLine.tsx`:
- **Portal to body** so it escapes the CommandLine wrapper's overflow/z clipping (fixes #2). The DS
  already portals floating panels — reuse the same primitive `Dropdown`/`SelectField` use (memory:
  "DS Dropdown/SelectField portal to body"); if `MenuSurface` supports a portaled/fixed placement use
  that, else use the DS portal primitive. Do NOT hand-roll a raw portal if a DS one exists.
- **Anchor to the CARET, not the field** (fixes #1): measure the caret's viewport coordinates within
  the textarea (a hidden mirror-div technique — clone the textarea's text up to `selectionStart` into
  an absolutely-positioned mirror with identical typography/padding and read the marker's rect; this
  is the standard caret-coord approach). If a robust mirror is too heavy, at minimum anchor to the
  caret's LINE (top offset from line index × line-height) so a multi-row CommandLine shows the panel at
  the active line, not the field bottom. Prefer the mirror for correctness.
- **Flip above when needed** (fixes #3): compute `spaceBelow`/`spaceAbove` from the caret rect vs
  viewport (mirror the flip logic in `libs/design-system/src/components/DropDownButton/DropDownButton.tsx`
  ~lines 145–159) and render above the caret when below-space is insufficient. Clamp maxHeight to the
  available space and let the list scroll.
- Keep everything else from phase 45 (checkMention regex, keyboard nav on the textarea, pick behavior,
  testids MentionMenu/MentionItem/MentionEmpty). The panel must still sit above the highlight backdrop.

## Line 83 — send & attach buttons should sit INSIDE the input

Currently the run `DropDownButton` and the attach ("+") control sit outside/below the textarea. The
operator wants them positioned INSIDE the input area (overlaid), with the text NOT running under them.

### Approach (line 83)
- Position the attach button (left) and the run/send `DropDownButton` (right) as controls absolutely
  placed INSIDE the input container (a `Container position="relative"` wrapping the field; the controls
  pinned bottom-left / bottom-right via DS position props — NOT raw inline `style`).
- Reserve space so the caret/text never slides under the controls: pad the textarea's left/right (and
  bottom if the controls sit on the baseline row) by the controls' width via the field's padding props
  (or a DS `style` passthrough if there's no padding prop). Verify with a long single-line value and a
  multi-row value that text wraps/clips before the buttons, never beneath them.
- Keep the drag-drop overlay, ack, disabled state (phase 47), and send-delegation props intact.

## Files
- `apps/web/features/tasks/components/CommandLine/CommandLine.tsx`
- `apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx` (panel: portaled, caret/flip
  behavior assertions where testable; controls-inside: text padding reserved, buttons present & clickable)
- `apps/web/features/tasks/components/NewTaskDialog.test.tsx` if the mention-pick selector path changes.

## Verification
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- Scoped lint: `npx eslint apps/web/features/tasks/components/CommandLine` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run apps/web/features/tasks/components/CommandLine apps/web/features/tasks/components/NewTaskDialog` green.
- Manual: expanded multi-row CommandLine → panel at the caret line; Overview → panel not clipped by the
  card; chat (bottom) → panel flips above; buttons inside the input, text never under them.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` beyond a DS `style` passthrough for the
  genuinely-dynamic caret/panel coordinates (route through a DS component's `style`, or a documented
  `// eslint-disable-next-line react/forbid-dom-props` on a raw positioning node, as the codebase does
  for dynamic positioning). Sealed sizing. Don't touch operator WIP (SummaryWidget, machine.*, design/*,
  `apps/web/features/chat/**`, `apps/web/features/runs/components/RunLogStream.tsx`).
