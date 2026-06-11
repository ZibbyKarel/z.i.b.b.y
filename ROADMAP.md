# Z.I.B.B.Y — Roadmap to the North Star

> From "a dashboard that can run one real agent" to "a butler that runs
> engagements." Each phase ships with its own unit + e2e coverage — tests are
> part of the work, never a follow-up phase.

---

## Where we are today (verified 2026-06-11)

**Real and working:**

- Directed mode core: `POST /api/tasks` → `TaskClassifierService` (real
  `claude -p` router, keyword fallback, orchestrator terminal rule) →
  `AgentRunnerService` spawns real `claude -p` in a sandboxed run dir with
  log/sidecar persistence (`apps/api/src/runner/runner-core.ts`).
- Mid-run approval gate (Variant B): PreToolUse hook → `intent-request.json` →
  `GateEvaluatorService` (locked floor from `POLICY.md`, harden-only agent
  rules) → resume/deny. Approvals persist across restart. **Agent runs only.**
- File-backed everything: agents, skills, pipelines, projects, approvals,
  automations, gate rules, scheduled tasks under `apps/api/data/` (atomic
  writes, tolerant parsing, restart reconciliation).
- Automations (cron tick) + scheduled-task queue (30 s tick).
- Memory vault: read-only index/search/graph + `appendDaily`
  (`apps/api/src/memory/vault.service.ts`).
- Web UI wired via ts-rest + TanStack Query; SSE run events + log streaming;
  runs feed, approvals, gates editor, agents/projects/skills CRUD.
- Tests: 17 API e2e files, ~22 API unit files, DS component tests, 3 Playwright
  specs (`e2e/`), CI runs lint/typecheck/test/build (Playwright job manual-only).

**Gaps vs. North Star:**

| North Star claim | Reality |
|---|---|
| Delivery loop with Kodér ⇄ Review ⇄ Tester retries | Backend `loop` back-edges exist but pipeline runs default to `demo-stage.mjs`; stage-level gates/resume missing; UI only builds linear chains |
| "The PR is the gate" | No git/branch/PR workflow at all |
| Second brain with run lifecycle (ground → work → record) | Vault is read-only + daily append; no grounding, no learned-memory writes, no MOC updates |
| Autonomous mode watching Slack/email | Nothing exists; Integrations screen is a client-side mock (`CatalogProvider`) |
| Butler's briefing, always answerable | ActivityFeed is demo data; no activity log, no briefing |
| Voice operator interface | Demo transcript only (`useVoiceDemoSequence`) |
| Multiple parallel engagements with budget caps | Limits are read-only display; no caps, no per-project budgets |

FINISH.md Fáze A–C are incorporated below: B1–B3 → Phase 1, B4 → Phase 2,
A + C → Phase 7. Phase 7 has no dependency on Phases 3–6 and can be pulled
forward any time.

---

## Phase 1 — Trustworthy autonomous core

*Goal: one task, typed into NewTaskDialog, runs a **real** multi-phase pipeline
end-to-end — pauses on approval, resumes after it, and reports its outcome.
Nothing downstream is worth building until this is boringly reliable.*

### 1.1 Claude preflight (FINISH B3)

- Extend `apps/api/src/health` (`GET /api/health`): check `CLAUDE_BIN` exists
  and is authenticated; return structured `claude: { ok, version, reason }`
  in `HealthSchema` (`libs/contracts/src/health/`).
- Refuse to start a real run when preflight fails — runs get a readable
  `error` with the reason instead of silently dying; surface in
  `SummaryWidget` and `RunDetail`.
- **Tests:** unit for the preflight probe (binary missing / unauthenticated /
  ok, mocked spawn); extend `health.e2e.test.ts`; web-components test that
  the health banner renders the degraded state.

### 1.2 Pipeline stage gates + resume (FINISH B1)

- `pipeline-runner.service.ts`: wire `onIntent` into the stage driver (pattern:
  `agent-runner.service.ts:151`) and implement `resume()` (pattern:
  `runner-core.ts:345`) so `ApprovalsService` resume for `kind:
  "pipeline-stage"` is no longer a no-op. After approval the **current phase
  continues**, not restarts.
