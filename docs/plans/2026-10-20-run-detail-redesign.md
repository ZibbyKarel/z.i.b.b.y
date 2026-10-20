# Run Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/activity/runs/[runId]` to the ZibbyCorp "Run Detail" design (header, metrics, stage rail, LIVE/INPUT/OUTPUT views, composer) and ship the backend it needs: pause/resume, operator messages, agent questions and operator answers, reject-stops-run, per-stage timestamps, an output file tree, fresh vs. continue re-runs, and a structured diffstat.

**Architecture:** Contract-first. Phase A extends `libs/contracts` (ts-rest + Zod). Phase B implements it in `apps/api`, mostly inside `WorkflowRunnerService.drive()`'s stage-boundary loop. Every state change goes through `writeAggregate`, which already emits the `workflow-runs` SSE status event, so the web needs no new live channel. Phase C adds the few DS components the design needs that no existing component passes. Phase D replaces the 927-line `RunDetail.tsx` with region composites under `apps/web/features/runs/components/`, plus one pure model module. Phase E checks the main regions with the design-match CLI.

**Tech Stack:** NestJS + ts-rest + Zod + vitest (api/contracts), Next.js 15 / React 19 / TanStack Query / next-intl / Tailwind v4 DS (web), Claude Code CLI child processes (runner).

**Spec:** `design/ZibbyCorp/Run Detail.dc.html` (design). The operator decisions that apply (1 and 6) are copied into §Decisions below.

## Decisions (operator, 2026-10-20) and technical decisions (this plan)

Operator decision 1: build the FULL design including the backend: PAUSE/RESUME, "message the crew", agent QUESTION→ANSWER, REJECT stops the run, per-stage start/finish (rail mm:ss), the output folder tree, RE-RUN FRESH vs CONTINUE SESSION, RE-RUN of a done run, and a structured diffstat.
Operator decision 6: work directly on `main` (no PRs, no worktrees). Never `--no-verify`. Stage only your own files.

Technical decisions (grounded in the runner research, with file:line refs from 2026-10-20):

- **D-PAUSE: pause takes effect at the next stage boundary, for workflow runs only.** A stage's `claude -p` child is spawned with stdin `ignore` (`runner-core.ts:435`) and its own process group. SIGSTOP would freeze a process that holds an HTTPS stream to the model API (the stream times out), would keep holding a fuse slot, and would not survive an API restart. Kill-and-resume loses the in-flight tool step, and workflow stages never keep a claude session anyway (`resumeSessionId` is agent-only). So PAUSE sets a durable `pauseRequested` flag in `run.json`. The current stage finishes normally, and `drive()` checks the flag at the top of the loop (next to the existing limit/budget halts, `workflow-runner.service.ts:~1167`) and parks the run with the new `parkedReason: "paused"`. A paused run holds no fuse slot and no employee lease, and it survives a restart like every other durable park. RESUME re-enters `drive()` at `currentStage`, the same way `resumeNoEmployee` does. The UI is honest about this: the header shows `PAUSING · AFTER THIS STAGE` until the boundary is reached. Agent runs have no boundary, so they get no PAUSE button. STOP + CONTINUE SESSION (`--resume <sessionId>`) is their equivalent, and it already exists.
- **D-MSG: operator messages are queued durably and delivered at the next stage start.** No live channel into a running claude process exists (stdin is `ignore`, `--input-format stream-json` is unused). Re-plumbing every stage to stream-json input is a large, risky change. The design itself says "DELIVERED BETWEEN STEPS / It lands in their context on the next step". Messages are appended to `run.operatorMessages[]` in `run.json`. `drive()` folds the undelivered ones addressed to `all` or to the starting phase into that stage's resume context (the `--append-system-prompt-file` channel `pendingResumeContext` already uses), then stamps `deliveredAt`/`deliveredPhaseId`. The feed shows each YOU bubble with QUEUED / DELIVERED → STAGE / NOT DELIVERED. No fake agent acknowledgements: the design's canned "Noted. I will apply that…" replies are dropped ("a reply is concrete or it is not drafted"). Agent runs: the composer is disabled while running. In stopped/errored states the message becomes the `--resume` turn's prompt (D-RERUN).
- **D-ASK: an agent asks through an MCP tool `ask_operator`, gated by the existing approval hook.** A new in-process MCP server, `zibby-run` at `POST /api/runs/mcp` (seeded like `zibby-kb`, using the same per-boot run bearer token and the `X-Zibby-Run-Id` header), exposes `ask_operator({question})`. The PreToolUse approval hook's matcher gains `mcp__zibby-run__ask_operator`. The hook classifies the call as `action: "operator.question"`, which is a new `ask:human` floor entry. The child then blocks on the standard `intent-request.json` → `intent-decision.json` protocol (24h deadline, fail-closed) and the run shows `awaiting-approval`. This reuses the entire approval path (queue, NEEDS YOU rail, briefing, activity log, restart semantics). The operator answers through a new `POST /approvals/:id/answer {answer}`: the answer is stored in the approval's `reason`, the approval goes to `approved`, and the runner resumes (allow). The MCP tool then runs and returns the stored answer to the model. A question can never self-approve: the floor entry is locked, so the gate cannot be talked around (Law 1/4).
- **D-REJECT: reject already exists** (`POST /approvals/:id/reject`). One bug to fix: rejecting a mid-stage `workflow-stage` approval currently falls into the stage failure path and can retry (`workflow-runner.service.ts:282-290`). It must land the run `interrupted` the way STOP does (the design says "The run stops and keeps its partial output").
- **D-RERUN: `resumeTaskRun` gains `mode: "continue" | "fresh"`.** The default `continue` keeps today's behaviour. CONTINUE SESSION means: agent → `--resume <sessionId>`; workflow → continue in place from the stopped phase (`continueFailed`). Workflow stages have no claude session, so "session" means the run's on-disk state plus the resume context; that is stated in the UI copy. RE-RUN FRESH means a new task from the original task's inputs (`rerunTask`). A `done` run accepts only `fresh` (that is the "RE-RUN" button). The resume `note` is no longer dropped on the agent and `continueFailed` paths.
- **D-DIFF: the diffstat is structured server-side.** `WorkspaceService.numstat` keeps the per-file rows that `diffStats` currently throws away. `PrOutputSchema` gains `files[]`, the PR-gate park stores `run.pendingDiffstat`, and `TaskRun.diffstat` exposes whichever applies.
- **D-FILES: a new read-only `GET /tasks/runs/:runId/files`** lists the workflow run root (no dotfiles, depth ≤ 4, ≤ 500 entries, symlinks only if their realpath stays inside the run root). It does not serve file contents. "OPEN FOLDER ↗" uses the existing `openTaskRunFolder`.
- **D-STAGE-TIME:** `StageRunSchema.startedAt/finishedAt` come from `RunnerCore`'s `rec.startedAt` and the moment `waitForStage` returns. `WorkflowRun.currentStageStartedAt` gives the live row its clock.

## Global Constraints

- Contract-first: every new field or route lands in `libs/contracts` (Phase A) before any API/web code reads it.
- SSE for live streams, polling only for `health`/`limits`. New state reaches the web via the existing `workflow-runs` status event (emitted by `writeAggregate`). Do not add intervals.
- The approval floor is structural: `operator.question` is a locked `ask:human` floor entry. No config can make it `allow`.
- Inbound/agent content is data: question text, agent transcript and file names render as text/escaped markdown (`Markdown escapeHtml`). Never interpret them.
- Web: no inline `style` in `apps/web`, no own Tailwind classes, no `any`, no `forwardRef`. Props interfaces are exported as `<Component>Props`. Every DS component gets a `<Component>TestId` enum, a story and a test. Tests select by `getByTestId`.
- i18n: every visible string is a key in both `apps/web/i18n/messages/en.json` and `cs.json` under `runs.detail.*` (table in Task D1). The DS stays i18n-agnostic (English default props).
- Run statuses: `TaskRunStatusSchema` gains `"paused"`. `ParkedReasonSchema` gains `"paused"`. No other new statuses.
- Brand names, if any copy mentions them: team.blue, Simply.com (org rule).
- Tests (scoped, never repo-wide per edit): `rtk vitest run <file> --project api|contracts|design-system|web`. apps/web component tests (`*.test.tsx` under `features/**/components/`) use `--project web-components`.
- After each file edit: `pnpm exec prettier --write <file> && pnpm exec eslint --fix <file>`.
- Commit recipe (every task; on `main`; never `--no-verify`):
  ```bash
  pnpm self-knowledge:generate
  git add <your files> .zibby/data/vault/knowledge/self-knowledge.md
  PATH="$PWD/node_modules/.bin:$PATH" git commit -m "<msg>

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  If the pre-commit hook reports self-knowledge drift, regenerate and retry. The PATH prefix avoids the global TypeScript shadowing the pinned one (TS5102/TS5090).
- Model per task: **[Opus]** = crucial (state machine, gate, semantics). **[Sonnet]** = mechanical. Marked on each task.

## Review Focus

1. **A pause request racing a failing stage.** If the stage fails and the loop retries, the run must still pause at the next loop top. If it parks on retries or ends, the flag must be cleared (otherwise a later resume-from-retries pauses instantly). Test in B4.
2. **API restart while paused or pausing.** A `paused` park must survive `reconstruct()`, and `pauseRequested` persists in `run.json`. Test in B4.
3. **Two questions in one run.** `ask_operator` must return the answer to *its own* question (match on run prefix + question text + latest `decidedAt`), never the previous answer. A missing run id or no matching approval fails closed with an explanatory tool result and no hang. Test in B8.
4. **A message addressed to a phase that never runs again.** It stays `QUEUED` while the run is open and renders `NOT DELIVERED` once the run is terminal. It is never silently lost or delivered to the wrong phase. Test in B5 (delivery filter) and D2 (status derivation).
5. **Symlink and `..` escape in the files listing.** `output/` entries are symlinks into stage dirs and must list. A symlink pointing outside the run root must be skipped. Test in B3.
6. **Double send.** Enter-key repeat or a double click must not send twice: the send button and Enter are disabled while the mutation `isPending`. Test in D7.

---

## Phase A — Contracts

### Task A1: Task-run, workflow-run and common schemas + new task-run routes [Sonnet]

**Files:**
- Modify: `libs/contracts/src/common.schema.ts` (add `DiffFileSchema`, `DiffstatSchema`)
- Modify: `libs/contracts/src/workflows/workflow-run.schema.ts` (`StageRunSchema` :44-81, `ParkedReasonSchema` :102-115, `WorkflowRunSchema` :160-317, add `OperatorMessageSchema`)
- Modify: `libs/contracts/src/tasks/task.schema.ts` (`PrOutputSchema` :510-514)
- Modify: `libs/contracts/src/tasks/task-run.schema.ts` (`TaskRunStatusSchema`, `TaskRunSchema`, `ResumeTaskRunSchema`, add `SendRunMessageSchema`, `RunFileEntrySchema`, `RunFilesSchema`)
- Modify: `libs/contracts/src/tasks/task-runs.contract.ts` (3 routes)
- Modify: `libs/contracts/src/index.ts` (export new schemas/types if the index lists them explicitly)
- Test: `libs/contracts/src/tasks/task-run.schema.test.ts`

**Interfaces — Produces:**
```ts
// common.schema.ts
export const DiffFileSchema = z.object({
  path: z.string().min(1),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  /** git numstat reports `-`/`-` for binaries — kept as a row, counted as 0/0. */
  binary: z.boolean().optional(),
});
export type DiffFile = z.infer<typeof DiffFileSchema>;
export const DiffstatSchema = z.object({
  files: z.array(DiffFileSchema),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type Diffstat = z.infer<typeof DiffstatSchema>;

// workflow-run.schema.ts
StageRunSchema += { startedAt: z.string().optional(), finishedAt: z.string().optional() }
ParkedReasonSchema += "paused"
export const OperatorMessageSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(4000),
  /** "all" or a phaseId — delivered when that phase next starts. */
  to: z.string().min(1),
  at: z.string(),
  deliveredAt: z.string().optional(),
  deliveredPhaseId: z.string().optional(),
});
export type OperatorMessage = z.infer<typeof OperatorMessageSchema>;
WorkflowRunSchema += {
  pauseRequested: z.boolean().optional(),
  currentStageStartedAt: z.string().optional(),
  operatorMessages: z.array(OperatorMessageSchema).optional(),
  pendingDiffstat: DiffstatSchema.optional(),
}

// task.schema.ts
PrOutputSchema += { files: z.array(DiffFileSchema).optional() }

