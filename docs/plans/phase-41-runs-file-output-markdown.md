# Phase 41 — Render a task's file output as formatted markdown on /runs

> TODO (line 63): _"stránka běhy a aktivita - výstup tasku (pokud se jedná o soubor) není
> formátovaný markdown."_

## Goal

On `/runs`, when a run's output is a FILE (e.g. a produced `.md` document — research
report, doc), render its content as **formatted markdown** using the DS Markdown viewer,
instead of showing it as plain text / a bare code block.

## Recon (implementer confirms)

- `apps/web/features/runs/components/RunDetail.tsx` — the output panel. Phase-N work surfaces
  a run's output as PR / file / void (`TaskOutputField` / the outcome summary). Find where a
  **file** output's content is rendered — likely a `CodeBlock` or plain `Typography`/pre.
  The outcome/output for a file run (`output: { kind: "file", ... }`) carries the produced
  file's path/content (check the task-run / outcome schema + how the content reaches the UI —
  there may be a query that reads the artifact file).
- The DS **Markdown** viewer exists (used for memory notes — grep `libs/design-system` for a
  `Markdown` component / the memory note viewer). Reuse it.

## Approach

- Where RunDetail renders a file output's content, if the file is markdown (`.md`/`.markdown`,
  or treat text file output as markdown by default — a produced artifact is normally a
  markdown doc), render it through the DS `Markdown` component instead of plain text /
  CodeBlock. Preserve scroll/overflow handling (wrap in the existing scroll container).
- If the output can be non-markdown (e.g. a code file), gate on extension: `.md`/`.markdown`
  (and no-extension text) → Markdown; otherwise keep the CodeBlock. Keep it simple — the
  common case (a produced `.md` artifact) must render formatted.
- Don't change how the content is fetched/stored — only the rendering.

## Files (expected)
- `apps/web/features/runs/components/RunDetail.tsx` (or the specific output sub-component it
  delegates to — e.g. an output/artifact viewer)
- reuse the DS `Markdown` component (no new DS unless the viewer needs a prop it lacks)
- tests: assert a markdown file output renders via the Markdown viewer (not raw text)

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/runs` — never bare),
  `pnpm test` green modulo known pre-existing failures (confirm via `git stash`).
- Manual: open a run whose output is a `.md` file on `/runs` — the output renders as
  formatted markdown (headings/lists/code), not a plain blob.

## Constraints
- No forwardRef, no `any`, no inline DOM `style`. Reuse the DS Markdown viewer. Don't touch
  operator WIP (SummaryWidget, machine.*, design/*).