- Persist `awaiting-approval` in the stage record + aggregate `run.json` so a
  parked pipeline survives API restart.
- **Tests:** unit for stage-level resume bookkeeping; extend
  `pipelines.e2e.test.ts`: pipeline parks on gated intent → approve → runs to
  `done`; reject → `failed`. (Two pre-existing flaky pipeline e2e tests stay
  quarantined — verify on a clean tree, don't chase.)

### 1.3 Task → run → outcome linkage (FINISH B2)

- Add `taskId` to `agent-run.schema.ts` + pipeline-run schema + run sidecars;
  thread it through `TaskSchedulerService.createTask()` dispatch.
- On run completion write final outcome (`done`/`error` + summary line) back
  to the task record; expose in `tasks.contract.ts`.
- Web: `/runs` feed and `RunDetail` show "task X → succeeded/failed";
  `useRunsQuery` merges outcome.
- **Tests:** API e2e: create task → run finishes → task record holds outcome;
  web-components test for outcome badge on `TaskCard`.

### 1.4 Real-mode pipelines as the supported path

- Flip the default mental model: `AGENT_RUNNER_MODE=claude` is the product;
  demo mode becomes an explicit test/e2e seam (keep it — Playwright and CI
  depend on determinism).
- Document and seed: `pnpm api:dev` runbook for real mode, demo for tests.
- Audit `claude-run-command.service.ts` flags against the real CLI once on
  this machine (model/effort/allowedTools/agents catalog) and pin a smoke
  script `apps/api/scripts/claude-smoke.mjs` that runs one trivial real run.
  The audit also pins the context-loading rule Phases 2–3 build on: project
  context (`CLAUDE.md`, `.claude/`) loads from the spawn **cwd**, not from
  `--add-dir` directories.
- **Tests:** keep all e2e on demo mode (deterministic); add a manually-run
  `pnpm api:smoke` real-mode smoke (not in CI); unit tests for command
  builder flag matrix already exist — extend for any flag changes.

**Phase exit criterion:** typed task → classified → real pipeline with an
approval in the middle → approved → done, outcome visible in UI; all green
under `pnpm test` + `pnpm e2e`.

---

## Phase 2 — The delivery loop

*Goal: the Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor cycle as a
bounded state machine that parks instead of thrashing — "delivering working
code, not generating code."*

### 2.1 Deterministic verification phase (FINISH B4)

- New built-in stage type `verify` in `PipelinePhaseSchema`: runs a project's
  check commands (`pnpm lint && tsc && pnpm test` by default, overridable per
  project in `ProjectSchema.checks`) in the run sandbox; **only success
  advances**, failure triggers the phase's `loop` back-edge with the failure
  tail as context (`<phaseId>.failure.txt` mechanism already exists).
- Implement as a runner concern, not a prompt — `runner-core` executes it
  without spawning claude.
- **Real project context for project-targeted stages:** when a run resolves a
  project, claude stages spawn with **cwd = the project checkout**, not the
  run sandbox — `--add-dir` grants file access only and loads no context, so
  the target's own `CLAUDE.md`, `.claude/` skills, hooks, and settings apply
  exactly as they would for the operator. The run sandbox stays the artifact
  home (logs, sidecars, handoffs), granted via `--add-dir` in the other
  direction. Registering a project = trusting its repo config; the approval
  hook injected via `--settings` and the locked gate floor apply regardless
  (Law 1). Worktree isolation arrives in 3.1 — until then this is the same
  trust posture as the verify stage running in the checkout.
- **Tests:** unit for verify-stage command assembly + result mapping; e2e:
  pipeline with a verify stage against a fixture repo whose tests fail once
  then pass (scripted fixture), asserting the loop-back and eventual `done`.

### 2.2 Loop-aware pipeline authoring UI

- `NewPipelineDialog` (and a real **edit** dialog — the edit/duplicate buttons
  on `features/pipelines/Screen.tsx` are stubs today): support `loop`
  (back-edge target, `maxRetries`, `escalate`, `then`), per-phase
  model/thinking already exist.
- `PhaseChain` visualizes back-edges and retry counts; `updatePipeline` /
  duplicate mutations wired (`useUpdatePipelineMutation`,
  `useDuplicatePipelineMutation` — contract endpoints exist for update).
- **Tests:** web-components tests for the dialog producing correct
  `phases[].loop` payloads; Playwright: edit a pipeline, add a loop, run it
  (demo mode), see retry visualization.

### 2.3 Escalating retries + parking surfaced

- Escalation policy on loop-back: bump `thinking`/`model` per attempt
  (`attempt → override` map on the phase), per North Star "escalating effort
  each pass".
- Parked runs (`parked` status after retries exhausted) become a first-class
  operator queue: parked section in `/runs` + overview right rail, with the
  failure context attached and a "resume with note" action (operator note is
  injected into the retried phase).
- **Tests:** unit for escalation ladder; e2e: retries exhaust → `parked`,
  resume-with-note continues; web test for parked queue rendering.

### 2.4 The delivery pipeline, seeded

- Ship a canonical `delivery.pipeline.md` + the five agent definitions
  (Architekt, Kodér, Code-Review, Tester=verify stage, Dokumentátor) as seed
  data with handoff files (`plan.md`, `implementation/`, `review.md`,
  `docs.md`), Tester as a `verify` stage, Review→Kodér back-edge
  (`maxRetries: 3`, escalate).
- Classifier should route "build/fix X in project Y" tasks to it.
- **Tests:** e2e (demo mode): run the seeded pipeline end-to-end including one
  loop-back; classifier unit test that delivery-shaped text routes to it.

**Phase exit criterion:** "fix this failing test in project X" runs the
delivery pipeline, loops on red tests, and either finishes green or parks
with context.

---

## Phase 3 — Git and the PR gate

*Goal: Law 3 made structural — ZIBBY works on its own branch, prepares the PR
completely, and stops. Push/merge are gated actions, not conventions.*

### 3.1 Workspace manager

- New `apps/api/src/workspace/` module: for a run targeting a project, create
  a branch `zibby/<runId>-<slug>` (worktree under the run sandbox via
  `git worktree add`, so parallel runs never collide on one checkout); record
  branch + worktree path in the run sidecar; clean up worktrees on delete.
- Agents spawn with the **worktree as cwd** — the project's real context
  (`CLAUDE.md`, `.claude/` skills, hooks, settings) loads exactly as it would
  for the operator, while the main checkout is never touched. This replaces
  Phase 2's interim direct-checkout cwd; the run sandbox keeps being granted
  via `--add-dir` for artifacts.
- **Tests:** unit with a temp git fixture repo (init/branch/worktree/cleanup);
  e2e: agent run against fixture project lands commits on its own branch,
  main untouched.

### 3.2 Push/PR as gated actions

- Extend the locked floor in `POLICY.md` + `GateEvaluatorService` match
  vocabulary: `git push` / `gh pr create` / `gh pr merge` map to actions
  `push`/`pr-open`/`merge` with floor decisions `ask`/`ask`/`deny`. The
  approval hook already intercepts Bash — extend its destructive-command
  classifier to recognize these.
- "Never" list (Law: auto-merge, deploy, credential entry) → floor `deny`,
  locked, not removable via `replaceAgentGates` (harden-only already
  enforces this).
- **Tests:** unit for the classifier patterns (incl. obfuscations like
  `git -C … push`, `&&` chains); gates e2e: agent attempting push parks on
  approval; merge attempt is denied outright.

### 3.3 PR preparation (build up to the gate)

- New `prepare-pr` capability: a final delivery-pipeline phase drafts PR
  title/body from the run's handoff files and stores
  `pr-draft.md` in the run dir; approving the `pr-open` gate executes
  `gh pr create` with that draft.
- Web: `RunDetail` shows the PR draft + diffstat for the Tier 3 decision —
  "one clear decision" per North Star.
- **Tests:** unit for draft assembly from fixture handoffs; e2e (demo +
  fixture repo with a fake `gh` shim on PATH): approve → shim records the
  exact `gh pr create` invocation.

**Phase exit criterion:** delivery pipeline ends with a fully prepared PR
draft and a single pending approval; nothing reached the remote before it.

---

## Phase 4 — Second brain: memory lifecycle

*Goal: every run grounds itself at start and leaves a durable trace at end;
memory compounds instead of being a read-only graph viewer.*

### 4.1 Vault write API

- Extend `memory.contract.ts` + `VaultService`: `createNote`, `updateNote`
  (frontmatter-aware, atomic), `appendToNote`, and an `updateIndex` operation
  that adds/edits a wikilink line in a named MOC. Path-traversal-safe (reuse
  `resolveSafeFile`).
- Point `VAULT_DIR` at the operator's real Obsidian vault (config +
  documented); keep `apps/api/data/memory` as the default/dev vault.