// task-run.schema.ts
TaskRunStatusSchema += "paused"
TaskRunSchema += {
  pauseRequested: z.boolean().optional(),
  currentStageStartedAt: z.string().optional(),
  messages: z.array(OperatorMessageSchema).optional(),
  /** Would-publish (parked at a PR gate) or published (prOutput.files) per-file diff. */
  diffstat: DiffstatSchema.optional(),
}
ResumeTaskRunSchema = z.object({
  note: z.string().optional(),
  /** continue (default): --resume session / continue in place. fresh: new task from the original inputs. */
  mode: z.enum(["continue", "fresh"]).optional(),
});
export const SendRunMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  to: z.string().min(1).default("all"),
});
export type SendRunMessageInput = z.infer<typeof SendRunMessageSchema>;
export const RunFileEntrySchema = z.object({
  /** POSIX path relative to the run root, e.g. "output/report.md". */
  path: z.string().min(1),
  kind: z.enum(["file", "dir"]),
  size: z.number().int().nonnegative(),
  modifiedAt: z.string(),
});
export const RunFilesSchema = z.object({
  entries: z.array(RunFileEntrySchema),
  truncated: z.boolean(),
});
export type RunFiles = z.infer<typeof RunFilesSchema>;
```
Routes added to `taskRunsContract` (after `resumeTaskRun`):
```ts
pauseTaskRun: {
  method: "POST", path: "/tasks/runs/:runId/pause", pathParams: RunIdParam, body: EmptyBodySchema,
  responses: { 200: TaskRunSchema, 404: ErrorSchema, 409: ErrorSchema },
  summary: "Request a pause: the running workflow parks at the next stage boundary",
},
sendTaskRunMessage: {
  method: "POST", path: "/tasks/runs/:runId/messages", pathParams: RunIdParam, body: SendRunMessageSchema,
  responses: { 200: TaskRunSchema, 404: ErrorSchema, 409: ErrorSchema },
  summary: "Queue an operator message, delivered into the next stage's context",
},
listTaskRunFiles: {
  method: "GET", path: "/tasks/runs/:runId/files", pathParams: RunIdParam,
  responses: { 200: RunFilesSchema, 404: ErrorSchema },
  summary: "List a workflow run's folder (read-only tree; no file contents)",
},
```

- [ ] **Step 1: Write failing tests** in `task-run.schema.test.ts`: (a) `TaskRunStatusSchema.parse("paused")` succeeds; (b) `SendRunMessageSchema.parse({ text: "  hi " })` → `{ text: "hi", to: "all" }`; (c) `SendRunMessageSchema.safeParse({ text: "   " }).success === false`; (d) `ResumeTaskRunSchema.safeParse({ mode: "bogus" }).success === false`; (e) `StageRunSchema.parse({ phaseId:"p", runId:"r", attempt:1, status:"done", startedAt:"2026-10-20T10:00:00Z", finishedAt:"2026-10-20T10:02:00Z" })` keeps both times; (f) `DiffstatSchema` rejects a negative `additions`.
- [ ] **Step 2: Run** `rtk vitest run libs/contracts/src/tasks/task-run.schema.test.ts --project contracts`. Expected: FAIL (unknown enum member / missing export).
- [ ] **Step 3: Implement** the schemas and routes above verbatim.
- [ ] **Step 4: Run** the test again. Expected: PASS. Then run `rtk tsc -p tsconfig.base.json --noEmit` once. A new `TaskRunStatus` member breaks exhaustive `Record<FeedStatus, …>` maps (e.g. `RUN_STATE` in `apps/web/features/runs/run.ts`). Add a minimal `paused` entry there now so the tree typechecks: `{ key: "paused", badge: "neutral", dot: "idle", glyph: "pause", pulse: false }`, plus `runs.state.paused` = en "Paused" / cs "Pozastaveno" in both catalogs. Fix every other exhaustive map the same way.
- [ ] **Step 5: Commit** `feat(contracts): run pause/messages/files routes, stage times, structured diffstat`.

### Task A2: Approvals `answer` route + `operator.question` action constant [Sonnet]

**Files:**
- Modify: `libs/contracts/src/approvals/approval.schema.ts` (export constant + `AnswerApprovalSchema`)
- Modify: `libs/contracts/src/approvals/approvals.contract.ts` (route after `revise`, :51-60)
- Test: `libs/contracts/src/approvals/approval.schema.test.ts` (create it if absent, following the sibling `*.schema.test.ts` style)

**Interfaces — Produces:**
```ts
/** The intent action an agent's `ask_operator` MCP call is classified as. */
export const OPERATOR_QUESTION_ACTION = "operator.question" as const;
export const AnswerApprovalSchema = z.object({ answer: z.string().trim().min(1).max(4000) });
export type AnswerApprovalInput = z.infer<typeof AnswerApprovalSchema>;
// approvals.contract.ts
answerApproval: {
  method: "POST", path: "/approvals/:id/answer", pathParams: z.object({ id: z.string() }),
  body: AnswerApprovalSchema,
  responses: { 200: ApprovalSchema, 404: ErrorSchema, 409: ErrorSchema },
  summary: "Answer an agent's operator.question approval (stores the answer, resumes the run)",
},
```
(Match the exact `pathPrefix`/param style of the neighbouring `approveApproval`/`reviseApproval` entries.)

- [ ] **Step 1: Failing test:** `AnswerApprovalSchema.safeParse({ answer: " " }).success === false`; `AnswerApprovalSchema.parse({ answer: " yes " }).answer === "yes"`; `OPERATOR_QUESTION_ACTION === "operator.question"`.
- [ ] **Step 2: Run** `rtk vitest run libs/contracts/src/approvals --project contracts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): approvals answer route for operator questions`.

---

## Phase B — API

All of the following live in `apps/api/src/workflows/workflow-runner.service.ts` (WRS) unless stated otherwise. The test harness is `workflow-runner.service.test.ts`. Reuse its existing fake `RunnerCore`/workflow fixtures and helpers verbatim (find how existing tests drive a 2-phase workflow to `done`, and how they park/resume). Do not invent a new harness.

### Task B1: Per-stage start/finish timestamps + live stage clock [Sonnet]

**Files:**
- Modify: WRS `runStage` (:2357-2447), the child-stage builder in `onChildStatus` (:2745-2753), `drive()` stage push (:1388)
- Modify: `apps/api/src/tasks/task-runs.service.ts` `workflowRunToView` (:590-639)
- Test: `apps/api/src/workflows/workflow-runner.service.test.ts`, `apps/api/src/tasks/task-runs.service.test.ts`

**Interfaces:**
- Consumes: `StageRunSchema.startedAt/finishedAt`, `WorkflowRun.currentStageStartedAt` (A1).
- Produces: every non-synthetic `stageRuns[]` entry carries `startedAt` + `finishedAt`. `TaskRun.currentStageStartedAt` is set while a stage runs.

- [ ] **Step 1: Failing tests.** (a) WRS: drive a 2-phase workflow to done and assert `stageRuns.every(s => s.startedAt && s.finishedAt && s.finishedAt >= s.startedAt)`. (b) WRS: while phase 1 is running (fake core holds it), `readAggregate(run).currentStageStartedAt` is set. After the stage is pushed it is `undefined`. (c) task-runs: `workflowRunToView` passes `currentStageStartedAt` through.
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/workflows/workflow-runner.service.test.ts --project api`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `runStage`, right after `run.currentStageRunId = rec.runId`:
  ```ts
  run.currentStageStartedAt = rec.startedAt;
  await this.writeAggregate(run); // also emits SSE so the rail's live row appears at once
  ```
  In the returned StageRun object, add `startedAt: rec.startedAt, finishedAt: new Date().toISOString()`. Where `drive()` pushes the stage result (:1341, :1347, :1365, :1388), set `run.currentStageStartedAt = undefined` before the push. For a child-workflow stage (`onChildStatus`), use the child aggregate's `startedAt` and `new Date().toISOString()`. The synthetic `.escalated` marker (:1551) stays without times. In `workflowRunToView` add `currentStageStartedAt: r.currentStageStartedAt`.
- [ ] **Step 4: Run** both test files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(workflows): record per-stage start/finish and the live stage clock`.

### Task B2: Structured diffstat (numstat rows → PrOutput.files, pendingDiffstat, TaskRun.diffstat) [Sonnet]

**Files:**
- Modify: `apps/api/src/workspace/workspace.service.ts` (`diffStats` :592-613, add `numstat`)
- Modify: WRS PR-gate park (:2524-2532) and every resume path that leaves that park (`approve`/resume of the stage approval: clear the field when the run is un-parked, :1382)
- Modify: WRS PR open (:2227) and `apps/api/src/tasks/task-output.service.ts` (:425), both of which build `prOutput` from `diffStats`
- Modify: `apps/api/src/tasks/task-runs.service.ts` (`workflowRunToView`, `enrichRunWithTask` :675-716)
- Test: `apps/api/src/workspace/workspace.service.test.ts`, `workflow-runner.service.test.ts`, `task-runs.service.test.ts`

**Interfaces:**
- Produces: `WorkspaceService.numstat(opts: { worktreePath: string; baseRef: string }): Promise<DiffFile[]>`. `diffStats(...)` returns `{ additions, deletions, files: DiffFile[] }`, a superset, so callers keep compiling. `TaskRun.diffstat = run.pendingDiffstat ?? (prOutput?.files ? { files, additions, deletions } : undefined)`.

- [ ] **Step 1: Failing tests.** workspace: in a temp git repo (reuse the file's existing temp-repo helper), commit a 3-line text file plus a 1-byte binary on a branch. `numstat` returns `[{path:"a.txt",additions:3,deletions:0},{path:"b.bin",additions:0,deletions:0,binary:true}]` and `diffStats` sums to `{additions:3, deletions:0}`. WRS: parking on a `pr.open` intent sets `run.pendingDiffstat.files.length > 0`, and approving clears it. task-runs: a done run whose task outcome `pr.files` exists maps to `diffstat`.
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/workspace/workspace.service.test.ts --project api`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  ```ts
  async numstat(opts: { worktreePath: string; baseRef: string }): Promise<DiffFile[]> {
    const out = await exec("git", ["diff", "--numstat", `${opts.baseRef}...HEAD`], {
      cwd: opts.worktreePath, timeout: GIT_TIMEOUT_MS,
    }).then((r) => r.stdout).catch(() => "");
    const files: DiffFile[] = [];
    for (const line of out.split(/\r?\n/)) {
      const [add, del, ...rest] = line.split("\t");
      const path = rest.join("\t");
      if (!path || add === undefined || del === undefined) continue;
      const binary = add === "-" && del === "-";
      files.push({
        path,
        additions: binary ? 0 : Number.parseInt(add, 10) || 0,
        deletions: binary ? 0 : Number.parseInt(del, 10) || 0,
        ...(binary ? { binary: true } : {}),
      });
    }
    return files;
  }
  async diffStats(opts: { worktreePath: string; baseRef: string }) {
    const files = await this.numstat(opts);
    return {
      additions: files.reduce((s, f) => s + f.additions, 0),
      deletions: files.reduce((s, f) => s + f.deletions, 0),
      files,
    };
  }
  ```
  At the PR-gate park (next to the existing `diffstat.txt` write, which stays for legacy readers) set `run.pendingDiffstat = await this.workspace.diffStats({ worktreePath, baseRef })`, then clear it (`= undefined`) wherever the stage approval resolves. The `prOutput` builders spread `files` in automatically if they spread the `diffStats` result; if they pick fields, add `files`.
