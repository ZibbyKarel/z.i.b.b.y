# TODO 46 — Tab select + read-only mention highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab picks the active mention suggestion in `CommandLine`; mentions render highlighted in the sent chat bubble and the run INPUT view.

**Architecture:** Tab joins Enter in `CommandLine.handleKeyDown`'s open-panel branch. The textarea backdrop's segmenter/tones move to a shared DS module, reused by a new read-only DS `HighlightText` and a new `highlight` prop on DS `Markdown` (a rehype plugin over hast text nodes). `mentionRanges`/`KnownName` move out of `CommandLine.tsx` to `features/tasks/mentions.ts` with a `useKnownMentionNames()` hook for read-only renderers.

**Tech Stack:** React 19, Tailwind v4, vitest + Testing Library, `@uiw/react-md-editor`.

**Spec:** `docs/superpowers/specs/todo-46.md`

## Global Constraints

- No second token parser: read-only highlighting calls `mentionRanges` exactly as the input does.
- DS stays i18n-agnostic; apps/web writes no Tailwind classes; DS components carry a `TestId` enum, tests select via `getByTestId`.
- No `any`, no `forwardRef`, no inline `style` in apps/web.

## Review Focus

- Tab with the panel open but zero results → must NOT be swallowed (normal focus move). Test in Task 1.
- Shift+Tab with panel open → normal reverse focus, no pick. Test in Task 1.
- Mention inside a fenced/inline code block in a brief → not highlighted. Test in Task 3.
- Chat bubble with no known names → text rendered verbatim, no marks. Test in Task 4.
- Multi-word name ("@Coloring Book") → one mark (already covered by `mentionRanges` tests; reused unchanged).

---

### Task 1: Tab picks the active suggestion

**Files:** Modify `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (`MENTION_NAV_KEYS`, `handleKeyDown`); Test `CommandLine.test.tsx`.

- [ ] Tests: `"Tab picks the highlighted @ suggestion like Enter"` (type `@`, press Tab → value contains `@<name> `, panel closed); `"Tab with no results keeps normal focus behaviour"` (`fireEvent.keyDown` Tab returns not-prevented); `"Shift+Tab never picks"`.
- [ ] Run `pnpm exec vitest run apps/web/features/tasks/components/CommandLine/CommandLine.test.tsx --project web-components` → FAIL.
- [ ] Implement: add `"Tab"` to `MENTION_NAV_KEYS`; in the open-panel branch, `e.key === "Tab" && !e.shiftKey && active` → `preventDefault` + `pickMentionResult(active)`; otherwise fall through untouched.
- [ ] Re-run → PASS. Commit.

### Task 2: DS shared segmenter + `HighlightText`

**Files:** Create `libs/design-system/src/components/form/HighlightTextAreaField/highlightSegments.ts` (`buildSegments(value, highlights): Segment[]`, `markToneClass(tone?: HighlightTone): string`, types `HighlightRange`/`HighlightTone`); modify `HighlightTextAreaField.tsx` to import them; create `libs/design-system/src/components/HighlightText/HighlightText.{tsx,test.tsx,stories.tsx}`; export from `libs/design-system/src/index.ts`.

**Produces:** `HighlightText({ text: string; highlights: HighlightRange[] })`, `HighlightTextTestId { Root = "highlight-text", Mark = "highlight-text-mark" }` (mark suffixed `-<start>`).

- [ ] Tests: renders text verbatim in Root; one mark per range with visible text; tone `push` mark has `bg-risk-push/[0.14]`; existing HighlightTextAreaField tests still pass.
- [ ] Implement: marks keep inherited text colour (`text-inherit`), same bg/ring classes as the backdrop.
- [ ] Run DS tests for both files → PASS. Commit.

### Task 3: DS `Markdown` `highlight` prop

**Files:** Modify `libs/design-system/src/components/Markdown/Markdown.tsx`; Test `Markdown.test.tsx`.

**Produces:** `MarkdownProps.highlight?: (text: string) => HighlightRange[]`; marks carry `data-testid="markdown-mark"` (`MarkdownTestId.Mark`).

- [ ] Tests: `highlight` returning `[{start:0,end:4,tone:"accent"}]` on `"@Bob hi"` → one `markdown-mark` with text `@Bob`; same text inside `` `@Bob` `` → no mark.
- [ ] Implement a hand-rolled rehype plugin (no new dep, like `remarkEscapeRawHtml`): walk hast, skip `code`/`pre` subtrees, split each text node by `buildSegments` into text + `mark` elements with `markToneClass`. Pass via `rehypePlugins` on both variants only when `highlight` is set.
- [ ] Run → PASS. Commit.

### Task 4: App wiring — chat bubble + run INPUT view

**Files:** Create `apps/web/features/tasks/mentions.ts` (move `KnownName`, `Trigger`, `mentionRanges`, `ALL_TRIGGERS`; add `useKnownMentionNames(): KnownName[]` from the same queries CommandLine uses: agents/departments `@` accent, workflows `@` push, companies/teams/projects `#` push, skills `/` accent); modify `CommandLine.tsx` to import from it; modify `apps/web/features/chat/components/ChatMessage.tsx` (user text → `HighlightText`) and `apps/web/features/runs/components/RunInputView.tsx` (`Markdown highlight`).

- [ ] Tests (ChatMessage.test.tsx / RunInputView test): user turn `"ask @Builder now"` with agent `Builder` in the catalog mock → one `highlight-text-mark-4`; text without mentions → no marks.
- [ ] Run web-components tests for ChatMessage, RunInputView, CommandLine → PASS. tsc web. Commit.