- **Tests:** unit for write paths (atomicity, frontmatter round-trip, link
  parsing, traversal rejection); extend `memory.e2e.test.ts` with write +
  re-read + graph update.

### 4.2 Run lifecycle: ground → work → record

- **Grounding:** `claude-run-command.service.ts` prepends a grounding block to
  the system prompt: North Star note + relevant index (selected by the
  classifier's matched terms against MOC titles — index-first, no
  embeddings) + project memory note if one exists.
- **Recording:** on run completion, a lightweight recorder step appends to
  `daily/<date>.md` (what ran, outcome, links) and — for delivery runs — asks
  the agent's final phase to emit `learned.md`; recorder files it into the
  vault and links it from the project's MOC.
- This is the durable trace Law 2 demands: every run leaves vault entries.
- **Tests:** unit for grounding-block selection (fixture vault); e2e: run
  completes → daily note contains the entry, MOC gained a link; web memory
  graph shows the new node.

### 4.3 Memory UI grows write surfaces

- `/memory`: create/edit note (DS `MarkdownEditor`), search box wired to the
  existing `search` endpoint, tier filter; daily notes timeline view.
- **Tests:** web-components tests for editor save flow; Playwright: create a
  note, see it in the graph (extends `memory-graph.spec.ts`).

**Phase exit criterion:** ask "what did you do yesterday and what do you know
about project X" and the answer is assembled from vault files written by runs,
not from chat context.