- [ ] **Step 4: Run** the three test files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(workspace): per-file diffstat on PR output and at the PR gate`.

### Task B3: Read-only run files listing [Sonnet]

**Files:**
- Modify: WRS (add `listRunFiles`, next to `runFolder` :990)
- Modify: `apps/api/src/tasks/task-runs.service.ts` (`listFiles`), `apps/api/src/tasks/task-runs.controller.ts` (route handler)
- Test: `workflow-runner.service.test.ts`, `apps/api/src/tasks/task-runs.service.test.ts`

**Interfaces:**
- Produces: `WorkflowRunnerService.listRunFiles(workflowRunId: string): Promise<RunFiles | null>` (null = unknown run). `TaskRunsService.listFiles(runId): Promise<RunFiles>`, which throws the existing not-found error (→ 404) for unknown or non-workflow runs.

- [ ] **Step 1: Failing tests** (temp run root built with `fs.mkdtemp` the way existing WRS tests build run roots): files `context/input.md`, `01_plan/plan.md`, `.zibby-system-prompt.md`, symlink `output/plan.md → ../01_plan/plan.md`, symlink `output/evil → /etc`. Expect the entries to include `context/`, `context/input.md`, `01_plan/plan.md`, `output/`, `output/plan.md`. Expect them NOT to include any dotfile or `output/evil`. Order: dirs before files at each level, alphabetical. A tree of 600 files gives `entries.length === 500 && truncated === true`.
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/workflows/workflow-runner.service.test.ts --project api -t listRunFiles`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  ```ts
  const MAX_ENTRIES = 500; const MAX_DEPTH = 4;
  async listRunFiles(workflowRunId: string): Promise<RunFiles | null> {
    const run = await this.findRun(workflowRunId); // use whatever get/readAggregate the class already uses for runFolder()
    if (!run) return null;
    const root = await fs.realpath(this.resolveRunDir(run)); // the run ROOT, not book/
    const entries: RunFiles["entries"] = [];
    let truncated = false;
    const walk = async (rel: string, depth: number): Promise<void> => {
      const names = (await fs.readdir(path.join(root, rel))).filter((n) => !n.startsWith(".")).sort();
      const stats = await Promise.all(names.map(async (n) => {
        const relPath = rel ? `${rel}/${n}` : n;
        const abs = path.join(root, relPath);
        const real = await fs.realpath(abs).catch(() => null);
        if (!real || (real !== root && !real.startsWith(root + path.sep))) return null; // symlink escape
        const st = await fs.stat(real).catch(() => null);
        return st ? { relPath, st } : null;
      }));
      const ok = stats.filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => Number(b.st.isDirectory()) - Number(a.st.isDirectory()));
      for (const { relPath, st } of ok) {
        if (entries.length >= MAX_ENTRIES) { truncated = true; return; }
        const dir = st.isDirectory();
        entries.push({ path: relPath, kind: dir ? "dir" : "file", size: dir ? 0 : st.size, modifiedAt: st.mtime.toISOString() });
        if (dir && depth < MAX_DEPTH) await walk(relPath, depth + 1);
      }
    };
    await walk("", 1);
    return { entries, truncated };
  }
  ```
  `TaskRunsService.listFiles`: resolve the kind with the existing resolver. Only `workflow` delegates; everything else throws not-found. Controller: implement `listTaskRunFiles` the same way `getTaskRunArtifact` is implemented (404 mapping).
- [ ] **Step 4: Run** both test files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): read-only run folder listing`.

### Task B4: Pause at the next stage boundary + resume [Opus]

**Files:**
- Modify: WRS `drive()` loop top (:1158-1206), `resumeParked` (:591-669), `stop` (:908-941), the durable-park list in `reconstruct` (:2998-3067), the park/terminal paths (clear `pauseRequested`)
- Modify: `apps/api/src/tasks/task-runs.service.ts` (`pause`, `resume`, `workflowRunToView` :602-617), `task-runs.controller.ts` (`pauseTaskRun`, 409 mapping)
- Test: `workflow-runner.service.test.ts`, `task-runs.service.test.ts`

**Interfaces:**
- Consumes: `ParkedReasonSchema "paused"`, `TaskRunStatus "paused"`, `WorkflowRun.pauseRequested` (A1).
- Produces: `WorkflowRunnerService.requestPause(workflowRunId): Promise<WorkflowRun>` (throws `WorkflowRunNotPausableError` unless `status === "running"`, or `status === "parked" && parkedReason === "approval"`). `WorkflowRunnerService.cancelPause(workflowRunId): Promise<WorkflowRun>`. `TaskRunsService.pause(runId): Promise<TaskRun>` (agent/goal/scheduled → `TaskRunNotPausableError` → 409). `workflowRunToView` maps `parked + parkedReason "paused"` → `status: "paused"` and passes `pauseRequested`.

- [ ] **Step 1: Failing tests (WRS).**
  1. `"pause lands after the current stage"`: 3-phase workflow, phase 1 held running by the fake core. `requestPause` → aggregate has `pauseRequested: true` and status still `running`. Release phase 1 (done). Expect status `parked`, `parkedReason: "paused"`, `currentStage === "phase2"`, `pauseRequested` falsy, phase 2 never started (fake core `start` called once), and fuse/lease released (assert via the existing fuse fake's held count, as other tests do).
  2. `"resume continues at the paused phase"`: from (1), `resumeParked(id)` → phase 2 starts, the run completes `done`, and `stageRuns` has phase1, phase2, phase3 exactly once each.
  3. `"a retry loop still pauses at the next boundary"`: phase 2 fails with a `loop.to: phase1` back-edge, pause requested during phase 2 → parks `paused` with `currentStage === "phase1"`.
  4. `"parking on exhausted retries clears the pause request"`: `pauseRequested` true, then the run parks with `retries` → `pauseRequested` falsy.
  5. `"paused survives a restart"`: write a paused aggregate, call `reconstruct()` → status still `parked/paused`.
  6. `"stop a paused run"` → `interrupted`.
  7. `"pause is refused on a done run"` → throws `WorkflowRunNotPausableError`.
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/workflows/workflow-runner.service.test.ts --project api -t pause`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  `drive()`, immediately after `run.currentStage = phase.id` and before the boundary limit check:
  ```ts
  if (run.pauseRequested) {
    run.pauseRequested = false;
    run.status = "parked";
    run.parkedReason = "paused";
    await this.writeAggregate(run);
    return;
  }
  ```
  `requestPause`: load the run, check the allowed states, set `pauseRequested = true`, `writeAggregate`, return the run. `cancelPause`: clear the flag and write. Clear `pauseRequested` in the shared park helper(s) (`parkAtGate`, the retries/no-employee/limit park sites) and wherever the run becomes `done/failed/interrupted`. Find a single choke point if one exists (e.g. a `setTerminal`/`park` helper). Otherwise add `run.pauseRequested = false` at each site; the tests above pin it.
  `resumeParked`: accept `parkedReason === "paused"`. Re-enter like the `limit` branch (cursor = `currentStage`, `recomputeHandoff`, no retry reset). If a `note` is given, push it as an operator message (`to: "all"`) instead of writing `<phase>.note.md` (B5 delivers it; until B5 lands, compose it into `resumeContext.note`).
  `stop`: the existing `parked → interrupted` branch already covers `paused`. Assert it in test 6.
  `reconstruct`: add `"paused"` to the durable parked reasons.
  `TaskRunsService.pause`: kind workflow → `requestPause` → view. `TaskRunsService.resume`: if the run is `running && pauseRequested` → `cancelPause` (the RESUME button while PAUSING). Otherwise the existing routing, where `paused` falls into `resumeParked`.
  Controller: `pauseTaskRun` maps `TaskRunNotPausableError`/`WorkflowRunNotPausableError` → 409.
- [ ] **Step 4: Run** the WRS + task-runs tests. Expected: PASS. Also `rtk vitest run apps/api/src/tasks/task-scheduler.service.test.ts --project api` (paused must not trip drain/terminal handling). Expected: PASS.
- [ ] **Step 5: Commit** `feat(workflows): pause a run at the next stage boundary, resume in place`.

### Task B5: Operator messages — queue + delivery at stage start [Opus]

**Files:**
- Modify: `apps/api/src/workflows/resume-context.ts` (add `buildOperatorMessagesBlock`)
- Modify: WRS (add `addOperatorMessage`; delivery in `drive()` where `pendingResumeContext` is consumed, :1286-1287; `resumeParked` note → message)
- Modify: `apps/api/src/tasks/task-runs.service.ts` (`sendMessage`, map `messages`), `task-runs.controller.ts`
- Test: `apps/api/src/workflows/resume-context.test.ts`, `workflow-runner.service.test.ts`, `task-runs.service.test.ts`

**Interfaces:**
- Produces: `buildOperatorMessagesBlock(texts: string[]): string` (returns `""` for an empty list). `WorkflowRunnerService.addOperatorMessage(workflowRunId, input: { text: string; to: string }): Promise<WorkflowRun>` (throws `WorkflowRunNotMessageableError` when the run is `done/failed/interrupted`). `TaskRunsService.sendMessage(runId, body: SendRunMessageInput): Promise<TaskRun>` (non-workflow → `TaskRunNotMessageableError` → 409). `TaskRun.messages = r.operatorMessages`.

- [ ] **Step 1: Failing tests.**
  - resume-context: `buildOperatorMessagesBlock([])` → `""`. `buildOperatorMessagesBlock(["use pnpm", "skip docs"])` contains `"### Messages from the operator"` and both texts as `- ` bullets, in order.
  - WRS 1 `"a message reaches the next stage, not the current one"`: phase 1 running, `addOperatorMessage({text:"use pnpm", to:"all"})`, release phase 1 → the fake core's captured phase-2 `resumeContext` (or system-prompt file content, whichever the harness exposes for existing note tests) contains "use pnpm". The aggregate message has `deliveredPhaseId: "phase2"` and `deliveredAt`.
  - WRS 2 `"a phase-addressed message waits for that phase"`: `to: "phase3"` → not in phase 2's context, but in phase 3's.
  - WRS 3 `"a message is delivered once"`: phase 2 fails and loops back to phase 1 → the second phase-1 attempt does not get it again.
  - WRS 4 `"terminal run refuses messages"`: done → throws `WorkflowRunNotMessageableError`.
  - task-runs: `sendMessage` on an agent run → `TaskRunNotMessageableError`.
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/workflows/resume-context.test.ts apps/api/src/workflows/workflow-runner.service.test.ts --project api -t message`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  ```ts
  // resume-context.ts
  /** Operator messages for the starting stage. Operator-authored (trusted channel), shown verbatim. */
  export function buildOperatorMessagesBlock(texts: string[]): string {
    const items = texts.map((t) => t.trim()).filter(Boolean);
    if (items.length === 0) return "";
    return ["### Messages from the operator", "", ...items.map((t) => `- ${t}`)].join("\n");
  }
  ```
  WRS `addOperatorMessage`: push `{ id: randomUUID(), text, to, at: new Date().toISOString() }` onto `run.operatorMessages ??= []`, then `writeAggregate`. This is the in-memory run object `drive()` also holds, so there is no separate file and no lock (single process, same object; the aggregate write is atomic).
  WRS `drive()`, where `pendingResumeContext` is consumed for the stage about to start:
  ```ts
  const due = (run.operatorMessages ?? []).filter((m) => !m.deliveredAt && (m.to === "all" || m.to === phase.id));
  const msgBlock = buildOperatorMessagesBlock(due.map((m) => m.text));
  const stageResumeContext = [consumedResumeContext, msgBlock].filter(Boolean).join("\n\n");
  if (due.length) {
    const at = new Date().toISOString();
    for (const m of due) { m.deliveredAt = at; m.deliveredPhaseId = phase.id; }
    await this.writeAggregate(run);
  }
  ```
  Pass `stageResumeContext` where `consumedResumeContext` went before. `resumeParked` with a note on a `paused` park: `addOperatorMessage({ text: note, to: "all" })` (replace B4's interim). Other park reasons keep their `<phase>.note.md` behaviour, and additionally push the note as an already-delivered message (`deliveredAt = now, deliveredPhaseId = parked.phaseId`) so the feed shows the YOU bubble.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(workflows): queue operator messages and deliver them at the next stage`.

### Task B6: Resume modes — fresh vs continue, re-run of done, note not dropped [Opus]

**Files:**
- Modify: `apps/api/src/tasks/task-runs.service.ts` (`resume` :285-305, `rerunAgent` :317-325, `rerunTask` :334-353)
- Modify: `apps/api/src/agents/agent-runner.service.ts` (`rerun` :256-280: accept `note`, `fresh`)
- Modify: WRS `continueFailed(runId, note?)` (:758-797)
- Modify: `task-runs.controller.ts` (pass the body through)
- Test: `task-runs.service.test.ts`, `apps/api/src/agents/agent-runner.service.test.ts` (or the file where `rerun` is tested), `workflow-runner.service.test.ts`

**Interfaces:**
- Consumes: `ResumeTaskRunSchema.mode` (A1).
- Produces: `TaskRunsService.resume(runId, input: ResumeTaskRunInput): Promise<TaskRun>` (returns the new run for fresh/agent re-runs, the same run for in-place continues). `AgentRunnerService.rerun(runId, opts?: { note?: string; fresh?: boolean })`. `continueFailed(runId, note?: string)`.

Routing table (implement exactly this):

| run kind / status | mode `continue` (default) | mode `fresh` |
|---|---|---|
| any `done` | 409 `TaskRunNotResumableError` | `rerunTask(run, note)` (needs `taskId`, else 409) |
| agent `error`/`interrupted` | `agentRunner.rerun(id, { note })` → `--resume <sessionId>` when captured, `-p` = note when given | `rerunTask(run, note)`, falling back to `agentRunner.rerun(id, { note, fresh: true })` when there is no `taskId` |
| workflow/goal `error`/`interrupted` | `continueFailed(id, note)`, else `rerunTask` | `rerunTask(run, note)` |
| workflow `parked` (any reason) / `paused` | `resumeParked(id, note)` (existing) | stop it (→ `interrupted`), then `rerunTask(run, note)` |
| goal parked | existing | 409 |
| `running && pauseRequested` | `cancelPause` (B4) | 409 |

