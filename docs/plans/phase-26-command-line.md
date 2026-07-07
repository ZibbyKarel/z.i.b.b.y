# Phase 26 — Unified CommandLine task launcher

> TODO: _"implementovat CommandLine komponentu ke spouštění tasků … 'Jeden input
> zvládne vše'. Popíšu co chci do jednoho inputu, přes '@' vyhledávat
> agenty/pipeliny na přiřazení. Přes tlačítko '+' (nebo drag&drop) přidávat soubory.
> U inputu bude DropDownButton který task spustí (defaultně hned, přes options za 1h
> nebo 'až se resetují limity'). CommandLine může být libovolně vysoká, defaultně
> jeden řádek. Vyhledávání agentů inline místo jiného searchboxu. New Task Dialog se
> pak velmi zjednoduší — jen roztažená CommandLine na ~10 řádků."_

## Goal

Build one **CommandLine** component: a single growable input (default 1 row) that does
everything — free-text task description, inline `@` search to assign an agent/pipeline
target, a `+` button + drag-and-drop to attach files, and a trailing **DropDownButton**
to run (default = now; options = in 1h; when limits reset). Then simplify NewTaskDialog
to essentially an expanded CommandLine.

## Reuse map (verified recon)

- **Growable input w/ inline highlighting** — `libs/design-system/.../form/HighlightTextAreaField`
  (`HighlightRange[] = {start,end}`, `rows`, controlled, `buildSegments` merges ranges
  safely). Already used by `TaskComposer` with `extractPathRanges(text)`. Marks are a
  single style (`bg-accent/20`) — no per-range tone yet.
- **Inline `@` target search** — `apps/web/features/chat/components/ChatComposer.tsx`:
  `isMentionTrigger(text,cursor)` (:63) on `@` at start-of-word → floating DS `SearchMenu`
  (self-focusing/self-nav) filtered over `useAgentsQuery()`+`usePipelinesQuery()` (two
  `SearchMenuSection`s) → `selectMention` splices `@Name ` + stores a `TaskTarget`
  (`{kind,id,name,glyph}` from `@zibby/contracts`) → shows a closable DS `Chip`.
- **Target display** — `chat/components/TargetIdentity.tsx` (`targetGlyph` + IconTile/Typography).
- **Attach files** — `apps/web/features/tasks/components/TaskAttachments.tsx` uses DS
  `DropZone` (`onDrop(File[])`, `accept`, `multiple`, `maxSize`) + immediate upload via
  `useUploadTaskAttachmentsMutation` (multipart `POST /api/tasks/attachments` →
  `{ attachmentSetId, files }`) + `FilePreview`. Value shape
  `TaskAttachmentSet = { attachmentSetId?, files: Attachment[] }`.
- **Run scheduling** — `apps/web/features/tasks/task.ts`: `SchedulePreset =
  "now"|"in-1h"|"limit-reset"`, `resolveScheduledAt(preset,now,resetsAt)` (:189). `resetsAt =
  useLimitsQuery().rolling.resetsAt`. `ScheduleField` only offers `limit-reset` when
  `resetsAt > now`. Backend accepts arbitrary future `scheduledAt` (contract
  `CreateTaskInputSchema.scheduledAt`, result union dispatched/pending/scheduled).
- **Submit** — `apps/web/features/tasks/mutations`/`useTaskSubmit.ts` already accepts
  `{ title?, text, paths, attachmentSetId?, scheduledAt, target?, output? }` and routes
  dispatched→`/runs?run=`, pending→`/runs?run=`, scheduled→confirmation.
- **Active project (Phase 24)** — CommandLine folds the active project's `path` into
  `paths` (no project field), consistent with Phase 24-C.

## Gaps to build

