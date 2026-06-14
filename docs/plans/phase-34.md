# Phase 34 — Render the memory note body as markdown

> Priority axis (LOOP.md): **#2 DESIGN/UX** (readability) — the deferred half of Phase 33.

## The gap

The vault is "plain markdown… human-readable" but the `/memory` note viewer rendered the
body as a single raw `Typography` — a wall of `#`, `-`, `**`, `` ` ``, `[[…]]`. Reading a
note or a MOC in the HUD showed source, not prose.

## Approach — dependency-frugal

`@uiw/react-md-editor` is **already a dependency** (the DS `MarkdownEditor` wraps it) and
its default export carries `MDEditor.Markdown` — a themed markdown renderer (react-markdown
+ rehype under the hood). So: **no new dependency and no hand-rolled parser** — wrap the
existing renderer in a DS viewer primitive.

## Implementation

- New DS component `libs/design-system/src/components/Markdown/Markdown.tsx`:
  `"use client"`; `import MDEditor from "@uiw/react-md-editor"` +
  `"@uiw/react-md-editor/markdown-editor.css"`; render
  `<div data-color-mode="dark" style={themeVars}><MDEditor.Markdown source={source}
  style={{ background: "transparent" }} /></div>`. Reuse the same GitHub-primer →
  design-token `themeVars` map `MarkdownEditor` uses (so rendered notes inherit the HUD
  palette). Props `{ source: string }`, testid `markdown-view`. Export `Markdown` +
  `MarkdownProps` from the DS index.
- `apps/web/features/memory/components/NoteView.tsx`: replace
  `<Typography>{note.body ?? ""}</Typography>` with `<Markdown source={note.body ?? ""} />`.

## Tests
- DS `Markdown.test.tsx`: `# Hello` → an `<h1>` named "Hello"; `- item` → a listitem;
  `**bold**` → `<strong>`.
- `NoteView.test.tsx`: the "renders the note body" assertion still passes (the body text
  is now inside the rendered markdown `<p>` — `getByText` still finds it).

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Deferred (follow-up)
Making inline `[[…]]` in prose clickable (a react-markdown `components` override mapping
wiki-links to `onSelect`). The Phase-33 link/backlink chip rows already cover navigation.