`rerunTask(run, note)`: when `note` is given, append `\n\nOperator note: <note>` to the copied task text. `AgentRunnerService.rerun` with `note` + session: the note becomes the `-p` prompt of the `--resume` turn (that is how a continued session receives a new user turn). Without a note, keep today's prompt.

- [ ] **Step 1: Failing tests.** One per table row: assert which collaborator was called (spy) and with what. Plus: `"continueFailed carries the note into the resume context"` (WRS) and `"rerun with a session passes the note as the prompt"` (agent runner: assert the built argv has `--resume <sid>` and `-p` contains the note).
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/tasks/task-runs.service.test.ts --project api -t resume`. Expected: FAIL.
- [ ] **Step 3: Implement** the table. Keep the existing 409 error classes.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tasks): re-run fresh vs continue session, re-run of done runs, keep resume notes`.

### Task B7: Rejecting a mid-stage approval stops the workflow run [Opus]

**Files:**
- Modify: WRS `workflow-stage` runner registration `cancel` (:282-290)
- Test: `workflow-runner.service.test.ts`

- [ ] **Step 1: Failing test** `"rejecting a stage's approval interrupts the run, no retry"`: a phase with `loop.maxRetries: 2` raises a `git.push` intent → parked/approval. `approvals.reject(id)` (or call the registered `cancel(stageRunId)` the way existing tests do) → aggregate status `interrupted`, no further `core.start`, and partial `stageRuns` kept.
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/workflows/workflow-runner.service.test.ts --project api -t reject`. Expected: FAIL (it retries).
- [ ] **Step 3: Implement.** In the `cancel` registration, resolve the owning workflow run from the stage run id (prefix before the first `.`, or the lookup the registration already does) and add it to `this.stopRequested` before `core.cancel(stageRunId)`. `drive()` already lands `stopRequested` runs `interrupted` (:1346-1357).
- [ ] **Step 4: Run.** Expected: PASS. Also `rtk vitest run apps/api/src/approvals/approvals.service.test.ts --project api`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(workflows): rejecting a stage approval stops the run instead of retrying`.

### Task B8: Agent question → operator answer (`ask_operator` MCP tool + hook + answer endpoint) [Opus]

