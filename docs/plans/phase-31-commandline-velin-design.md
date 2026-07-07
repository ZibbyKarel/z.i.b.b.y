# Phase 31 — CommandLine restyled to velin-b design, used in 3 places

> TODO (line 33): _"upravme CommandLine komponentu aby seděla s designem viz
> velin-b.jsx v design složce. Tuto komponentu pak použijeme v NewTaskDialog, na
> Overview (viz design) a v rámci chat UI."_

## Design reference

`design/Z.I.B.B.Y/zibby/velin-b.jsx` → `VbCommandBar` (lines ~92-380). The target:
- A **panel** (surfaceHi bg, `lineHi` border) with a **header row**: `spark` icon (accent)
  + label "Zadej směr · přirozeným jazykem" + right-aligned micro hint ("@ hledá agenty a
  pipeliny · přetáhni soubor, nebo použij sponku").
- An **inner input box** (bg, control radius) that on drag-over shows an accent dashed
  overlay ("Pustit sem — přidá se jako @soubor do textu").
- **Backdrop-highlighted `@tokens` colored by type**: agent = `accent`, pipeline =
  `riskPush` (purple), file/unknown = `ink2` — each token a `<mark>` with a faint bg +
  1px ring. Auto-sizing textarea (min ~48px → max ~200px, i.e. ~1→N rows).
- **Inline `@` autocomplete** dropdown anchored under the caret (agents+pipelines, glyph +
  label + `@slug`), keyboard nav.
- **Bottom bar**: a `+` (plus) button and a `pin` button (both open the file picker) on the
  left; a **split run-button** on the right — primary "Spustit" (accent) + a caret opening
  an "Options" menu (Spustit hned / za hodinu / po resetování limitů).
- Below the box: **suggestion chips** (when empty) OR a **classification ack row** after
  submit (spinner + "Klasifikováno jako <kind> → spouštím <exec>" + the quoted text + ✕).

## Current state

`apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (Phase 26) already has:
the growable `HighlightTextAreaField` with path highlights, the ported `@`-mention
`SearchMenu`, an assigned-target Chip, `+`/drag file attach (native onDragOver/onDrop),
and the DS `DropDownButton` run control (now / in 1h / when limits reset) wired to
`useTaskSubmit`. It is used in `NewTaskDialog` (`rows={10}`). What's missing vs the design:
the panel chrome + header/hint, the per-type `@token` coloring, the drag-over overlay,
suggestion chips, and the classification ack row.

## Work breakdown

### 31a — Restyle the CommandLine component (also upgrades NewTaskDialog)
- **DS gap**: `HighlightTextAreaField` currently renders all marks one style. Add a
  per-range **tone** (e.g. `HighlightRange = { start, end, tone? }` or a second highlight
  set) so `@agent` / `@pipeline` / `@file` marks color by type (accent / push / ink2) while
  path ranges keep their own tone. Small DS change — add with testid/story/test, keep the
  default (no tone) byte-identical for existing callers (TaskComposer is gone, but keep the
  API back-compatible).
- **CommandLine chrome**: wrap the input in a DS `Panel` with a header row (spark icon +
  label + right hint). Make the panel chrome **optional** via a prop (`chrome?: boolean` or
  `variant`), because inside `NewTaskDialog` it's already in a dialog — the dialog can use
  `chrome={false}` (bare growable input) or the full panel; decide during build for the
  cleanest look. On `/overview` and chat it uses the full panel.
- **Drag-over overlay**: accent dashed overlay with the "Pustit sem" hint when dragging a
  file over the box (the native onDragOver/onDrop already exists — add the visual overlay).
- **@token coloring**: feed per-type tones into `HighlightTextAreaField` for the mention
  ranges (agent/pipeline from the picked targets / known mentions; unknown → file tone).
- **Suggestion chips**: optional `suggestions?: string[]` prop → chips below the box that
  submit the suggestion text on click (shown only when the input is empty). Overview passes
  a few; the dialog can omit.
- **Classification ack row**: after submit, show a compact ack ("Klasifikováno jako … →
  spouštím …") — reuse the app's real classify result if available (the dialog already runs
  `useTaskClassification`); keep it lightweight and honest (don't fabricate a route — use
  the actual dispatch result / target). Optional via prop if it doesn't fit every host.
- Keep everything token-driven (DS tokens/props, no raw hex; the velin-b inline styles are
  a mockup — translate to DS primitives + Tailwind classes). No inline `style` on DOM.

### 31b — Overview command bar
- Add `<CommandLine>` (full panel chrome + suggestions) to `/overview`, positioned per the
  velin-b layout (a prominent command bar near the top of the overview body, after the
  hero/summary). NOTE: the operator has **in-progress uncommitted changes to
  `apps/web/features/overview/SummaryWidget.tsx`** — coordinate: add the command bar as a
  new element in the overview screen composition (likely `features/overview/Screen.tsx`),
  do NOT rewrite SummaryWidget; leave the operator's WIP intact. If a merge risk appears,
  stop and surface it rather than overwriting.

### 31c — Chat UI uses CommandLine
- The chat currently uses `ChatComposer` (sends a chat message via `onSend(text, target)`).
  Unify by using `CommandLine` in the chat surface. CommandLine needs a **submit-delegation
  mode**: an optional `onSubmit?(text, target, attachments)` that, when provided, is called
  instead of launching a task — chat passes its `send`. In chat mode the run
  DropDownButton becomes a plain send action (no schedule menu), or is hidden in favor of
  Enter-to-send. Decide the minimal, clean shape so one component serves both "launch a
  task" (Overview/dialog) and "send a message" (chat). Preserve all chat streaming behavior.
- This overlaps the chat files — do 31c AFTER Phase 30 (⌘K) lands to avoid conflicts.

## Sequencing (subagents)
1. **31a** first — DS per-range tone + CommandLine restyle (self-contained; verify in
   NewTaskDialog). Commit.
2. **31b** — Overview command bar (watch the SummaryWidget WIP). Commit.
3. **31c** — chat integration (after Phase 30). Commit.

## Verification (each part)
- `pnpm typecheck`, scoped lint (never bare `pnpm lint`), `pnpm test` green modulo known
  pre-existing failures (confirm via `git stash`). DS testid-first tests for the tone change.
- Manual: CommandLine matches velin-b (panel + header + per-type @token color + drag overlay
  + suggestions + ack); it works in NewTaskDialog, on Overview, and in chat (message send).

## Constraints
- No forwardRef, no `any`, export props, no inline DOM `style`, i18n cs-default + en for all
  new labels ("Zadej směr…", hint, "Spustit", suggestions, ack). Translate mockup inline
  styles to DS tokens/primitives.
