# Phase 45 — CommandLine `@`-mention is a caret-anchored INLINE dropdown, not an external search box

> TODO (line 71): _"vyhledávání agentů a pipeline v CommandLine komponentě nefunguje
> inline. Zobrazí se externí vyhledávací políčko což je špatné UX. Pokud napíšu '@' měla
> by se automaticky pod kurzorem zobrazit plachta s výsledky vyhledávání tak jak je to v
> design."_

## The problem

CommandLine's `@`-mention currently uses the DS `SearchMenu`, which OWNS its own input +
keyboard nav — so typing `@` opens a separate search box and moves focus INTO it (an
"external search field"). The design wants a true INLINE autocomplete: you keep typing
`@query` in the textarea, and a results panel appears anchored under the caret/input,
filtered live; Arrow keys navigate, Enter picks, Esc closes — never a separate input.

## Design reference (velin-b `VbCommandBar`, already read)

`design/Z.I.B.B.Y/zibby/velin-b.jsx` implements exactly this:
- `checkMention(text, caret)`: `before.match(/@([\w.\-]*)$/)` → `mentionQ = {query, start}`
  (fires on `onChange`/`onKeyUp`/`onClick` as the caret moves).
- `mentionResults()`: filter agents+pipelines by the query, slice top ~6.
- The dropdown is rendered **inline**, anchored to the input (`position:absolute; left:…;
  top:100%` of the text area, i.e. directly under the input line), NOT a separate SearchMenu
  with its own field. Rows: glyph (agent=accent / pipeline=push) + name + `@slug`.
- Keyboard handled on the TEXTAREA's `onKeyDown`: ArrowDown/Up move the highlighted row,
  Enter picks `res[sel]`, Escape closes.
- `pickMention`: splices `@slug ` at `mentionQ.start`, closes, restores caret.

## Approach

Replace the `SearchMenu`-based mention picker in
`apps/web/features/tasks/components/CommandLine/CommandLine.tsx` with the inline
caret-anchored dropdown:
- Track `mention` state `{ query, start } | null` + a highlighted index, computed from the
  `HighlightTextAreaField`'s value + selectionStart on change/keyup/click (the field is a
  controlled textarea — get the caret via its ref's `selectionStart`).
- Render a small floating results panel anchored under the input (reuse DS `MenuSurface`
  for the floating/portaled panel + shadow, positioned from the input/caret — OR a plainly
  positioned DS `Container` under the field; keep it visually the velin-b "plachta"). Rows
  are the agent/pipeline results with the per-type glyph/tone. Do NOT give the panel its own
  text input — the textarea stays the input.
- Keyboard nav lives on the textarea's `onKeyDown` (Arrow/Enter/Esc) while `mention` is open;
  when closed, Enter submits as today (send/launch).
- On pick, splice `@name ` (or the slug the mention highlighter recognizes) at `mention.start`,
  set the `TaskTarget`, close, restore focus + caret. Keep the existing per-type `@token`
  coloring (Phase 31a) and the assigned-target chip.
- This is inside CommandLine, so it fixes the `@`-search everywhere it's used (NewTaskDialog,
  Overview, chat).

Note: the `HighlightTextAreaField` backdrop already highlights `@tokens`; ensure the inline
dropdown sits above it (z-index) and doesn't fight the backdrop.

## Files
- `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (replace SearchMenu mention
  with inline dropdown; keyboard on the textarea)
- `apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx` (update: typing `@`
  shows the inline panel; ArrowDown+Enter picks; no separate search input; Esc closes)
- possibly remove the now-unused `SearchMenu` import if nothing else in CommandLine uses it

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/tasks` — never bare),
  `pnpm test` green modulo known pre-existing failures (confirm via `git stash`). All
  CommandLine + NewTaskDialog + chat send tests must pass (the send-mode + task-launch paths
  are unaffected except the mention picker's mechanics).
- Manual: in the CommandLine (dialog / overview / chat), typing `@` shows an inline panel
  under the cursor with live-filtered agents/pipelines; Arrow+Enter inserts the mention
  (colored) + sets the target; no external search box; Esc closes.

## Constraints
- No forwardRef, no `any`, export props, no inline DOM `style` beyond a DS `style` passthrough
  for dynamic caret/panel positioning (route through a DS component's style prop or a
  documented eslint-disable on a raw node, as the codebase does for dynamic positioning).
  Don't touch operator WIP (SummaryWidget, machine.*, design/*).