**Files:**
- Modify: `apps/api/src/runner/claude-approval-hook.mjs` (`classifyEvent` :1107-1124)
- Modify: `apps/api/src/runner/claude-run-command.service.ts` (`approvalGroup` matcher :259-266, `OPERATING_CONTRACT` :164-183)
- Modify: `apps/api/src/gates/policy.storage.service.ts` (`ASK_FLOOR_ACTIONS` :142+; make it locked like `pr.merge`'s deny lock)
- Create: `apps/api/src/runner/run-mcp.controller.ts` (+ register it in `claude-run.module.ts` or the module that hosts `KbMcpController`)
- Modify: `apps/api/src/mcp/mcp.storage.service.ts` (seed `zibby-run` like `seedKbServer`, same run bearer token)
- Modify: `apps/api/src/approvals/approvals.service.ts` (`answer`), `approvals.controller.ts` (route)
- Test: `claude-approval-hook.test.ts`, `claude-run-command.service.test.ts`, `policy.storage.service.test.ts`, `apps/api/src/runner/run-mcp.controller.test.ts` (new; mirror `kb-mcp.controller.test.ts`'s harness), `approvals.service.test.ts`

**Interfaces:**
- Consumes: `OPERATOR_QUESTION_ACTION`, `AnswerApprovalSchema` (A2).
- Produces: `RUN_MCP_SERVER_ID = "zibby-run"`; MCP tool name `ask_operator`; full Claude tool name `mcp__zibby-run__ask_operator`. `ApprovalsService.answer(id: string, answer: string): Promise<Approval>` (409 `ApprovalNotAnswerableError` when `action !== OPERATOR_QUESTION_ACTION` or the approval is already decided).

Flow: the agent calls `mcp__zibby-run__ask_operator({question})`. The PreToolUse hook classifies it as `operator.question` and writes `intent-request.json`. The runner sees `ask` (floor) → `holdForApproval` + `requestApproval` (kind `agent` or `workflow-stage`, as today). The run is now `awaiting-approval`/parked-approval. The operator calls `POST /approvals/:id/answer`, which runs `decide("approved", answer)` and then `runner.resume` (allow). The tool call proceeds, and `RunMcpController` returns the stored answer.

- [ ] **Step 1: Failing tests.**
  - hook: `classifyEvent({ tool_name: "mcp__zibby-run__ask_operator", tool_input: { question: "Which env?" } })` → `{ action: "operator.question", context }` where `JSON.parse(context)` is `{ riskType: "question", summary: "Which env?", consequence: "The run waits for your answer." }`. An empty question → `{ action: "operator.question", … summary: "(empty question)" }` (still gated, never fail-open).
  - run-command: the approval matcher string contains `mcp__zibby-run__ask_operator`. `OPERATING_CONTRACT` mentions `ask_operator`.
  - policy: the floor evaluates `operator.question` → `ask` with `resolve: human`, and a user rule `{ action: "operator.question", decision: "allow" }` cannot override it.
  - approvals: `answer` on a pending `operator.question` → status `approved`, `reason === answer`, `runner.resume` called. `answer` on a `git.push` approval → `ApprovalNotAnswerableError`. Already decided → the existing already-decided error.
  - run-mcp controller: with `X-Zibby-Run-Id: wf_1` and an approved approval `{ runId: "wf_1.build_123_9", action: "operator.question", detail: '{"summary":"Which env?"}', reason: "staging", decidedAt: t2 }` plus an older approved one for another question → `ask_operator({question:"Which env?"})` returns text containing "staging". No run id → `isError` result "ask_operator only works inside a ZIBBY run". No matching approved approval → text "No answer was recorded. Decide yourself or stop." (no throw, no wait).
- [ ] **Step 2: Run** `rtk vitest run apps/api/src/runner/claude-approval-hook.test.ts apps/api/src/runner/run-mcp.controller.test.ts apps/api/src/approvals/approvals.service.test.ts --project api`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  Hook branch (before `return null`):
  ```js
  if (input?.tool_name === "mcp__zibby-run__ask_operator") {
    const q = String(input?.tool_input?.question ?? "").trim().slice(0, 2000) || "(empty question)";
    return {
      action: "operator.question",
      context: JSON.stringify({ riskType: "question", summary: q, consequence: "The run waits for your answer." }),
    };
  }
  ```
  Matcher: `"Bash|Task|Write|Edit|mcp__zibby-run__ask_operator"`.
  `OPERATING_CONTRACT`: keep "NEVER ask for confirmation" and add one line: "If you are blocked on a fact only the operator knows (not a permission or a confirmation), call `mcp__zibby-run__ask_operator` once with one concrete question, then continue with the answer."
  Floor: add `"operator.question"` to the `ask:human` floor and mark it locked (follow how the floor marks `pr.merge`'s locked deny).
  `RunMcpController`: copy `KbMcpController`'s skeleton (`@Post("api/runs/mcp")` + `@Get` 405, `KbMcpAuthGuard` accepting the run token only, `runIdFromHeader`, a stateless `McpServer` per request). Register one tool:
  ```ts
  server.registerTool("ask_operator", {
    description: "Ask the operator ONE concrete question you cannot answer yourself. Blocks until answered.",
    inputSchema: { question: z.string().min(1).max(2000) },
  }, async ({ question }) => {
    if (!runId) return { isError: true, content: [{ type: "text", text: "ask_operator only works inside a ZIBBY run." }] };
    const answered = (await this.approvals.list({ status: "approved" }))
      .filter((a) => a.action === OPERATOR_QUESTION_ACTION
        && (a.runId === runId || a.runId.startsWith(`${runId}.`))
        && summaryOf(a.detail) === question.trim())
      .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))[0];
    const text = answered?.reason
      ? `The operator answered:\n${answered.reason}`
      : "No answer was recorded. Decide yourself or stop.";
    return { content: [{ type: "text", text }] };
  });
  ```
  (`summaryOf` = `JSON.parse(detail).summary` in a try/catch, falling back to `detail`. A stage's `X-Zibby-Run-Id` is the workflow run id, because stage run ids embed the pid and do not exist at config time, so the prefix match is required. Verify what `opts.runId` is at WRS:478 and agent-runner, and adjust the match if an agent passes its own run id.)
  Seed `zibby-run` in `mcp.storage.service.ts` exactly like `seedKbServer` (url `http://localhost:${port}/api/runs/mcp`, run bearer token rewritten on every boot). `buildCatalog` then adds `mcp__zibby-run__*` to `--allowedTools` automatically.
  `ApprovalsService.answer`: load the approval, check that `action === OPERATOR_QUESTION_ACTION` and that it is pending, `decide("approved", answer)` (stores `reason`), then `runner.resume(runId)`, the same path as `approve`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `rtk vitest run apps/api/src/kb --project api` (shared guard untouched). Expected: PASS.
- [ ] **Step 5: Commit** `feat(runner): agents can ask the operator via ask_operator, answered through the approval gate`.

---

## Phase C — Design system (`libs/design-system`)

Follow `.claude/skills/design-system/SKILL.md` for every component: CVA/variant maps, a `<Component>TestId` enum, `*.stories.tsx`, `*.test.tsx` with `getByTestId`, and an export from `src/index.ts`. Values come from the design and map onto existing tokens (`--color-ink/ink-2/ink-3/line/line-2/panel/panel-2/bg`, `--color-state-*`). Add no hex.

Region-by-region decision record (why each region does or does not need DS work):

| Design region | Decision | Reason |
|---|---|---|
| breadcrumb line | app-local (Pressable + Typography) | DS `Breadcrumb` renders one separator; the design mixes `/` and `·` with link segments |
| title, meta line | app-local (Typography, `StatePill`, `AgentGlyph`, `Pressable`) | existing primitives; `StatePill` = bordered chip + dot |
| header actions | existing `Button` (primary/secondary) + `MenuButton variant="bordered"` | `bordered` is the ZibbyCorp header overflow trigger |
| 2px progress hairline | existing `Progress height` token | — |
| 6 metrics | **extend `MetricStrip` `columns: 3 \| 4 \| 6`** | same skeleton; the column count is data, not a style variant |
| body grid 260px rail + toolbar/feed/composer column at viewport height | **new DS `RailSplit`** | no `Grid` sidebar preset is 260px, and the right column's auto/1fr/auto rows plus a scroll ref are a reusable layout |
| stage row (selected left 2px ink bar, panel-2 bg) | **new DS `RailItem`** | the selection affordance needs component-owned classes |
| LIVE/INPUT/OUTPUT switch | existing `SegmentedControl` | exact match (hairline group, selected filled ink) |
| approval/question/parked banners | app-local on `Card corners borderTone="ink"` | `Card` already owns the HUD bracket + ink border |
| hold-to-approve (ink, state-work fill) | **extend `HoldButton` `tone: "ink"`** | shared with the PR-inbox "Squash and merge" HoldButton (decision 3), so not single-use |
| WOULD PUBLISH / PR file rows with +/− bars | **new DS `DiffstatList`** (`density: "compact" \| "table"`) | the bar widths are computed, which needs component-owned styling; both densities are in this design |
| folder tree rows (indent per depth) | **new DS `FileTreeList`** | depth indent is computed |
| agent message + tool-log box | app-local (`AgentGlyph`, Typography, `Markdown escapeHtml`, `Panel` + `LogStream`) | primitives exist |
| YOU bubble | existing `ChatBubble author="you"` | one visual language with the chat dock (DNA); the 1px font difference (13 vs 14) is accepted and documented, not a fork |
| TO recipient chips | **new DS `ToggleChip`** (`pressed`, `leading`) | no bordered toggle chip exists (`Pressable chipTone` is a rounded status pill) |
| composer input + send | existing `TextInputField` (aria-label, no visible label) + `Button` | — |
| confirm modal | existing app `ConfirmDeleteDialog` (DS `Dialog`) | the dialog-confirms grammar |
| not-found | existing `EmptyState` with `action` | — |

### Task C1: `MetricStrip` 6 columns + `HoldButton` ink tone [Sonnet]

**Files:** `libs/design-system/src/components/MetricStrip/MetricStrip.tsx|.test.tsx|.stories.tsx`, `libs/design-system/src/components/HoldButton/HoldButton.tsx|.test.tsx|.stories.tsx`

- [ ] **Step 1: Failing tests.** `render(<MetricStrip columns={6} items={six} />)` → `getByTestId(MetricStripTestId.Root)` has class `grid-cols-6` and `metric-strip-item-5` exists. `render(<HoldButton tone="ink" label="HOLD TO APPROVE" />)` → root has the ink classes (assert `bg-ink`) and its fill element carries `bg-state-work` (use the fill test id the component already has, or add `HoldButtonTestId.Fill`).
- [ ] **Step 2: Run** `rtk vitest run libs/design-system/src/components/MetricStrip libs/design-system/src/components/HoldButton --project design-system`. Expected: FAIL (type error / class missing).
- [ ] **Step 3: Implement.** `columns: 3 | 4 | 6` with `6: "grid-cols-6"`. HoldButton: `HoldButtonTone += "ink"`, `toneClass.ink = "bg-ink text-panel border-ink"`, `fillClass.ink = "bg-state-work"` (use the token class name that `globals.css` exposes for `--color-state-work`). Add a story per new value.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ds): MetricStrip 6 columns, HoldButton ink tone`.

### Task C2: `RailSplit` [Sonnet]

**Files:** create `libs/design-system/src/components/RailSplit/{RailSplit.tsx,RailSplit.test.tsx,RailSplit.stories.tsx}`; export from `src/index.ts`.

**Interfaces — Produces:**
```ts
export enum RailSplitTestId { Root = "rail-split-root", Rail = "rail-split-rail", Toolbar = "rail-split-toolbar", Body = "rail-split-body", Footer = "rail-split-footer" }
export interface RailSplitProps {
  rail: ReactNode;            // left 260px column, own scroll, right hairline
  toolbar?: ReactNode;        // right column row 1 (panel bg, bottom hairline, padding 10px 20px)
  children: ReactNode;        // right column row 2: scroll body (bg, padding 20px 24px, flex col gap 14px)
  footer?: ReactNode;         // right column row 3 (panel bg, top hairline, padding 12px 20px)
  bodyRef?: Ref<HTMLDivElement>; // the scrolling body — the feed auto-scrolls it
  ref?: Ref<HTMLDivElement>;
}
```
Classes: root `grid grid-cols-[260px_minmax(0,1fr)] h-[calc(100vh-330px)] min-h-[560px]`; rail `border-r border-line flex flex-col min-h-0 overflow-auto`; right `grid grid-rows-[auto_minmax(0,1fr)_auto] min-h-0 min-w-0 bg-background`. Below `lg`, stack to one column with rail on top (`grid-cols-1`, rail max-h 240px). No horizontal page scroll at phone width (16px gutter comes from the page).

- [ ] **Step 1: Failing test:** renders all four slots by test id; `bodyRef.current` is the Body element; `footer` omitted → no Footer node.
- [ ] **Step 2: Run** `rtk vitest run libs/design-system/src/components/RailSplit --project design-system`. Expected: FAIL.
- [ ] **Step 3: Implement** + story (rail with 5 items, toolbar, 30 feed lines, footer).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ds): RailSplit layout`.

### Task C3: `RailItem` + `ToggleChip` [Sonnet]

**Files:** create `libs/design-system/src/components/RailItem/*`, `libs/design-system/src/components/ToggleChip/*`; export both.

**Interfaces — Produces:**
```ts
export enum RailItemTestId { Root = "rail-item-root", Leading = "rail-item-leading", Title = "rail-item-title", Meta = "rail-item-meta" }
export interface RailItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "title"> {
  leading?: ReactNode;   // 30px centred column (AgentGlyph)
  title: ReactNode;      // 13px/500
  meta?: ReactNode;      // mono 10px .1em ink-3, flex gap 6px (StateDot + text)
  selected?: boolean;    // border-l-2 border-ink bg-panel-2; else border-transparent; hover bg-panel-2
  ref?: Ref<HTMLButtonElement>;
}
export enum ToggleChipTestId { Root = "toggle-chip-root", Leading = "toggle-chip-leading" }
export interface ToggleChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  pressed: boolean;      // aria-pressed; border-ink text-ink vs border-line-2 text-ink-2
  leading?: ReactNode;   // e.g. an 18px AgentGlyph
  children: ReactNode;   // mono 10px .12em uppercase label
  ref?: Ref<HTMLButtonElement>;
}
```
RailItem layout: `grid grid-cols-[30px_minmax(0,1fr)] gap-[10px] items-center py-[9px] pr-4 pl-[14px]`, `aria-current={selected || undefined}`. ToggleChip: `flex items-center gap-1.5 border px-2 py-[3px] pl-1` (no leading → `pl-2`).

- [ ] **Step 1: Failing tests:** RailItem `selected` → `toHaveAttribute("aria-current","true")`; click fires `onClick`. ToggleChip `pressed` → `aria-pressed="true"`; leading renders in `Leading`.
- [ ] **Step 2: Run** `rtk vitest run libs/design-system/src/components/RailItem libs/design-system/src/components/ToggleChip --project design-system`. Expected: FAIL.
- [ ] **Step 3: Implement** + stories (5-item rail with one selected; ALL + 2 agent chips).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ds): RailItem and ToggleChip`.

### Task C4: `DiffstatList` + `FileTreeList` [Sonnet]

**Files:** create `libs/design-system/src/components/DiffstatList/*`, `libs/design-system/src/components/FileTreeList/*`; export both.

**Interfaces — Produces:**
```ts
export interface DiffstatListFile { path: string; additions: number; deletions: number }
export enum DiffstatListTestId { Root = "diffstat-list-root", Row = "diffstat-list-row", Add = "diffstat-list-add", Del = "diffstat-list-del", Bar = "diffstat-list-bar" }
export interface DiffstatListProps {
  files: DiffstatListFile[];
  /** compact = in-banner (cols 1fr/44/44/80, no row borders); table = bordered panel (cols 1fr/50/50/90, 8px 12px rows, bottom hairlines). */
  density?: "compact" | "table";
  ref?: Ref<HTMLDivElement>;
}
// bar: track bg-line h-[6px]; add segment bg-ink, del segment bg-ink-3; widths = n / max(add+del over files) * 100% (inline style inside the DS is fine)
// numbers: "+N" right-aligned ink, "−N" right-aligned ink-3 (U+2212)

export interface FileTreeListEntry { path: string; kind: "file" | "dir"; size?: string; when?: string }
export enum FileTreeListTestId { Root = "file-tree-list-root", Row = "file-tree-list-row", Name = "file-tree-list-name" }
export interface FileTreeListProps {
  entries: FileTreeListEntry[]; // pre-ordered; depth = path segments - 1; indent 18px per depth
  ref?: Ref<HTMLDivElement>;
}
// row: grid cols 1fr/80/60, 8px 12px, bottom hairline, hover panel-2, mono 11px; name "▸ name/" (dir, ink) | "· name" (file, ink-2); size/when ink-3 right
```
Rows are keyed by `path`: `data-testid={`${DiffstatListTestId.Row}-${path}`}` (same for FileTreeList).

- [ ] **Step 1: Failing tests:** DiffstatList with `[{a.ts,10,0},{b.ts,5,5}]` → `Bar` for a.ts has add width `100%`, b.ts add `50%`/del `50%`; `−5` text uses U+2212. FileTreeList: `output/report.md` row name shows `report.md` with indent depth 1 (assert style `padding-left: 18px`); a dir row starts with `▸`.
- [ ] **Step 2: Run** `rtk vitest run libs/design-system/src/components/DiffstatList libs/design-system/src/components/FileTreeList --project design-system`. Expected: FAIL.
- [ ] **Step 3: Implement** + stories (both densities; a 7-entry tree).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ds): DiffstatList and FileTreeList`.

---

## Phase D — Web (`apps/web/features/runs`)

Target file map (one responsibility each):

```
features/runs/
  stagePhases.ts            ← buildPhaseNodes + PhaseNode, MOVED out of WorkflowStageTimeline.tsx (pure)
  runDetailModel.ts         ← RunMode, deriveRunMode, buildRunMetrics, buildStageRail, buildLiveFeed, messageDelivery (pure)
  useRunActions.ts          ← + pause, resume(run, { mode, note })
  queries/useTaskRunFilesQuery.ts
  mutations/usePauseTaskRunMutation.ts, useSendTaskRunMessageMutation.ts
  components/
    RunDetail.tsx           ← orchestrator: local UI state + region wiring (≤ 250 lines)
    RunDetailHeader.tsx     ← breadcrumb, title, meta line, actions slot, progress hairline, metrics
    RunDetailActions.tsx    ← mode-dependent buttons + ··· menu + confirm dialogs
    RunStageRail.tsx        ← stage RailItems + ROUTED/CHECKPOINTS/OPEN TASK FOLDER footer
    RunLiveFeed.tsx         ← divider / agent / you items + banners
    RunFeedBanners.tsx      ← RunApprovalBanner, RunQuestionBanner, RunParkedBanner
    RunInputView.tsx        ← task markdown + attachments
    RunOutputView.tsx       ← pr | markdown | folder output + pending notice
    RunComposer.tsx         ← TO chips + input + mode-dependent send
features/approvals/mutations/useAnswerApprovalMutation.ts
```
Deleted at the end of D8 (after `rg` confirms no other importers): `RunApprovalGate.tsx`, `RunParkedPanel.tsx`, `RunPrGatePanel.tsx`, `WorkflowStageTimeline.tsx`, `RunWorkflowSummary.tsx`, `RunLogStream.tsx`, and their tests, plus `RunDetailConfirm.test.tsx` and `RunDetailResume.test.tsx` (folded into the new tests). Keep `GoalDetailPanel` (rendered in LIVE for goal runs), `RunTranscript`/`transcript.ts` (the feed reuses `parseTranscript`/`groupTranscript`), and `RunStateBadge` if other screens use it.

### Task D1: Hooks, mutations, actions + i18n catalog [Sonnet]

**Files:**
- Create: `apps/web/features/runs/mutations/usePauseTaskRunMutation.ts`, `useSendTaskRunMessageMutation.ts`; `apps/web/features/runs/queries/useTaskRunFilesQuery.ts`; `apps/web/features/approvals/mutations/useAnswerApprovalMutation.ts`
- Modify: `mutations/index.ts`, `queries/index.ts`, `apps/web/features/approvals/mutations/index.ts`, `apps/web/features/runs/useRunActions.ts`
- Modify: `apps/web/i18n/messages/en.json`, `cs.json` (`runs.detail.*`)
- Test: `apps/web/features/runs/useRunActions.test.tsx` (create; `--project web`)

**Interfaces — Produces:**
```ts
usePauseTaskRunMutation()        // apiClient.taskRuns.pauseTaskRun.useMutation, onSuccess invalidates taskRunsRootKey
useSendTaskRunMessageMutation()  // apiClient.taskRuns.sendTaskRunMessage.useMutation, invalidates taskRunsRootKey
useTaskRunFilesQuery(runId: string, enabled: boolean) // queryKey getTaskRunFilesQueryKey(runId) = [...taskRunsRootKey, "files", runId]; select: selectApiResponseBody
useAnswerApprovalMutation()      // apiClient.approvals.answerApproval.useMutation, invalidates approvals + taskRunsRootKey
// useRunActions(onResumed, onRemoved) adds:
pause: (run: RunView) => void; pausing: boolean;
resume: (run: RunView, opts?: { mode?: "continue" | "fresh"; note?: string }) => void;
```
Follow the existing files exactly (`useStopTaskRunMutation.ts` for mutations, `useStageRunLogQuery.ts` for the query shape). `resume` drops the `isResumableRun` guard for `mode: "fresh"` on a `done` run (the API is the authority, B6), and calls `onResumed` only when the returned `runId` differs from `run.runId`.

i18n keys (add both catalogs; `{…}` are ICU params):

| key | en | cs |
|---|---|---|
| `runs.detail.backToRuns` | ← RUNS | ← BĚHY |
| `runs.detail.assignProject` | + ASSIGN PROJECT | + PŘIŘADIT PROJEKT |
| `runs.detail.workflow` | WORKFLOW · {name} | WORKFLOW · {name} |
| `runs.detail.action.pause` / `.pausing` / `.resume` / `.stop` | PAUSE / PAUSING… / RESUME / STOP | POZASTAVIT / POZASTAVUJI… / POKRAČOVAT / ZASTAVIT |
| `runs.detail.action.rerunFresh` / `.continueSession` / `.rerun` / `.continueTask` | RE-RUN FRESH / CONTINUE SESSION / RE-RUN / CONTINUE TASK → | SPUSTIT OD NULY / POKRAČOVAT V RELACI / SPUSTIT ZNOVU / NAVÁZAT ÚKOLEM → |
| `runs.detail.more.openTask` / `.openAgent` / `.openFolder` / `.copyId` / `.delete` | OPEN TASK → / OPEN AGENT → / OPEN TASK FOLDER / COPY RUN ID / DELETE RUN | OTEVŘÍT ÚKOL → / OTEVŘÍT AGENTA → / OTEVŘÍT SLOŽKU / ZKOPÍROVAT ID / SMAZAT BĚH |
| `runs.detail.metric.progress` / `.elapsed` / `.stage` / `.retries` / `.cost` / `.confidence` | PROGRESS / ELAPSED / STAGE / RETRIES / COST / CONFIDENCE | PRŮBĚH / UPLYNULO / FÁZE / POKUSY / CENA / JISTOTA |
| `runs.detail.mode.running` / `.pausing` / `.paused` / `.approval` / `.question` / `.parked` / `.limit` / `.stopped` / `.error` / `.done` / `.waiting` | RUNNING / PAUSING · AFTER THIS STAGE / PAUSED / WAITING ON APPROVAL / NEEDS YOUR ANSWER / PARKED · RETRIES EXHAUSTED / PAUSED · USAGE LIMIT / STOPPED / FAILED / DONE / WAITING | BĚŽÍ / POZASTAVUJI · PO TÉTO FÁZI / POZASTAVENO / ČEKÁ NA SCHVÁLENÍ / ČEKÁ NA ODPOVĚĎ / ZAPARKOVÁNO · POKUSY VYČERPÁNY / POZASTAVENO · LIMIT / ZASTAVENO / SELHALO / HOTOVO / ČEKÁ |
| `runs.detail.stage.done` / `.running` / `.waiting` / `.parked` / `.queued` / `.stopped` | DONE / RUNNING / WAITING / PARKED / QUEUED / STOPPED | HOTOVO / BĚŽÍ / ČEKÁ / ZAPARKOVÁNO / VE FRONTĚ / ZASTAVENO |
| `runs.detail.rail.title` / `.routed` / `.switchboard` / `.checkpoints` / `.openFolder` | STAGES · {n} / ROUTED / SWITCHBOARD / CHECKPOINTS / OPEN TASK FOLDER → | FÁZE · {n} / SMĚROVÁNO / SWITCHBOARD / CHECKPOINTY / OTEVŘÍT SLOŽKU → |
| `runs.detail.view.live` / `.input` / `.output` | LIVE / INPUT / OUTPUT | ŽIVĚ / VSTUP / VÝSTUP |
| `runs.detail.view.metaLive` / `.metaInput` | {state} · {n} EVENTS / {task} · {n} ATTACHMENTS | {state} · {n} UDÁLOSTÍ / {task} · {n} PŘÍLOH |
| `runs.detail.banner.approvalHead` / `.approvalMeta` / `.hold` / `.holding` / `.revise` / `.reject` / `.wouldPublish` | NEEDS YOU · SEVERITY {sev} · {risk} / REQUESTED {at} · VIA {via} · REVIEWED BEFORE IT TAKES EFFECT / HOLD TO APPROVE / HOLD… / REVISE / REJECT / WOULD PUBLISH · {files} FILES · +{add} −{del} | POTŘEBUJE TĚ · ZÁVAŽNOST {sev} · {risk} / VYŽÁDÁNO {at} · PŘES {via} · PŘED PROVEDENÍM ZKONTROLOVÁNO / PODRŽ PRO SCHVÁLENÍ / DRŽÍM… / PŘEPRACOVAT / ZAMÍTNOUT / ZVEŘEJNÍ · {files} SOUBORŮ · +{add} −{del} |
| `runs.detail.banner.questionHead` / `.questionHint` | NEEDS YOU · QUESTION FROM {agent} / ANSWER BELOW · THE RUN RESUMES WHEN YOU REPLY | POTŘEBUJE TĚ · OTÁZKA OD {agent} / ODPOVĚZ NÍŽE · BĚH POKRAČUJE PO ODPOVĚDI |
| `runs.detail.banner.parkedHead` / `.parkedBody` / `.parkedHint` | PARKED · STAGE {n} {name} · {att} ATTEMPTS / Retries are exhausted. The last error was: {error}. / ADD A NOTE BELOW TO RESUME, OR RE-RUN FROM THE MENU | ZAPARKOVÁNO · FÁZE {n} {name} · {att} POKUSŮ / Pokusy jsou vyčerpány. Poslední chyba: {error}. / PŘIDEJ POZNÁMKU NÍŽE A POKRAČUJ, NEBO SPUSŤ ZNOVU |
| `runs.detail.feed.youTo` / `.queued` / `.delivered` / `.notDelivered` | YOU → {to} · {t} / QUEUED / DELIVERED → {stage} / NOT DELIVERED | TY → {to} · {t} / VE FRONTĚ / DORUČENO → {stage} / NEDORUČENO |
| `runs.detail.output.prTitle` / `.prMeta` / `.folderMeta` / `.openPr` / `.openOutput` / `.openFolder` | Pull request #{n} / {state} · {files} FILES · +{add} −{del} / TASK FOLDER · {n} FILES / OPEN PR ↗ / OPEN OUTPUT ↗ / OPEN FOLDER ↗ | Pull request #{n} / {state} · {files} SOUBORŮ · +{add} −{del} / SLOŽKA ÚKOLU · {n} SOUBORŮ / OTEVŘÍT PR ↗ / OTEVŘÍT VÝSTUP ↗ / OTEVŘÍT SLOŽKU ↗ |
| `runs.detail.output.pending.running` / `.approval` / `.question` / `.paused` / `.parked` / `.stopped` | IN PROGRESS · PARTIAL OUTPUT FROM LAST CHECKPOINT / NOT PUBLISHED · WAITING ON YOUR APPROVAL / PAUSED · WAITING ON YOUR ANSWER / PAUSED · PARTIAL OUTPUT KEPT / PARTIAL · LAST GOOD CHECKPOINT / STOPPED · PARTIAL OUTPUT KEPT | PROBÍHÁ · ČÁSTEČNÝ VÝSTUP Z POSLEDNÍHO CHECKPOINTU / NEZVEŘEJNĚNO · ČEKÁ NA SCHVÁLENÍ / POZASTAVENO · ČEKÁ NA ODPOVĚĎ / POZASTAVENO · ČÁSTEČNÝ VÝSTUP ZACHOVÁN / ČÁSTEČNÉ · POSLEDNÍ DOBRÝ CHECKPOINT / ZASTAVENO · ČÁSTEČNÝ VÝSTUP ZACHOVÁN |
| `runs.detail.composer.to` / `.all` / `.inputLabel` | TO / ALL · {n} / Message | KOMU / VŠICHNI · {n} / Zpráva |
| `runs.detail.composer.ph.running` / `.approval` / `.question` / `.parked` / `.stopped` / `.done` / `.revise` / `.agentRunning` | Message the crew. It lands in their context on the next step. / Add a note to the gate request, or use REVISE to send it back. / Answer {agent}… / Resume with a note, e.g. what to try differently / Add a note and start again / Ask a follow-up. Starts a new task with this output as context. / What should change before this is published? / Agent runs take notes when you continue them. | Napiš posádce. Dostane to do kontextu v dalším kroku. / Přidej poznámku k žádosti, nebo ji PŘEPRACOVAT vrať. / Odpověz {agent}… / Pokračuj s poznámkou, třeba co zkusit jinak / Přidej poznámku a spusť znovu / Zeptej se dál. Založí nový úkol s tímto výstupem jako kontextem. / Co se má změnit před zveřejněním? / Agentní běh přijme poznámku, až v něm budeš pokračovat. |
| `runs.detail.composer.send.send` / `.answer` / `.resume` / `.rerun` / `.newTask` / `.sendBack` | SEND ↵ / ANSWER ↵ / RESUME ↵ / RE-RUN ↵ / NEW TASK ↵ / SEND BACK ↵ | ODESLAT ↵ / ODPOVĚDĚT ↵ / POKRAČOVAT ↵ / SPUSTIT ↵ / NOVÝ ÚKOL ↵ / VRÁTIT ↵ |
| `runs.detail.composer.hint.running` / `.paused` / `.approval` / `.question` / `.parked` / `.stopped` / `.done` / `.revise` | DELIVERED BETWEEN STEPS / RUN IS PAUSED · MESSAGES QUEUE / RUN IS HELD AT THE GATE / RUN RESUMES ON REPLY / NOTE IS ADDED TO CONTEXT / RUN IS STOPPED / RUN FINISHED / REVISION · THE CREW REWORKS BEFORE ASKING AGAIN | DORUČENO MEZI KROKY / BĚH JE POZASTAVEN · ZPRÁVY ČEKAJÍ / BĚH ČEKÁ U BRÁNY / BĚH POKRAČUJE PO ODPOVĚDI / POZNÁMKA PŮJDE DO KONTEXTU / BĚH JE ZASTAVEN / BĚH SKONČIL / PŘEPRACOVÁNÍ · POSÁDKA TO PŘEDĚLÁ A ZEPTÁ SE ZNOVU |
| `runs.detail.confirm.stopTitle` / `.stopBody` / `.rejectTitle` / `.rejectBody` / `.deleteTitle` / `.deleteBody` | STOP {id} / The current stage ({stage}) is cancelled. Partial output and checkpoints are kept, and you can re-run later. / REJECT REQUEST / The crew will not {action}. The run stops and keeps its partial output. / DELETE {id} / The run, its logs and checkpoints are removed. The task and its written-back output stay. | ZASTAVIT {id} / Aktuální fáze ({stage}) se zruší. Částečný výstup a checkpointy zůstanou a běh můžeš spustit znovu. / ZAMÍTNOUT ŽÁDOST / Posádka neprovede: {action}. Běh se zastaví a ponechá částečný výstup. / SMAZAT {id} / Běh, jeho logy a checkpointy se odstraní. Úkol a jeho zapsaný výstup zůstanou. |
| `runs.detail.notFound.title` / `.body` / `.back` | RUN NOT FOUND / There is no run with ID {id}. It may have been deleted. / ← ALL RUNS | BĚH NENALEZEN / Běh s ID {id} neexistuje. Možná byl smazán. / ← VŠECHNY BĚHY |

- [ ] **Step 1: Failing test** (`useRunActions.test.tsx`, wrap with the test QueryClient/apiClient provider the other `features/runs` hook tests use): `resume(doneRun, { mode: "fresh" })` calls the resume endpoint with body `{ mode: "fresh" }`. `pause(workflowRun)` calls `pauseTaskRun`. `resume` with the same returned runId does not call `onResumed`.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/useRunActions.test.tsx --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** the hooks + catalog entries.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): run pause/message/answer/files hooks and run-detail copy`.

### Task D2: Pure run-detail model [Opus]

**Files:**
- Create: `apps/web/features/runs/stagePhases.ts` (move `PhaseNode` + `buildPhaseNodes` verbatim from `WorkflowStageTimeline.tsx:53-135` and export them; make `WorkflowStageTimeline` import from here until D8 deletes it)
- Create: `apps/web/features/runs/runDetailModel.ts`
- Test: `apps/web/features/runs/runDetailModel.test.ts` (`--project web`), and move the existing `buildPhaseNodes` coverage (if any is in `WorkflowStageTimeline.test.tsx`) to `stagePhases.test.ts`

**Interfaces — Produces:**
```ts
export type RunMode = "waiting" | "running" | "pausing" | "paused" | "approval" | "question"
  | "parked" | "limit" | "stopped" | "error" | "done";
