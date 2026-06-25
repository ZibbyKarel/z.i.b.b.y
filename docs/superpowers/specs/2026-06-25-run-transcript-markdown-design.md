# Formatted-markdown run transcript

**Date:** 2026-06-25
**Status:** Approved (design)

## Problem

Logs in the `/runs` task-detail view render as flat monospace via the DS
`CodeBlock`. The log is not plain text, though — it is a **flattened transcript**
produced server-side by `apps/api/src/runner/claude-stream-format.ts`. Each line
is glyph-prefixed scaffolding:

- `▶ ` — model / session header
- `💭 ` — extended-thinking (truncated)
- `● ` — a tool call (`● Bash$ …`, `● Read /path`, …)
- `  ⎿ ` + 5-space continuation lines — a tool result block
- `─── ` — the closing footer (`─── done in 5.2s`)
- raw `rate_limit_event` JSON lines — passed through verbatim by the formatter

…interleaved with the agent's own **text blocks, which are markdown** (headings,
lists, `code`, **bold**, fenced code). Rendered as flat mono, that markdown reads
as plain text and the JSON noise is shown raw.

Goal: render the agent's text as formatted markdown while keeping the scaffolding
(tool calls / results / headers) legible as mono rows.

## Decision

Re-parse the already-flattened log **client-side** into typed segments and render
each appropriately. We deliberately do **not** change the server-side log to
structured JSONL: that would mean a new artifact + endpoint and changes to
offset-based tail-polling, against the project rule that the plain-text log file is
the source of truth. The glyph vocabulary is small, deterministic, and defined in
one place; client re-parse is the pragmatic, low-blast-radius choice.

The one real risk of this round-trip — the web parser reconstructing structure the
formatter threw away, and the two drifting — is covered by golden fixtures taken
from real log files (below).

## Components

### 1. `apps/web/features/runs/transcript.ts` — pure parser

`parseTranscript(text: string): TranscriptSegment[]`

```ts
type TranscriptSegment =
  | { kind: "text"; markdown: string }   // contiguous agent text → markdown
  | { kind: "thinking"; text: string }   // 💭 line (glyph stripped)
  | { kind: "tool"; text: string }       // ● line
  | { kind: "result"; text: string }     // ⎿ block (multi-line, grouped)
  | { kind: "system"; text: string }     // ▶ line
  | { kind: "footer"; text: string };    // ─── line
```

Line-based classification, anchored **strictly at line-start** against the known
glyph set (mirrors `claude-stream-format.ts`; cross-referenced in a code comment):

- `▶ ` → `system`; `💭 ` → `thinking`; `● ` → `tool`; `─── ` → `footer`.
- A `  ⎿ ` line begins a `result`; following lines that start with ≥5 spaces are
  folded into the same `result` segment.
- A line that `JSON.parse`s to an object with `type === "rate_limit_event"` or a
  `rate_limit_info` key → **dropped** (operator noise). Any *other* JSON line is
  **not** dropped — so a ` ```json ` fence inside agent text survives.
- Everything else → accumulated; the run is flushed as a single `text` (markdown)
  segment when a non-text line breaks it. Grouping matters: a multi-line list or
  fenced code block must reach the markdown renderer as one source string.

No fenced-glyph state machine: the glyphs are box-drawing/dot characters that
effectively never start a line of prose or code, and tool-result bodies are already
mono via indentation. Line-start anchoring is sufficient.

### 2. `apps/web/features/runs/components/RunTranscript.tsx` — renderer

A **drop-in replacement for the log `CodeBlock`**, same prop surface so call sites
barely change:

```ts
interface RunTranscriptProps {
  text: string;
  live: boolean;          // drives the trailing caret
  scrollKey?: string;     // tail-follow trigger (pass `text`)
  placeholder?: ReactNode;// shown while empty ("waiting…")
  maxHeight?: ...;        // default "viewport"
}
```

- A scroll container reproducing `CodeBlock`'s follow-tail effect
  (`scrollTop = scrollHeight` on `scrollKey` change).
- Segments render as:
  - `text` → DS `<Markdown source={…} />`
  - `thinking` → dim italic mono row with `💭`
  - `tool` → mono row, accent `●`
  - `result` → dim mono, indented block (today's look)
  - `system` → dim mono `▶` header
  - `footer` → dim divider `───`
- Trailing caret on the last segment when `live` and the run isn't done.

**Performance (the log tail-polls — `text` grows every tick):**
- `useMemo` the `parseTranscript(text)` call on `text`.
- Wrap each markdown segment in `React.memo` keyed on its `source`, so earlier,
  unchanged segments don't re-run remark/rehype as the tail grows. `MDEditor.Markdown`
  is not cheap.

### 3. Swaps (three call sites, one renderer)

- `apps/web/features/runs/components/RunLogStream.tsx` — agent logs + goal-iteration
  child logs (used by `RunDetail` and `GoalDetailPanel`): `CodeBlock` → `RunTranscript`.
- `apps/web/features/runs/components/PipelineStageTimeline.tsx` — per-phase stage log
  (its own `CodeBlock`, line ~53): `CodeBlock` → `RunTranscript`.

The `Panel` header + line-count label in `RunLogStream` stay as-is (line count keeps
counting raw lines — cosmetic).

## Testing

- **`transcript.test.ts`** — golden fixtures from **real** log files as drift
  insurance: `orchestrator_…`, `backend-developer_…`, `koder_…` (from
  `apps/api/data/{agents,pipelines}/runs/`). Assert:
  - agent text grouped into `text` markdown segments (multi-line list/fence intact);
  - `system` / `thinking` / `tool` / `result` / `footer` classified by glyph;
  - multi-line `⎿` result folded into one `result` segment;
  - a `rate_limit_event` JSON line dropped;
  - a ` ```json ` fence inside agent text **kept** (not dropped).
- **Component test** — `RunTranscript` renders `<Markdown>` (`markdown-view` testid)
  for a text segment and mono rows for tool/result segments; caret present when live.
- **Visual acceptance (the real acceptance test — deliverable is visual):** after
  wiring, drive the app and screenshot the `/runs` detail via Playwright. Verify:
  - density — MDEditor's default heading/paragraph margins don't blow out the tight
    log; tighten via the existing token mapping if needed;
  - code-block contrast on the HUD surface;
  - angle-brackets / inline HTML in agent text are not swallowed by the renderer.

## Out of scope

- Server-side structured-JSONL log format (new artifact/endpoint, offset-tailing
  rework) — explicitly rejected above.
- Changing the line-count semantics or `Panel` chrome.