---

## Phase 5 — Channels and autonomous mode

*Goal: ZIBBY watches Slack (then email) on a heartbeat, triages by tier, acts
within mandate, and inbound content can never raise privileges (Law 4).*

### 5.1 Integrations become real

- New `integrations` contract + NestJS module (file-backed like the others):
  `{ id, kind: "slack" | "email", config, status, lastSyncAt }`; secrets in a
  separate gitignored credentials file, never in entity files.
- Replace the `CatalogProvider` mock on `/integrations` with real
  queries/mutations + connection test button.
- **Tests:** new `integrations.e2e.test.ts` (CRUD + status); web-components
  tests for the screen; unit for credential separation.

### 5.2 Channel ingestion (Slack first)

- `apps/api/src/channels/`: a `ChannelWatcher` per integration, driven by the
  existing automation heartbeat (`AUTOMATION_TICK_MS`); Slack adapter polls
  conversations API (poll, not socket — simpler, restartable).
- Inbound items persisted as files: `data/channels/<integration>/<itemId>.json`
  with raw content, normalized text, thread ref, state
  (`new → triaged → handled/ignored`).
- **Sanitation (Law 4):** inbound text is wrapped as quoted data in any prompt
  that sees it; a dedicated sanitizer strips/escapes anything
  instruction-shaped from being placed outside the data envelope. Channel
  items can never carry gate overrides — triage output is validated against a
  closed Zod schema.
- **Tests:** adapter unit tests against recorded Slack fixtures; sanitizer
  unit tests with prompt-injection corpus ("ignore previous instructions",
  fake approval phrases) asserting they remain inert data; e2e with a `fake`
  channel adapter (seam like demo runner) feeding fixture messages.

### 5.3 Triage to tiers + mandate