export function deriveRunMode(run: RunView, approval: Pick<Approval, "action"> | undefined): RunMode;
// scheduled|queued|pending → waiting; held → approval when approval else waiting;
// running → pauseRequested ? pausing : running;
// awaiting-approval → approval?.action === OPERATOR_QUESTION_ACTION ? question : approval;
// paused → paused; parked → parked; paused-limit → limit; interrupted → stopped; error → error; done → done.

export interface StageRailRow {
  phaseId: string; n: string /* "01" */; name: string /* employeeName ?? phaseId */;
  state: StateTone /* DS canonical: done|working|blocked|error|idle */;
  stateKey: "done" | "running" | "waiting" | "parked" | "queued" | "stopped";
  meta: string /* "mm:ss" | "mm:ss · ⇄02" | "—" */; current: boolean;
}
export function buildStageRail(run: RunView, mode: RunMode, definedPhaseIds: string[] | undefined, now: number): StageRailRow[];
// workflow: buildPhaseNodes(...) → rows; meta = finishedAt-startedAt (terminal) or now-currentStageStartedAt (live), "⇄NN" when priorAttempts>0.
// agent: one row { n:"01", name: run.processor?.name ?? run.owner, … } timed from startedAt.
// goal: [].

export interface RunMetric { key: "progress" | "elapsed" | "stage" | "retries" | "cost" | "confidence"; value: string }
export function buildRunMetrics(run: RunView, rail: StageRailRow[], maxRetries: number | undefined, now: number): RunMetric[];
// progress: done→100%; workflow → round(done rows / rail.length * 100)% (cap 97 while open); agent → (run.pct ?? 0)%.
// elapsed: formatDuration((taskOutcomeFinishedAt ?? now) - startedAt); stage: "NN/NN"; retries: "NN/NN" or "—";
// cost: formatCostUsd(costUsd) or "—"; confidence: classification ? `${round(conf*100)}%` : "—".

