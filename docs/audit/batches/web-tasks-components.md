BATCH: web-tasks-components

[SEVERITY: Critical] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:1-1099] [CATEGORY: File size / component decomposition]
Single file at 1099 lines mixes mention-picker state machine, caret DOM measurement, file upload/drag-drop, highlight computation, and rendering all in one component.
Split into `useMentionPicker` (mention/caret/keyboard-nav state), `useAttachmentUpload` (upload/drag-drop/remove), a `MentionMenu` subcomponent (the portaled dropdown, ~lines 954-1029), and a `caretRect.ts` util (measureCaretRect + CARET_MIRROR_PROPS).

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:288-323] [CATEGORY: Business logic in component]
`measureCaretRect` performs raw DOM layout measurement (creates/injects a mirror `<div>` into `document.body`, reads computed style and offsets) directly inside the component file rather than an isolated, independently-testable utility module.
Extract to a standalone `caret.ts` util so it can be unit-tested without mounting the component.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:442-454] [CATEGORY: Duplicate pattern — ad-hoc event listener]
The mention panel's scroll/resize reposition effect is a raw `window.addEventListener("scroll"/"resize", ...)` pair; the same fixed-menu reposition-on-scroll/resize pattern already exists independently in `libs/design-system/src/components/Dropdown/Dropdown.tsx`, `MenuButton/MenuButton.tsx`, and `DropDownButton/DropDownButton.tsx` (the code comment even says it "mirrors DropDownButton's fixed-menu reposition").
Factor a shared `useAnchoredPosition`/`useFloatingReposition` hook (DS-level) and reuse it in all four places instead of a fourth ad-hoc copy.

[SEVERITY: High] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:184-188] [CATEGORY: Duplicate logic]
The `paths` derivation (`extractPaths(text)` merged with the selected project's path, deduped via `[...new Set(all)]`) plus the `selectedProject` lookup are byte-for-byte duplicated in `apps/web/features/tasks/components/NewTaskDialog.tsx:78-90`.
Extract a shared `useProjectScopedPaths(text, projectId)` hook or a `mergePathsWithProject` util in `../task.ts` and use it in both places.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/TaskAttachments.tsx:1-87] [CATEGORY: Dead code / duplicated logic]
The `TaskAttachments` component (drop-zone, upload, error state, remove) is never rendered anywhere in the app — only its exported `TaskAttachmentSet` type is imported elsewhere (`AutomationFormDialog.tsx`, `automations/DetailScreen.tsx`); the only JSX usage is in its own test file. Meanwhile `CommandLine.tsx` reimplements the same upload/error/remove flow inline (lines 678-721) against the same `useUploadTaskAttachmentsMutation`.
Delete the unused component (keep just the `TaskAttachmentSet` type, or move it to `task.ts`), or if it's meant to stay reachable, wire it in and share the upload logic with `CommandLine` via one hook.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:54-98] [CATEGORY: Prop drilling]
`TaskCommandLineProps` re-declares roughly 18 "presentational pass-throughs, forwarded verbatim" that duplicate `CommandLineProps` field-for-field, then forwards them unchanged into `CommandLine` at the bottom of the component; the two interfaces can silently drift.
Derive the passthrough slice via `Pick<CommandLineProps, ...>` (or spread a single `commandLineProps` object) instead of hand-copying each field.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/NewTaskDialog.tsx:94-123] [CATEGORY: Business logic in component]
Merging an explicit `@`-mention `target` with the classifier's `activeRouting` into `previewRouting`, and the render-phase tool-grant reseeding (`proposedGrantsKey` comparison), are nontrivial business rules living directly in the dialog component rather than alongside `useTaskClassification`.
Move `previewRouting` derivation and grant-reseeding into a hook (e.g. extend `useTaskClassification` or a new `useTaskRoutingPreview`) so the dialog stays presentational.

[SEVERITY: Medium] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:152-244] [CATEGORY: Component written for one place]
The `@`-mention query matcher, caret-anchored dropdown, and highlight-tone resolution (`checkMention`, `mentionRanges`, `MENTION_QUERY_RE`) are generic rich-text-composer behavior, not task-specific, but live entirely inside this one feature component with no DS-level counterpart.
Consider promoting this to a DS-level `MentionTextAreaField`/`useMentionPicker` primitive per the project convention that DS is the default source of primitives — apps/web currently owns machinery that would benefit any future composer (chat, automations) needing `@`-mentions.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:661] [CATEGORY: Type safety]
`id: result.id as SubsystemId` — `MentionResult.id` is typed as plain `string` across all three kinds, forcing a cast to reconstruct a `subsystem`-kind `TaskTarget`.
Type `MentionResult` as a discriminated union keyed on `kind` (mirroring `TaskTarget`) so the `subsystem` branch's `id` is `SubsystemId` without a cast.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/TaskOutputField.tsx:33] [CATEGORY: Type safety]
`onValueChange={(v) => onOutputTypeChange(v as OutputType)}` and the sibling `v as FileDest` cast the untyped string from `SelectField` without narrowing/validating against the actual union.
Consider a small `asOutputType(v: string): OutputType` guard (shared with `LoopComposer.tsx`'s identical `value as VerifierKind` cast) instead of a bare `as`.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/CommandLine.tsx:494,550] [CATEGORY: Hooks discipline]
Two `// eslint-disable-next-line react-hooks/exhaustive-deps` suppressions (injected-target consumption effect, pending-suggestion submit effect) intentionally read stale closures over `text`/`injectedTarget`; justified by comments but still a hidden-stale-closure risk if the surrounding logic changes.
No action required now, but flag these two effects for extra scrutiny in future edits to this file.

[SEVERITY: Low] [FILE: apps/web/features/tasks/components/CommandLine/TaskCommandLine.tsx:352-372] [CATEGORY: Component decomposition]
The classification-ack row (OrbitLoader + two Typography lines + dismiss button) is a self-contained ~20-line visual block inlined at the bottom of the 375-line container.
Extract to a small `AckRow` subcomponent to shrink `TaskCommandLine` back under the 300-line guideline.

STATS: 11 source files (test files excluded from line count), 2184 total lines. Top 3 largest: CommandLine.tsx (1099), CommandLine/TaskCommandLine.tsx (375), NewTaskDialog.tsx (215).