- `TriageService`: classify each inbound item (reuse the claude-cli-router
  pattern + keyword fallback) into `{ actionable, tier 1|2|3, suggestedTask }`.
  Mandate config (`data/mandate.json`, editable in Settings) defines what
  Tier 2 may do per channel; **unknown → higher tier** per North Star.
- Tier 1: dispatch silently via existing `createTask` (logged). Tier 2:
  dispatch + flag for next briefing. Tier 3 / low confidence: create a
  pending decision in the approvals queue (new `kind: "channel"`), prepared
  reply attached.
- Outbound replies (Tier 2) go through the gate evaluator as action
  `channel-reply` — floor default `notify`, per-channel hardening possible.
- **Tests:** triage unit tests on fixture corpus (bug report → Tier 1
  investigate, client question → Tier 2 reply, scope request → Tier 3);
  e2e: fake channel message → triage → task dispatched → outcome recorded on
  the channel item; gates e2e for `channel-reply`.

### 5.4 Email adapter

- Second `ChannelWatcher` implementation (IMAP poll + SMTP send) reusing the
  item store, sanitizer, triage, and reply gate unchanged — this is the test
  that the channel abstraction is right.
- **Tests:** adapter unit tests against fixture mailboxes; the 5.2/5.3 e2e
  suite re-run against the email fake.

**Phase exit criterion:** a fixture "bug report" lands in the fake channel →
ZIBBY investigates on a branch (Tier 1), prepares a fix PR (Tier 3 gate), and
drafts a reply pending approval — with zero operator prompting.

---

## Phase 6 — Accountability: activity log and the butler's briefing

*Goal: "what's happening / what happened" answered from the record, and the
default report is a briefing, not a firehose (Law 5).*

### 6.1 Activity log on disk

- `apps/api/src/activity/`: append-only `data/activity/<date>.jsonl` —
  every dispatch, gate decision, channel action, tier-2 act-then-report, with
  traceId/runId (the AsyncLocalStorage correlation already exists). This is
  the attributable record; the existing LoggerService keeps being diagnostics.
- Replace the demo `ActivityFeed` on `/overview` with a real feed query.
- **Tests:** unit for log writer (rotation, atomicity); e2e: a run + an
  approval produce expected activity entries; web test for the feed.

### 6.2 Briefing generator

- `GET /api/briefing` + scheduled morning automation: assemble from activity
  log + parked runs + pending approvals + channel items since last briefing —
  template-first (deterministic sections), one optional claude pass for the
  butler-voice summary sentence. Persist each briefing to the vault
  (`daily/` link) — briefings are themselves on disk.
- Web: briefing card on `/overview`; "nothing needs you" is a valid output.
- **Tests:** unit: briefing assembly from fixture activity/approvals (snapshot
  the deterministic sections); e2e: seeded state → briefing endpoint returns
  expected sections; Playwright: briefing card renders.

### 6.3 Notification discipline

- Notification rules: pending Tier 3 decision, newly parked run, briefing
  ready — nothing else. Start with in-app (existing SSE events channel +
  badge); native/push later.
- **Tests:** unit for the rule filter (noisy event stream in → three
  notification kinds out); web test for badge behavior.

**Phase exit criterion:** after a seeded "overnight" scenario, `/overview`
shows the North Star's example briefing shape, every line traceable to a file.

---

## Phase 7 — Voice and operator UX (FINISH Fáze A + C)

*Independent of Phases 3–6; pull forward whenever the operator wants it.*

### 7.1 Real voice in/out (A1–A3)

- `useSpeechRecognition` (Web Speech API, locale from cookie, interim
  transcript, error states `mic-denied|unsupported|network`),
  `useSpeech` (TTS with `voiceschanged` handling), extended `VoiceSession`
  interface; demo hook kept behind `mode: "live" | "demo"`.
- **Tests:** hook tests with a mocked Speech API object (final result →
  state transitions).

### 7.2 Speech → action bridge (A4–A5, A7)

- `dispatchUtterance.ts`: pure `parseUtterance` grammar (cs/en, diacritics
  normalization) → `approveLatest | rejectLatest | stopActive | navigate |
  closeOverlay | createTask(text)`; wired to the real mutations; text-input
  fallback when speech is unavailable; full i18n keys.