export type FeedItem =
  | { kind: "divider"; phaseId: string; label: string /* "02 REVIEWER · DONE · 01:42" */; state: StateTone }
  | { kind: "agent"; phaseId: string; who: string; markdown: string; tools: LogStreamLine[]; live: boolean }
  | { kind: "you"; id: string; to: string; at: string; text: string; delivery: "queued" | "delivered" | "undelivered"; deliveredPhaseId?: string };
export function buildLiveFeed(args: {
  rail: StageRailRow[]; selectedPhaseId: string | null; transcript: string /* log text of current-or-selected stage */;
  messages: OperatorMessage[]; terminal: boolean;
}): FeedItem[];
// order: for each reached row (stateKey !== "queued"): divider; then if row is selected (default = current) an agent item from
// groupTranscript(parseTranscript(transcript)): markdown = text segments joined "\n\n", tools = tool/result groups as
// LogStreamLine { id, ts: two-digit ordinal (the log has no timestamps), text }; then the messages delivered to that phase.
// Undelivered messages go last: delivery = terminal ? "undelivered" : "queued".
```

- [ ] **Step 1: Failing tests** (table-driven): every `TaskRunStatus` → expected `RunMode` (incl. `awaiting-approval` + `operator.question` → `question`, `running` + `pauseRequested` → `pausing`). `buildStageRail` for a 3-phase run with phase 1 done (01:42), phase 2 live (now - currentStageStartedAt = 65 s → `"01:05"`, one prior attempt → `"01:05 · ⇄01"`), phase 3 queued (`"—"`). `buildRunMetrics` progress for that run = `33%`, and the done run = `100%`. `buildLiveFeed`: a delivered message lands right after phase 2's agent item; an undelivered one is last with `queued`, and with `undelivered` when `terminal: true`; queued phases produce no divider.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/runDetailModel.test.ts apps/web/features/runs/stagePhases.test.ts --project web`. Expected: FAIL.
- [ ] **Step 3: Implement.** Map `StageRunStatus` → `StateTone`: done→done, running→working, awaiting-approval→blocked, error→error, interrupted/paused-limit→idle.
- [ ] **Step 4: Run.** Expected: PASS. Also `rtk vitest run apps/web/features/runs/components/WorkflowStageTimeline.test.tsx --project web-components` (still passes after the move).
- [ ] **Step 5: Commit** `feat(web): pure run-detail model (mode, rail, metrics, live feed)`.

### Task D3: Header + actions [Sonnet]

**Files:**
- Create: `apps/web/features/runs/components/RunDetailHeader.tsx`, `RunDetailActions.tsx`
- Test: `RunDetailHeader.test.tsx`, `RunDetailActions.test.tsx` (`--project web-components`)

**Interfaces:**
- Consumes: `RunMode`, `RunMetric` (D2); `useRunActions` (D1); DS `MetricStrip columns={6}`, `StatePill`, `AgentGlyph`, `Progress`, `Button`, `MenuButton variant="bordered"`.
- Produces:
```ts
export enum RunDetailHeaderTestId { Root = "run-detail-header", Back = "run-detail-back", TaskLink = "run-detail-task-link", Title = "run-detail-title", State = "run-detail-state", AgentLink = "run-detail-agent-link", ProjectLink = "run-detail-project-link", AssignProject = "run-detail-assign-project", Progress = "run-detail-progress", Metrics = "run-detail-metrics" }
export interface RunDetailHeaderProps {
  run: RunView; mode: RunMode; metrics: RunMetric[]; progressPct: number;
  agent?: { id: string; name: string; role?: string; state: StateTone };
  actions: ReactNode; // RunDetailActions
}
export enum RunDetailActionsTestId { Root = "run-detail-actions", Action = "run-detail-action" /* suffixed with the action id */, More = "run-detail-more" }
export interface RunDetailActionsProps {
  run: RunView; mode: RunMode; currentStageName?: string;
  onPause: () => void; onResume: (opts?: { mode?: "continue" | "fresh"; note?: string }) => void;
  onStop: () => void; onDelete: () => void; onContinueTask: () => void; onOpenFolder?: () => void;
  pending: boolean;
}
```
Header structure (design lines 26-50): row `Stack direction="row" gap="300"` → left column (breadcrumb: `Pressable` "← RUNS" → `/activity/runs`, `/`, run id, `·`, `t(kind.*)` upper, `·`, `Pressable` `{taskId} →` → `/work/tasks/{taskId}`; `Typography type="h1"` title via `runTitle`; meta line: `StatePill state={…} label={t(mode.*)}`, agent `Pressable` → `/workforce/positions/{id}` with `AgentGlyph size 22` + `NAME · ROLE`, dept `CODE · NAME` via `useDepartmentLookup`, project link or "+ ASSIGN PROJECT" (`MenuButton` whose items are `useProjectsQuery()` projects, firing `useAssignRunProjectMutation`), `WORKFLOW · {owner}` for workflow runs) and right `actions`. Then `Progress height` 2px (tone `run` while running, ink otherwise), then `MetricStrip columns={6}`.

Actions table (design lines 251-260, honest semantics; `id`s used in test ids):

| mode | buttons (primary last) | ··· menu extra |
|---|---|---|
| running | `pause` (workflow only), `stop` (StateDot error) | — |
| pausing | `pausing` (disabled), `resume` (cancel the pause) , `stop` | — |
| paused | `resume` (primary), `stop` | — |
| approval | `pause` (workflow only), `stop` | — |
| question | `stop` | — |
| parked / stopped / error | `rerunFresh`, `continueSession` (primary; agent: only when `run.sessionId`, else hidden) | `delete` (stopped/error) |
| done | `rerun` (fresh), `continueTask` (primary) | `delete` |
| waiting / limit | — | `delete` (labelled cancel for scheduled, as today via `isCancellableRun`) |

The ··· menu always has `openTask` (when `taskId`), `openAgent` (when agent), `openFolder` (workflow), `copyId` (`navigator.clipboard.writeText`). STOP, DELETE (and REJECT in D5) confirm through `ConfirmDeleteDialog` with the `runs.detail.confirm.*` copy.

- [ ] **Step 1: Failing tests:** for each mode row, the expected action test ids exist and no others. Clicking `stop` opens the dialog and confirming calls `onStop`. `continueSession` is absent for an agent run without a `sessionId`. The header renders 6 metric items and the back link has `href`/navigates to `/activity/runs` (mock `next/navigation` the way `RunDetail.test.tsx` does).
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/components/RunDetailHeader.test.tsx apps/web/features/runs/components/RunDetailActions.test.tsx --project web-components`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): run detail header and state-dependent actions`.

### Task D4: Stage rail [Sonnet]

**Files:** Create `apps/web/features/runs/components/RunStageRail.tsx`; test `RunStageRail.test.tsx` (`--project web-components`).

**Interfaces:**
```ts
export enum RunStageRailTestId { Root = "run-stage-rail", Stage = "run-stage-rail-stage" /* -phaseId */, Routed = "run-stage-rail-routed", Checkpoint = "run-stage-rail-checkpoint", OpenFolder = "run-stage-rail-open-folder" }
export interface RunStageRailProps {
  run: RunView; rows: StageRailRow[]; selectedPhaseId: string | null;
  onSelect: (phaseId: string) => void; onOpenFolder?: () => void;
}
```
Structure (design 53-67): mono label `STAGES · NN · {owner}`; `RailItem` per row (`leading` = `AgentGlyph seed={name} state={state} size 30`, `title` = `{n} · {name}`, `meta` = `StateDot` + `{t(stage.*)} · {meta}`, `selected`); footer pinned bottom (`Container` with top hairline via `Divider`): ROUTED → `SWITCHBOARD → {dept} → {unit} · {pct}%` (logic moved from `ClassificationTracePanel` in the old RunDetail), CHECKPOINTS rows `{phaseId}` ↔ `{sha.slice(0,7)}`, and an `OPEN TASK FOLDER →` `Pressable` (workflow only) → `useOpenTaskRunFolderMutation`.

- [ ] **Step 1: Failing tests:** 3 rows render; the selected row has `aria-current`; clicking row 2 calls `onSelect("phase2")`; no classification → no Routed; checkpoints render; agent kind → no OpenFolder.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/components/RunStageRail.test.tsx --project web-components`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): run stage rail`.

### Task D5: Live feed + banners [Opus]

**Files:** Create `apps/web/features/runs/components/RunLiveFeed.tsx`, `RunFeedBanners.tsx`; tests `RunLiveFeed.test.tsx`, `RunFeedBanners.test.tsx` (`--project web-components`).

**Interfaces:**
```ts
export enum RunFeedBannersTestId { Approval = "run-banner-approval", Question = "run-banner-question", Parked = "run-banner-parked", Hold = "run-banner-hold", Revise = "run-banner-revise", Reject = "run-banner-reject", Diff = "run-banner-diff" }
export interface RunApprovalBannerProps { approval: DashboardApproval; diffstat?: Diffstat; reviseOpen: boolean; onToggleRevise: () => void; onApproved?: () => void }
export interface RunQuestionBannerProps { question: string; agentName: string }
export interface RunParkedBannerProps { run: RunView; stage?: StageRailRow }
export enum RunLiveFeedTestId { Root = "run-live-feed", Divider = "run-feed-divider", Agent = "run-feed-agent", You = "run-feed-you", Delivery = "run-feed-delivery" }
export interface RunLiveFeedProps { run: RunView; mode: RunMode; approval?: DashboardApproval; items: FeedItem[]; reviseOpen: boolean; onToggleRevise: () => void }
```
Banners (design 78-95):
- Approval: `Card corners borderTone="ink"`, a two-column row (`Stack direction="row"` + right `Container width="280px"`). Left: `StateDot blocked` + approvalHead (sev = `approval.risk` upper, risk = `riskType` label), `action` (16px), `consequence`, approvalMeta. Right: `HoldButton tone="ink" block` → `useApproveMutation`; REVISE (`Button secondary`, only when `approval.action === "stage-approval"`, toggles `reviseOpen`); REJECT (`Button secondary` + error `StateDot`) → `ConfirmDeleteDialog` (rejectTitle/rejectBody) → `useRejectMutation`. When `diffstat` is present: a bottom section (`Divider` + bg) with `wouldPublish` + `DiffstatList density="compact"`.
- Question: `Card borderTone="ink"`, questionHead (agent upper), the question (15px, plain text), questionHint. The question text comes from `parseApprovalDetail(approval).summary`; render it as text, never markdown/HTML (agent content is data).
- Parked: errDot + parkedHead (`n`, name, `${attempts}/${attempts}`), parkedBody (error = first line of `run.parked.failureFile` tail if exposed, else omit the sentence), parkedHint.
- `limit` mode: keep the old `LimitPausedPanel` (move it into `RunFeedBanners.tsx`).

Feed: renders `items` (D2) in order. Divider → `Stack direction="row"`: `Divider` (grow) + `StateDot` + mono label + `Divider` (grow). Agent → glyph 40 + `who · ` + `Markdown escapeHtml` + (tools.length ? `Panel padding` + `LogStream lines={tools} paused={!item.live}` : nothing). You → `ChatBubble author="you"` under a `YOU → {to} · {t}` label, with a delivery caption (`queued`/`delivered → NN NAME`/`notDelivered`). Goal runs render `GoalDetailPanel` instead of items.

