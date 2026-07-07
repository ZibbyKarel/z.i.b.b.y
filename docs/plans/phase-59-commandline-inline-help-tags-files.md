# Phase 59 — CommandLine: scrollable inline help · drop the top target tags · files inside the input

> TODO (lines 1–5, three items — all in the same component, so one phase):
> 1. _"CommandLine komponenta - inline nápověda - výsledky musejí být scrollovatelné"_
> 2. _"CommandLine komponenta - odstraníme tagy přidaných agentů/pipelin zeshora. Po přidání
>    entity zůstane jen zvýrazněný inline zápis."_
> 3. _"CommandLine komponenta - seznam souborů bude pozicován »uvnitř inputu nad tlačítkem přidat
>    přílohu«. Nebude se roztahovat na celou šířku ale bude obsahovat ikonové reprezentace souborů
>    a jejich názvu a velikosti a tlačítka na odstranění. Soubory budou renderovány v řádku, který
>    se bude zalamovat pokud se nevejde."_

## Target file

`apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (+ its test
`CommandLine.test.tsx`). This is the ONLY app file to change. No DS change is expected for items 1–2;
item 3 reuses existing DS primitives (see below) — do NOT add a DS component unless one is genuinely
missing after checking.

## Item 1 — inline help (the `@`-mention dropdown) must be scrollable

**Current:** `mentionResults` (line ~783) caps the list with `.slice(0, 6)`. The portaled
`MenuSurface` already has `scroll` + a clamped `maxHeight` (`mentionMenuStyle`), and MenuSurface's
`scroll` yields `max-h-[60vh] overflow-y-auto`. Because the list is capped at 6 it never overflows, so
the scroll never engages.

**Change:** raise the cap so a real agent/pipeline catalog produces a long, scrollable list. Remove the
`.slice(0, 6)` hard cap (or raise it to a generous bound like `.slice(0, 50)` as a runaway guard). The
existing `MenuSurface scroll` + `maxHeight` clamp already handle the overflow — verify the panel scrolls
its rows within `maxHeight` and the keyboard-nav highlight (`activeMentionIndex`) still clamps correctly
when navigating past the visible window. No new scroll machinery needed; this is a cap change plus a
verification that scroll engages.

## Item 2 — remove the top target chip; keep only the inline highlight

**Current:** lines ~1072–1086 render, above the box, a `Stack` with a closable `Chip` showing
`target.name` whenever a target is picked. The picked `@Name` ALSO already lives inline in the text,
highlighted by `mentionRanges` (accent for agents, push for pipelines).

**Change:** delete that top `target && (<Stack>…<Chip/></Stack>)` block entirely — after picking an
entity, the only visible trace is the highlighted inline `@Name` in the textarea.

**Keep the target in sync with the text (important):** today the `Chip`'s close button is the only way to
clear `target`; once the chip is gone, the operator clears a target by editing the `@Name` out of the
text. So `target` must be DERIVED-FROM / RECONCILED-WITH the text rather than sticking around after its
mention is deleted:
- When `handleChange` runs, if the current `target` is set but its `@target.name` token no longer appears
  in the text, clear it (`setTarget(undefined)` + `onTargetChange?.(undefined)`). Reuse the same
  `MENTION_RE`/name-matching already in `mentionRanges` so "present in text" means the same thing the
  highlight uses (case-insensitive, `@` + non-space token equal to the target name).
- Leave `pickMentionResult` setting `target` as it does now. The reconciliation only REMOVES a stale
  target; picking still sets it.
- `clearTarget` (used only by the now-deleted chip) can be removed if nothing else references it. The
  `CommandLineTestId.TargetChip` enum member and its `removeAria` usage go away with the block — remove
  the enum member too (grep the test + repo first to be sure nothing else selects it).
- `onTargetChange` still fires on both pick and clear so embedding parents (chat quick-switcher,
  classify preview) stay correct.

Do NOT change the injected-target path (chat quick-switcher) beyond keeping `onTargetChange` honest.

## Item 3 — file list inside the input, above the attach button, as a wrapping row of compact tiles

**Current:** attachments render in a **full-width** `Stack` BELOW the whole box (lines ~1118–1140) using
`FilePreview` (one per row). The attach `+` button is pinned bottom-left inside the input
(`CONTROLS_INSET`), and the run/send control bottom-right, over a reserved bottom strip
(`CONTROLS_RESERVED_BOTTOM = 2.75rem`).

**Change:** move the attached-files list INSIDE the input box, positioned just ABOVE the attach `+`
button (i.e. sitting in the reserved bottom strip / just above it, left-aligned over the textarea's
bottom padding), rendered as a **wrapping row** (`Stack direction="row" wrap`) of **compact file tiles** —
NOT the full-width `FilePreview` stack. Each tile shows:
- a small file icon (a DS `Icon` — pick by `file.mediaType`, e.g. `image`/`file`; a single `"file"`
  glyph is acceptable if no media-type mapping exists),
- the file **name** (truncate long names),
- the file **size** (reuse whatever human-size formatter the codebase already has — check
  `FilePreview`/`TaskAttachments` for an existing `formatBytes`/size helper and reuse it; do not
  re-implement if one exists),
- a **remove** button (✕) that removes THAT file.

Layout/ґotchas:
- The row must NOT stretch full width — it's a wrapping inline row of tiles (`wrap`), each tile
  content-sized. Use DS primitives only (`Stack`, `Container`, `Chip`/`Tag`/`Card`, `Icon`, `Button`,
  `Typography`). A `Chip`/`Tag` with an icon + `closable` may be the cleanest tile; if the size label
  doesn't fit a Chip cleanly, build a small `Card`/`Container` tile. Decide explicitly and keep it DS-only
  (no raw `<div>`/inline `style` beyond a DS `style` passthrough for a genuinely-dynamic value — none is
  expected here).
- Because the tiles now occupy space at the bottom of the input, ensure they don't collide with the
  overlaid attach `+` / run controls. Simplest: render the file-tile row inside the input area (the inner
  `Container position="relative"` that holds the textarea + overlaid controls), positioned above the
  attach button (e.g. absolutely just above `CONTROLS_INSET`, or in normal flow with the reserved bottom
  strip grown to fit one wrapped row). Grow the reserved bottom padding / min-height as needed so text and
  tiles never overlap the controls. Keep the drop-overlay and drag-drop working.
- **Per-file remove:** the current `handleRemoveAttachments` clears ALL files (FilePreview's single
  `onRemove` removed the whole set). Now each tile removes one file: add a `handleRemoveFile(name)` that
  filters `attachments.files` by name and updates `attachments` + `onAttachmentsChange`. (Attachments are
  keyed by `name` today — the existing `key={file.name}`. A duplicate-basename edge case is pre-existing
  and out of scope.)
- The uploading spinner (`upload.isPending`) and `attachError` messaging must still surface — keep them
  (they can stay just below the box, or move inline; keep them visible and testable).
- `showAttach={false}` (chat) hides the attach affordance already; the file-tile row only appears when
  there are files, so chat is unaffected.

## Tests (`CommandLine.test.tsx`)

Follow the project testid convention — select by `data-testid`, keep assertions as
role/attribute/text assertions. Add/adjust:
- Item 1: with many agents+pipelines mocked, the mention menu renders more than the old 6 rows and the
  menu is the scrollable `MenuSurface` (assert it renders >6 `MentionItem`s; scroll overflow is a CSS
  class — asserting the container is present is enough, jsdom can't measure scroll).
- Item 2: after picking a mention, there is NO top `TargetChip`; the inline `@Name` highlight/text is
  present; deleting the `@Name` from the text clears the target (`onTargetChange` called with
  `undefined`). Remove the old chip-based assertions.
- Item 3: after "uploading" files (mock `useUploadTaskAttachmentsMutation`), the file tiles render inside
  the box as a wrapping row with name + size, and a per-file remove button removes only that file
  (`onAttachmentsChange` gets the reduced set). Replace the old full-width `FilePreview` assertions.

Add any new testid enum members you introduce (e.g. `FileTile`, `FileTileRemove`) to `CommandLineTestId`
and wire them.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint apps/web/features/tasks/components/CommandLine` clean (NEVER bare `pnpm lint` — the base
  config doesn't cover apps/web; `rtk pnpm typecheck` also lies here, use `tsc -p` directly).
- `rtk proxy npx vitest run apps/web/features/tasks/components/CommandLine` green.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` on a DOM node in apps/web
  (`react/forbid-dom-props`) — compose DS primitives; a genuinely-dynamic value goes through a DS
  component's `style` passthrough (as the existing `paddingBottom`/`CONTROLS_INSET` do).
- Reuse existing helpers (size formatter, `MENTION_RE`, mention-name matching) — don't duplicate.
- Do NOT touch operator WIP: `PipelineStageTimeline.tsx`, `.zibby/data/**`, `apps/web/features/chat/**`
  internals beyond the props CommandLine already exposes, `RunLogStream.tsx`, `machine.*`, `design/*`.
- Only edit `CommandLine.tsx` + `CommandLine.test.tsx` (and the `CommandLineTestId` enum within).
