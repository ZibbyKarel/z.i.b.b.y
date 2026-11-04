# Interleave tool calls in the phase log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an agent phase's tool calls inline, in chronological order between its text, instead of in one block at the bottom.

**Architecture:** `agentBody` keeps the order `groupTranscript` already yields and returns ordered `blocks`; `AgentBody` maps them to `Markdown` / framed `LogStream` panels.

**Tech Stack:** TypeScript, React 19, vitest, @zibby/design-system.

**Spec:** `docs/superpowers/specs/todo-43.md`

## Global Constraints

- Web-only change; no API, contract or SSE change.
- No inline `style`, no `any`; compose from DS (`Markdown`, `Panel`, `LogStream`, `Stack`).
- Do not touch `RunDetailHeader`.

## Review Focus

- Consecutive tool calls batch into ONE panel (not one panel per call). Pinned in Task 1.
- Tool ordinals (`ts`) and ids keep counting across the whole round, not per block. Pinned in Task 1.
- Non-text, non-toolCall groups (system/thinking/footer) are skipped and do not split a tool batch. Pinned in Task 1.
- A raw tool phase is exactly one tools block (existing tests rewritten). Task 1.
- Empty-text segments produce no empty text block. Task 1.

---

### Task 1: Ordered blocks in the model and the feed

**Files:**

- Modify: `apps/web/features/runs/runDetailModel.ts` (FeedItem agent variant, `agentBody`)
- Modify: `apps/web/features/runs/components/RunLiveFeed.tsx` (`AgentBody`, `FeedAgent`, `PriorRoundLog`)
- Test: `apps/web/features/runs/runDetailModel.test.ts`, `apps/web/features/runs/components/RunLiveFeed.test.tsx`

**Interfaces:**

- Produces: `export type AgentBlock = { kind: "text"; markdown: string } | { kind: "tools"; lines: LogStreamLine[] }`; `agentBody(phaseId, transcript, raw): { blocks: AgentBlock[] }`; FeedItem agent variant replaces `markdown`+`tools` with `blocks: AgentBlock[]`.

- [ ] Step 1: Test `agentBody("p", "Intro\n● Read(a)\n● Bash(b)\nMiddle\n● Write(c)\nEnd", false)` → blocks `[text "Intro", tools [p-0/01 Read(a), p-1/02 Bash(b)], text "Middle", tools [p-2/03 Write(c)], text "End"]`. Update existing "splits the transcript" and raw tests to the `blocks` shape. Add a RunLiveFeed test asserting DOM order text → tool panel → text via a new `RunLiveFeedTestId.Tools = "run-feed-tools"` on each panel.
- [ ] Step 2: Run `vitest run apps/web/features/runs/runDetailModel.test.ts --project web` and `vitest run apps/web/features/runs/components/RunLiveFeed.test.tsx --project web-components` → FAIL.
- [ ] Step 3: Implement: walk groups; `text` (trimmed, non-empty) pushes a text block; `toolCall` appends to the last block if it is tools, else pushes a new tools block; running counter for ids/ts. Raw → `[{ kind: "tools", lines }]` (empty lines → `[]`).
- [ ] Step 4: Re-run both → PASS. Prettier + eslint on the four files.
- [ ] Step 5: Commit.