1. **DropDownButton (split-button)** — does NOT exist in DS. It's a generic primitive →
   **add to DS** (`libs/design-system/src/components/DropDownButton/`). API: a primary
   action (label/icon/onClick/loading/intent/size) + a chevron that opens a `MenuSurface`
   of secondary actions (`{ id, label, icon?, onSelect }[]`). Compose from existing DS
   `Button` + `MenuSurface` (the portaled floating panel that `Dropdown`/`SearchMenu` use).
   Full DS treatment: `DropDownButtonProps` exported, `DropDownButtonTestId` enum wired to
   `data-testid`, keyboard nav (Enter primary; ArrowDown/Enter/Esc in menu), a Storybook
   story, and a jsdom test selecting via testids (assert roles/aria). See design-system
   SKILL.md.
2. **`@`-mention on HighlightTextAreaField** — `ChatComposer`'s `@`-trigger currently sits
   on a plain `TextAreaField`; port the trigger/onChange/SearchMenu logic onto the
   controlled `HighlightTextAreaField` (both are controlled textareas, so it ports
   directly). Combine `extractPathRanges` highlights with the input.
3. *(Optional, nice-to-have)* per-range tone on `HighlightTextAreaField` so `@`-mentions
   and paths can highlight distinctly. If skipped, both share the accent mark style — the
   `TaskTarget` chip still makes the assignment explicit. Decide during build; keep it out
   of scope if it balloons.

## Component design

`apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (domain composite — it
wires queries/mutations, so app not DS):
- Props: `rows?` (default 1, growable to a max e.g. 10 via auto-resize), `placeholder?`,
  `initialText?`/`initialTarget?`, `onLaunched?(result)`, plus context/output passthrough
  if the dialog needs it. Export `CommandLineProps`.
- Internals: `HighlightTextAreaField` (auto-grow, path highlights) + inline `@` SearchMenu
  (agents+pipelines) + assigned-target `Chip` (`TargetIdentity`) + a `+` attach button
  (hidden file input) AND drag-and-drop over the input (reuse `DropZone` onDrop + upload
  mutation; render `FilePreview` chips for attached files) + trailing `DropDownButton`
  (primary "Spustit"/Run → preset `now`; menu: "Za 1 hodinu" → `in-1h`; "Až se resetují
  limity" → `limit-reset`, shown only when `resetsAt > now`).
- On run: build `{ text, paths (active-project path + extracted), attachmentSetId,
  scheduledAt = resolveScheduledAt(preset, now, resetsAt), target }` and call the existing
  `useTaskSubmit` flow.
- Enter submits (run now); Shift+Enter newline. Growable height; single line by default.

## NewTaskDialog simplification

`apps/web/features/tasks/components/NewTaskDialog.tsx` → collapse to primarily
`<CommandLine rows={10} .../>`. Keep genuinely-needed extras that the single input can't
carry: optional **title** (or derive from text), **output** (PR/file/void via
`TaskOutputField`), context panel + plan preview when present. Remove the now-duplicated
inline description/target-select/attachments/schedule fields (they live inside CommandLine).
Loop mode (`LoopComposer`) — keep as an alternate, out of the CommandLine's default path.

## Placement (beyond the dialog)
- Primary deliverable: the component + NewTaskDialog integration.
- Nice-to-have within this phase: drop a one-line `CommandLine` on `/overview`
  (quick-launch) so a task can be fired without opening the dialog. Include only if it
  doesn't expand scope; otherwise defer.

## Sequencing (subagents)
1. DS `DropDownButton` (isolated; story + test + export). — subagent 1
2. `CommandLine` composite + NewTaskDialog integration (depends on 1). — subagent 2

## Verification
- DS: Storybook renders; `pnpm test` for the new DS component green; testid-based tests.
- `pnpm lint`(scoped)/`pnpm typecheck`/`pnpm test` green modulo known pre-existing failures
  (confirm via `git stash`). Repair NewTaskDialog tests that referenced removed fields.
- Manual: type a task, `@` picks an agent inline (no separate searchbox), `+`/drag attaches
  a file, the run button launches now / in 1h / at limit reset; NewTaskDialog shows the
  expanded CommandLine; task dispatches/schedules correctly.

## Constraints
- No forwardRef, no `any`, export props interfaces, no inline `style` on DOM in apps/web,
  DS testid-first tests, i18n keys for all new labels (cs default + en).
