# Phase 27 — Goal detail: open the maker / verifier run log

> Priority axis (LOOP.md): **#1 FUNCTIONALITY** — restore an "always answerable"
> capability that Phase 26 removed from the HUD. North-Star law: _"Always
> answerable — ZIBBY can explain what it is doing and has done."_

## Problem

Phase 26 folded a loop's (goal's) child **maker** and **claude verifier** runs out of
the `/runs` feed so a running loop shows one card. The trade-off: those child runs no
longer have a feed card, and the goal's own detail surface (`GoalDetailPanel`) shows
only the **iteration timeline** — maker kind + status glyph + verifier pass/fail. The
maker's actual **log** and the claude verifier's **verdict reasoning** are now
unreachable from the UI.

The data is already there. `GoalIterationSchema` keeps `makerRunRef` (the child
agent/pipeline run id — its doc comment literally says _"so its log is pollable"_) and
`verifier.runRef` (the claude verifier's run id) plus `verifier.output` (the verdict
text, always present).

## Decision: render inline, not deep-link

The runs `Screen` selects the detail run from the **folded** `list` only
(`list.find(r => r.runId === selId) ?? list[0]`). A folded child id isn't in that list,
so `?run={childId}` would silently fall back to the first feed row. → The log must be
rendered **inline inside `GoalDetailPanel`**, not navigated to.

## Scope

In scope:
- Agent maker log (the common loop maker via auto-routing) — `RunLogStream` on the
  `agents` endpoint, keyed by `makerRunRef`.
- Claude verifier log — `RunLogStream` for `verifier.runRef` when present.
- Verifier verdict text — `verifier.output` in a `CodeBlock` (always available).

Deferred (explicitly, keeps the phase one-iteration small):
- Pipeline-maker **stage** logs — there is no pipeline-run-by-id detail view; building
  one is its own phase. Pipeline-maker rows show a short note instead.

## Implementation

### 1. `RunLogStream` — ref-driven props
`apps/web/features/runs/components/RunLogStream.tsx`
- Change `RunLogStreamProps` from `{ run: RunView; …labels }` to
  `{ runId: string; logBase: "agents" | "skills" | null; live: boolean; …labels }`.
- Body: `useRunLog(runId, logBase)`, `const isLive = live`.
- Update the one existing caller (`RunDetail.tsx` `logPanel`): pass
  `runId={run.runId} logBase={run.logBase} live={run.status === "running"}`.

### 2. `GoalDetailPanel` — per-iteration log disclosure
`apps/web/features/runs/components/GoalDetailPanel.tsx`
- Local state `const [openLog, setOpenLog] = useState<number | null>(null)` — at most
  one iteration's log open ⇒ at most one live poller.
- Per row, show an "open log" ghost **toggle** (`icon="code"`) only when the row has
  something to show: `it.makerRunRef` (agent) or `it.verifier.runRef` or
  `it.verifier.output`. Toggling sets `openLog` to the index or back to `null`.
- When `openLog === it.index`, render a sub-panel (`HudPanel`) **below** the row:
  - **Maker:** `makerKind === "agent" && makerRunRef` → `RunLogStream` (runId =
    `makerRunRef`, logBase = `"agents"`, live = `it.status === "running"`). Else
    (pipeline) → a `goalPipelineMakerNote` line.
  - **Verifier:** `verifier.kind === "claude" && verifier.runRef` → `RunLogStream`
    (runId = `verifier.runRef`, logBase = `"agents"`, live = `it.status === "running"`).
  - **Verdict:** when `verifier.output` → `CodeBlock` titled `goalVerifierVerdict`.
- Conditional render ⇒ collapsed rows mount no `RunLogStream`.

### 3. i18n
`apps/web/i18n/messages/{cs,en}.json` under `runs`:
- `goalOpenLog` — toggle label / aria ("Log" / "Log").
- `goalMakerLog` — "Maker log" / "Log makera".
- `goalVerifierLog` — "Verifier log" / "Log verifieru".
- `goalVerifierVerdict` — "Verdict" / "Verdikt".
- `goalPipelineMakerNote` — pipeline-maker note (stage logs live in the pipeline view).
- Reuse existing `liveLog` / `log` / `lines` for `RunLogStream` labels.

## Tests
`apps/web/features/runs/components/GoalDetailPanel.test.tsx` (mock `../useRunLog` →
`{ text, done }`):
1. An **agent-maker** iteration (`makerRunRef` set) shows the open-log toggle; expanding
   mounts the maker log and `useRunLog` is called with that `makerRunRef`.
2. A **claude verifier** iteration (`verifier.runRef` set) reveals the verifier log.
3. The **verdict** text (`verifier.output`) renders when expanded.
4. A **pipeline-maker** iteration (no `makerRunRef`) shows the note, no log stream.
5. Opening iteration B collapses iteration A (single-open invariant).

`RunDetail` keeps working: its existing render tests (if any) cover the new prop wiring;
otherwise the agent-run log path is exercised by the unchanged `logBase` guard.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green (web/DS; api unchanged).
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `graphify update .`.
- Checkpoint commit (no push — PR is the gate).