- [ ] **Step 1: Failing tests:** an approval with `action: "stage-approval"` shows Revise, `git.push` does not; holding approve fires the approve mutation (use the HoldButton's test pattern: fake timers + pointer down); reject → confirm → reject mutation with the approval id; a diffstat renders N `DiffstatList` rows; a question renders a summary containing `<b>` literally (no HTML injection); feed items render in order by test id; `delivery: "undelivered"` shows the notDelivered copy.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/components/RunLiveFeed.test.tsx apps/web/features/runs/components/RunFeedBanners.test.tsx --project web-components`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): run live feed with approval, question and parked banners`.

### Task D6: INPUT and OUTPUT views [Sonnet]

**Files:** Create `apps/web/features/runs/components/RunInputView.tsx`, `RunOutputView.tsx`; tests `RunInputView.test.tsx`, `RunOutputView.test.tsx` (`--project web-components`).

**Interfaces:**
```ts
export enum RunInputViewTestId { Root = "run-input-view", Attachment = "run-input-attachment" }
export interface RunInputViewProps { run: RunView }
export enum RunOutputViewTestId { Root = "run-output-view", Title = "run-output-title", Pending = "run-output-pending", Open = "run-output-open", ContinueTask = "run-output-continue" }
export type RunOutputKind = "pr" | "markdown" | "folder";
export function runOutputKind(run: RunView): RunOutputKind; // prOutput || pending PR gate diffstat → pr; outputArtifactName/agent file output → markdown; else folder
export interface RunOutputViewProps { run: RunView; mode: RunMode; onOpenFolder?: () => void; onContinueTask: () => void }
```
- INPUT: `Markdown escapeHtml source={run.taskText}` (max-width 760 via `Container maxWidth="760px"`) + an ATTACHMENTS section using the existing `FilePreview` + `attachmentOpenHref` (moved from the old RunDetail).
- OUTPUT header row: title (pr → `prTitle` with `n` parsed from `prOutput.url` `/pull/(\d+)`; markdown → artifact name; folder → `{taskId ?? runId}/`), meta, actions (`OPEN PR ↗` → `prOutput.url`; `OPEN OUTPUT ↗` → `runOutputHref`; `OPEN FOLDER ↗` → `onOpenFolder`; plus `CONTINUE TASK →` when done). Pending notice (dashed `Panel`, `output.pending.{mode}`) when mode ≠ done. Body: pr → draft text (the `pr-draft.md` artifact via `useRunArtifactQuery`, when present) + `DiffstatList density="table" files={run.diffstat.files}`; markdown → `Panel` + `Markdown escapeHtml` (the existing `useRunArtifactQuery(run.runId, run.outputArtifactName)` or `taskOutcomeSummary`); folder → `FileTreeList` from `useTaskRunFilesQuery(runId, view === output && kind === workflow)`. Entries are mapped `{ path, kind, size: kind==="file" ? formatBytes : "", when: "" }`; reuse an existing bytes formatter if `apps/web/utils` has one (rg `formatBytes|formatSize`), else a 3-line local helper.
- The "continue task" context builder (`CONTINUE_CONTEXT_MAX` logic) moves here from the old `RunOutputPanel`, unchanged.

- [ ] **Step 1: Failing tests:** `runOutputKind` table (prOutput → pr; outputArtifactName → markdown; none → folder). A done PR run renders the title "Pull request #42" for url `…/pull/42` and N diff rows. A running run shows Pending with `output.pending.running`. A folder run renders FileTreeList rows from a mocked files query. INPUT renders attachments with hrefs.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/components/RunInputView.test.tsx apps/web/features/runs/components/RunOutputView.test.tsx --project web-components`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): run input and output views`.

### Task D7: Composer [Opus]

**Files:** Create `apps/web/features/runs/components/RunComposer.tsx`; test `RunComposer.test.tsx` (`--project web-components`).

**Interfaces:**
```ts
export enum RunComposerTestId { Root = "run-composer", Recipient = "run-composer-recipient" /* -key */, Hint = "run-composer-hint", Input = "run-composer-input", Send = "run-composer-send" }
export interface RunComposerProps {
  run: RunView; mode: RunMode; approval?: DashboardApproval;
  crew: { key: string /* "all" | phaseId */; name: string; seed?: string; state?: StateTone }[];
  reviseOpen: boolean; onRevised: () => void; // closes revise mode after send
  onSent: () => void;                          // parent switches view to LIVE
}
```
Send semantics (one table, exact):

| mode (reviseOpen) | placeholder / send / hint keys | on send |
|---|---|---|
| approval + reviseOpen | ph.revise / sendBack / hint.revise | `useReviseMutation({ id, note })` |
| running, pausing, paused, approval (workflow) | ph.running / send / hint.running (paused → hint.paused, approval → hint.approval) | `useSendTaskRunMessageMutation({ text, to })` |
| running, pausing, approval (agent) | ph.agentRunning / send (disabled) / hint.running | — (input disabled) |
| question | ph.question {agent} / answer / hint.question | `useAnswerApprovalMutation({ id: approval.id, answer })` |
| parked | ph.parked / resume / hint.parked | `resume(run, { mode: "continue", note })` |
| stopped, error | ph.stopped / rerun / hint.stopped | `resume(run, { mode: "continue", note })` |
| done | ph.done / newTask / hint.done | `useNewTask().open(undefined, undefined, context)` (same context as D6's continue) |
| waiting, limit | input disabled, no send | — |

TO chips only in the message rows (workflow): `ToggleChip` "ALL · NN" + one per crew phase (`AgentGlyph size 18`), single-select, default `all`. Enter sends; Shift+Enter does nothing special (single-line input). Send and Enter are no-ops while trimmed text is empty or any mutation `isPending` (Review Focus 6). Clear the input only on success.

- [ ] **Step 1: Failing tests:** one per table row asserting which mutation fires with which body (mock the hooks' `mutate`). Pressing Enter twice quickly while pending fires `mutate` once. Agent running → input disabled. The selected chip changes the `to` sent.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/components/RunComposer.test.tsx --project web-components`. Expected: FAIL.
- [ ] **Step 3: Implement** (`TextInputField` with `aria-label={t("composer.inputLabel")}`, `Button intent="primary"`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): mode-aware run composer`.

### Task D8: Assemble RunDetail, not-found, retire the old panels [Opus]

**Files:**
- Rewrite: `apps/web/features/runs/components/RunDetail.tsx`
- Modify: `apps/web/features/runs/screens/ActivityRunDetailScreen.tsx` (404 → `EmptyState`), `apps/web/features/tasks/screens/TaskDetailScreen.tsx` (new props)
- Rewrite tests: `RunDetail.test.tsx`, `ActivityRunDetailScreen.test.tsx`
- Delete (after `rg -n "<Name>" apps/web` shows no other importer): `RunApprovalGate*`, `RunParkedPanel*`, `RunPrGatePanel*`, `WorkflowStageTimeline*`, `RunWorkflowSummary*`, `RunLogStream*`, `RunDetailConfirm.test.tsx`, `RunDetailResume.test.tsx`. Keep any file that is still imported elsewhere and say so in the commit message.

**Interfaces:**
```ts
export enum RunDetailTestId { Root = "run-detail", ViewSwitch = "run-detail-view-switch", ViewMeta = "run-detail-view-meta" }
export interface RunDetailProps { run: RunView } // glyph/avatar/now/onStop/... are gone: RunDetail owns useRunActions + its own clock
```
Orchestration (state: `view: "live"|"input"|"output"`, `selectedPhaseId`, `reviseOpen`):
- `approval = approvalForRun(useApprovalsQuery().data ?? [], run)`; `mode = deriveRunMode(run, approval)`.
- Workflow definition via `useWorkflowsQuery()` matched on `run.owner` (as `WorkflowStageTimeline` did) → `definedPhaseIds` and the current phase's `loop.maxRetries`.
- Clock: `const [now, setNow] = useState(Date.now)` with a 1 s `setInterval` only while `mode` is `running`/`pausing` (cleared otherwise). A ticking clock is presentation, not state polling.
- Transcript: current/selected stage → `useStageRunLogStream(run.runId, phaseId)` when it is the live phase, else `useStageRunLogQuery`; agent → `useRunLogStream(run.runId)`.
- Layout: `RunDetailHeader` (actions = `RunDetailActions`), then `RailSplit` with `rail={<RunStageRail …/>}`, `toolbar={SegmentedControl items live/input/output (+ dot state for live) + view meta}`, children by view, `footer={<RunComposer …/>}`. `bodyRef` auto-scrolls to the bottom when the feed length changes and the view is live.
- Navigation: `RunDetail` calls `useRunActions` itself, with `router.push` for `onResumed` (→ `/activity/runs/{id}`) and `onRemoved` (→ `/activity/runs`), so `ActivityRunDetailScreen` and `TaskDetailScreen` behave identically.
- Not found: in `ActivityRunDetailScreen`, `isError && error?.status === 404` → `EmptyState title={notFound.title} body={notFound.body {id}} action={<Button onClick={() => router.push("/activity/runs")}>{notFound.back}</Button>}`. Other errors keep `QueryError`.

- [ ] **Step 1: Rewrite tests** in `RunDetail.test.tsx` (keep the file's existing provider/mocks setup): (a) a running workflow run renders header, rail, LIVE feed, composer by test id; (b) switching to OUTPUT renders `RunOutputView`; (c) an `awaiting-approval` run with a matching approval renders the approval banner; with `operator.question` it renders the question banner and the composer answer send label; (d) a `paused` run shows the RESUME action; (e) a goal run renders `GoalDetailPanel`. `ActivityRunDetailScreen.test.tsx`: a 404 renders the not-found EmptyState.
- [ ] **Step 2: Run** `rtk vitest run apps/web/features/runs/components/RunDetail.test.tsx apps/web/features/runs/screens/ActivityRunDetailScreen.test.tsx --project web-components`. Expected: FAIL.
- [ ] **Step 3: Implement**, update `TaskDetailScreen` to `<RunDetail run={selectedRun} />` (drop its `useRunActions` call if it becomes unused), delete the retired files.
- [ ] **Step 4: Run** the two files, plus `rtk vitest run apps/web/features/runs apps/web/features/tasks --project web-components` and `--project web`. Expected: PASS. Then `pnpm check:types` and `pnpm check:cycles` once (larger handoff boundary). Expected: clean.
- [ ] **Step 5: Commit** `feat(web): run detail redesign — rail, live feed, composer; retire old panels`.

---

## Phase E — Verification

### Task E1: design-match the main regions + final checks [Sonnet]

Read `.claude/skills/design-match/SKILL.md` first (5-round ceiling, two skeleton failures park the run, one `--slug` per scene).

- [ ] **Step 1:** `pnpm api:dev` and `pnpm web:dev` running. Pick a real workflow run: `ls .zibby/data/workflows/runs` and choose a `*/run.json` with ≥ 3 `stageRuns`. Its `workflowRunId` is `RUN_ID`. For the approval region, use a run parked on approval if one exists. Otherwise start the `delivery` workflow on a scratch project and let it reach a gate.
- [ ] **Step 2: Measure** (pick `--region` from the printed inventory; the descriptions steer ranking):
  ```bash
  node .claude/skills/design-match/scripts/cli.mjs measure "design/ZibbyCorp/Run Detail.dc.html" "run detail header metrics" --slug rd-header
  node .claude/skills/design-match/scripts/cli.mjs measure "design/ZibbyCorp/Run Detail.dc.html" "stages rail routed checkpoints" --slug rd-rail
  node .claude/skills/design-match/scripts/cli.mjs measure "design/ZibbyCorp/Run Detail.dc.html" "needs you severity hold to approve" --slug rd-approval
  node .claude/skills/design-match/scripts/cli.mjs measure "design/ZibbyCorp/Run Detail.dc.html" "composer to message the crew" --slug rd-composer
  ```
- [ ] **Step 3: Compare** each against the route (dynamic text masked):
  ```bash
  node .claude/skills/design-match/scripts/cli.mjs compare --slug rd-header   --route /activity/runs/$RUN_ID --selector '[data-testid="run-detail-header"]'   --mask '[data-testid="run-detail-metrics"]'
  node .claude/skills/design-match/scripts/cli.mjs compare --slug rd-rail     --route /activity/runs/$RUN_ID --selector '[data-testid="run-stage-rail"]'
  node .claude/skills/design-match/scripts/cli.mjs compare --slug rd-approval --route /activity/runs/$APPROVAL_RUN_ID --selector '[data-testid="run-banner-approval"]'
  node .claude/skills/design-match/scripts/cli.mjs compare --slug rd-composer --route /activity/runs/$RUN_ID --selector '[data-testid="run-composer"]'
  ```
  Loop per the skill: a skeleton failure means fix the structure in the owning D-task file. Values mean map them onto a token (add a semantic token only if no existing one matches). Two skeleton failures on one slug → stop and report with the evidence; do not tune. Accepted deviations: the ChatBubble 13px font, and the tool-log ordinals instead of clock times (the log has no timestamps).
- [ ] **Step 4: Final checks** (handoff tier): `pnpm check:lint`, `pnpm check:types`, `rtk vitest run --project api`, `--project contracts`, `--project design-system`, `--project web`, `--project web-components`. Remember the full suite is nondeterministic under parallel e2e. Rerun a lone red e2e spec before treating it as real.
- [ ] **Step 5:** `graphify update .`. Commit any token/structure fixes from the loop: `fix(web): run detail design-match adjustments`.

---

## Self-review notes

- Decision-1 coverage: pause/resume → B4 + D3; message → B5 + D7 + D5 (YOU bubble); question/answer → A2 + B8 + D5 + D7; reject stops → B7 + D5; stage times → B1 + D2/D4; output tree → B3 + D6; fresh vs continue + re-run done → B6 + D3; structured diffstat → B2 + D5/D6.
- Explicitly not built (YAGNI): live injection into a running claude process; SIGSTOP pause; persisted claude sessions for workflow stages; file content serving from the tree; pause for agent/goal runs.