- Voice reads run outcomes (depends on 1.3) and pending approvals aloud.
- **Tests:** `dispatchUtterance.test.ts` covering every grammar row in both
  languages + fallback-to-task; overlay test: final "schval" calls
  `approveLatest`.

### 7.3 UX polish (Fáze C + known stubs)

- Interactive approval/active panels in the voice overlay (shared
  `VoiceActions` handlers); Settings → Voice (live/demo, recognition
  language, TTS voice, wake-word toggle); overlay a11y (focus trap,
  `aria-live`).
- Sweep the known dead UI: skill edit/delete, global search wired to the
  existing search endpoints, light theme tokens (`light.ts` is a stub).
- **Tests:** web-components tests per surface as built; Playwright: keyboard
  task creation → approval → done happy path stays green.

**Phase exit criterion (FINISH DoD):** spoken task → run → spoken approval →
run completes → spoken result; text fallback works everywhere.

---

## Phase 8 — Multi-engagement scale

*Goal: the long-term purpose — several delivery engagements in parallel, the
operator only at the decision points.*

### 8.1 Budgets and caps

- Per-project budget in `ProjectSchema` (daily/weekly token or run-count
  cap); `LimitsService` usage data feeds a `BudgetService`; exceeding a cap
  parks new dispatches behind a Tier 3 approval (`spend-past-cap` gate
  action on the floor).
- Web: budget bars on `/projects`, cap-hit state in runs feed.
- **Tests:** unit for cap arithmetic + window reset; e2e: cap reached →
  dispatch parks, approval releases it.

### 8.2 Engagement isolation and parallelism

- Concurrency limits per project (queue, not reject); worktree-per-run (3.1)
  already prevents checkout collisions; verify run-dir and vault writes are
  contention-safe under parallel load.
- Briefing groups by engagement/project; channel triage tags items with the
  matched project.
- **Tests:** e2e: two pipelines on two fixture projects run concurrently
  without cross-talk (assert on file layout + activity log attribution);
  stress test for the runner registry.

### 8.3 Ops hardening

- Run as a service: launchd/daemon setup docs, crash-restart reconciliation
  verification, log rotation; re-enable the Playwright job in CI on a
  self-hosted runner (the GHA blocker was the missing `claude` binary — demo
  mode avoids it); backup strategy for `data/` + vault (it's all files —
  document the rsync/git answer).
- **Tests:** restart e2e already exists for runs — extend to parked
  pipelines, channel watchers, and scheduled tasks resuming after a kill.

**Phase exit criterion:** two seeded engagements progress overnight on a
machine that rebooted once, and the morning briefing accounts for everything.

---

## Sequencing and dependencies

```
Phase 1 (core reliability)
  ├─→ Phase 2 (delivery loop)
  │     └─→ Phase 3 (git + PR gate)
  ├─→ Phase 4 (memory lifecycle)        — only needs 1.x
  └─→ Phase 7 (voice)                   — only needs 1.3 for outcomes
Phase 5 (channels)   — needs 1 + 2 (tasks it dispatches must deliver) + 3 for bug-fix-to-PR
Phase 6 (briefing)   — needs 5 for channel sections; log/feed parts can start after 1
Phase 8 (scale)      — last; needs 3 (worktrees) + 6 (per-engagement briefing)
```

**Standing rules for every phase** (the test constraint, made concrete):

1. New contract endpoint → new/extended API e2e in `apps/api/test/` in the
   same change.
2. New service logic → unit tests beside it (`*.test.ts` in `src/`).
3. New web surface → web-components vitest test; new operator throughline →
   Playwright spec in `e2e/` (demo-mode deterministic).
4. `pnpm lint` → `npx tsc -p apps/web/tsconfig.json --noEmit` (rtk typecheck
   lies) → `pnpm test` → `pnpm exec vitest run --project web-components`
   green before a phase item is "done"; `pnpm e2e` green at phase exit.
5. Anything claude-real gets a deterministic seam (the demo runner / fake
   channel adapter pattern) so CI never needs tokens or credentials.
