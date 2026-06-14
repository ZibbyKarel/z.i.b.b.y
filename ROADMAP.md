# Z.I.B.B.Y — Roadmap to the North Star

> From "a dashboard that can run one real agent" to "a butler that runs
> engagements." Each phase ships with its own unit + e2e coverage — tests are
> part of the work, never a follow-up phase.

---

## Where we are today (refreshed 2026-06-14 — Phases 1–14 shipped)

**The original North-Star gap table is closed.** Every row below is now delivered;
the phase that did it is named. The detail of each lives in its phase section + the
per-phase plan under `docs/plans/`.

| North Star claim                                         | Status (delivered by)                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Delivery loop with Kodér ⇄ Review ⇄ Tester retries       | ✅ real verify stage, back-edges, escalation, parking, seeded `delivery.pipeline.md` (**Phase 2**) |
| "The PR is the gate"                                     | ✅ worktree-per-run `zibby/*` branches, push/PR gated on the locked floor, PR-draft prep (**Phase 3**) |
| Second brain with run lifecycle (ground → work → record) | ✅ vault write API, grounding block, run recorder + learned-memory, MOC links (**Phase 4**)        |
| Autonomous mode watching Slack/email                     | ✅ real integrations + credentials, Slack/email `ChannelWatcher`, sanitizer, tiered triage + mandate (**Phase 5**) |
| Butler's briefing, always answerable                     | ✅ append-only activity JSONL, `GET /api/briefing` + morning automation, notification discipline (**Phase 6**) |
| Voice operator interface                                 | 🚧 styled JARVIS takeover + utterance→composer seam shipped; **live STT now real (Phase 17)**; TTS + action grammar + wake word still pending (**Phase 7** plan; was wrongly marked done) |
| Multiple parallel engagements with budget caps           | ✅ per-project + per-goal budgets, concurrency isolation, ops hardening (**Phase 8**, **13.1**)    |

**Built on top of the North Star (Phases 9–14):**

- **Limit resilience** (9): `paused-limit` halt, auto-resume on window reset, checkpointed
  delivery with progress markers.
- **Loop engine** (10): `goal` task target + `GoalRun`, verifier as a first-class stop
  condition, discovery triage (work finds itself), goal detail UI.
- **Unified task UX** (11): one described intent → classifier routes to agent/pipeline/goal;
  paths become scoped permissions.
- **Self-development safety** (12) + **payoff** (13): ZIBBY is a safe target for its own loop
  engine (verifier scoping, resource governance + reaping, Law-3 boot gate, worktrees out of
  the repo, test isolation); per-goal budget enforced; the exit demonstration is an
  executable e2e; launchd auto-resume for the unattended builder. Runbook:
  `docs/ops/self-development.md`.
- **Operator UX** (14): the new goal park reasons + budget surface with human-legible labels.

**Tests (current):** ~91 api vitest files (unit + e2e), DS + web-components vitest (~206),
**7 Playwright specs** (`e2e/`). Full api suite reliably 684/684 (13.4 stabilized
concurrency). The loop's own gate runs `pnpm lint` + api/web `tsc` + vitest each iteration.

FINISH.md Fáze A–C are incorporated below: B1–B3 → Phase 1, B4 → Phase 2,
A + C → Phase 7.

---

## Phase 1 — Trustworthy autonomous core

_Goal: one task, typed into NewTaskDialog, runs a **real** multi-phase pipeline
end-to-end — pauses on approval, resumes after it, and reports its outcome.
Nothing downstream is worth building until this is boringly reliable._

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

_Goal: the Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor cycle as a
bounded state machine that parks instead of thrashing — "delivering working
code, not generating code."_

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

_Goal: Law 3 made structural — ZIBBY works on its own branch, prepares the PR
completely, and stops. Push/merge are gated actions, not conventions._

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

_Goal: every run grounds itself at start and leaves a durable trace at end;
memory compounds instead of being a read-only graph viewer._

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

_Goal: ZIBBY watches Slack (then email) on a heartbeat, triages by tier, acts
within mandate, and inbound content can never raise privileges (Law 4)._

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

_Goal: "what's happening / what happened" answered from the record, and the
default report is a briefing, not a firehose (Law 5)._

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

_Independent of Phases 3–6; pull forward whenever the operator wants it._

**Cost constraint (binding): voice is 100% free and browser-native.** STT via
`SpeechRecognition`, TTS via `speechSynthesis` — both W3C Web Speech API,
already in the browser. No paid voice services, no third-party model
subscriptions (no ElevenLabs, no hosted Whisper, no cloud STT keys). Primary
target is Chromium (Chrome/Edge — the operator's browser); Safari best-effort;
Firefox has STT off by default and degrades to the text-input fallback. Full
research (support matrix, error catalogue, bug workarounds, code patterns):
`docs/research/phase7-voice-web-speech.md`.

### 7.1 Real voice in/out (A1–A3)

- `useSpeechRecognition`: wraps `window.SpeechRecognition ??
webkitSpeechRecognition`; `lang` from the locale cookie (`cs-CZ`/`en-US`),
  `continuous` + `interimResults`, interim surfaced as ghost text, utterance
  dispatched only on `isFinal`. Error mapping to a closed union `mic-denied |
unsupported | network | service-denied` (`not-allowed`/`audio-capture` →
  mic-denied; missing API → unsupported; `no-speech`/`aborted` suppressed —
  they're normal session noise).
- **Reconnect strategy** (the hard part): Chrome silently drops continuous
  sessions after ~60 s of silence, firing a plain `onend` with no error.
  Restart only while an `active` flag says the session should be live;
  exponential backoff `min(200·2ⁿ, 5000)` ms, max 5 retries, counter reset on
  every successful result. `not-allowed`/`audio-capture` kill the retry loop
  permanently.
- Chrome 139+ opt-ins, strictly feature-detected (no hard dependency):
  `processLocally: true` (on-device STT — offline, audio never leaves the
  machine; `available()`/`install()` for the language pack) and
  `SpeechRecognitionPhrase` contextual biasing boosting the 7.2 command
  grammar (`schválit`, `odmítnout`, `approve`, `reject`… boost ~8).
- `useSpeech` (TTS): voices resolved via the `voiceschanged` event
  (`getVoices()` is `[]` on first call — promise with `{ once: true }`
  listener, inside `useEffect`); voice selection: exact locale match
  preferring `localService` → lang-prefix fallback (`cs-*`) → browser
  default. Known-bug hardening: hold the utterance in a ref until `onend`
  (GC kills the callback otherwise); `speak()` only after a user gesture
  (autoplay policy) — queue early utterances, flush on first interaction;
  always set `utterance.lang`.
- Extended `VoiceSession` interface (`mode, isListening, isSpeaking,
isSupported, error, transcript, startListening, stopListening, speak,
stop`); the existing demo transcript hook stays behind
  `mode: "live" | "demo"` — Playwright/CI remain deterministic on demo.
- SSR guards (`typeof window !== "undefined"`) on every API touch — Next.js
  renders these components on the server first.
- **Tests:** jsdom has neither API — vitest setup installs a
  `MockSpeechRecognition` (EventTarget subclass with
  `simulateFinalResult`/`simulateError` helpers) and a `speechSynthesis` stub
  with fixture voices. Hook tests: start/stop transitions, error → closed
  union mapping, silent-drop reconnect with fake timers (backoff + retry cap),
  `voiceschanged` voice resolution, gesture-queue flush.

### 7.2 Speech → action bridge (A4–A5, A7)

- `parseUtterance` pure grammar (cs/en): normalize before matching —
  lowercase + NFD + strip combining marks (`"Schválit"` → `"schvalit"`);
  Chrome returns proper diacritics on final results but interim may lack
  them, so matching is diacritics-insensitive while `createTask` keeps the
  raw utterance (diacritics intact) as the task text. Grammar rows:
  `schválit/approve → approveLatest`, `odmítnout/reject|deny → rejectLatest`,
  `zastavit|stop/stop → stopActive`, `jdi na X/navigate to X → navigate(page)`,
  `zavřít/close → closeOverlay`, anything else → `createTask(text)` — a
  spoken task is never a silent no-op, same rule as typed ones.
- `dispatchUtterance.ts` wires actions to the real mutations; text-input
  fallback rendered automatically when `isSupported` is false (Firefox path);
  full i18n keys.
- Voice reads run outcomes (depends on 1.3) and pending approvals aloud via
  `useSpeech`.
- **Tests:** `dispatchUtterance.test.ts` covering every grammar row in both
  languages, diacritics-present and -stripped inputs, + fallback-to-task;
  overlay test: final "schval" calls `approveLatest`.

### 7.3 UX polish + optional wake word (Fáze C + known stubs)

- Voice overlay a11y: native `<dialog>` (built-in focus trap + Escape),
  interim transcript in `role="status" aria-live="polite"`, errors in
  `role="alert"`, focus restored to the trigger on close; interactive
  approval/active panels (shared `VoiceActions` handlers).
- Settings → Voice: live/demo mode, recognition language, TTS voice picker
  (populated from `getVoices()`), wake-word toggle.
- **Activation default is push-to-talk / hotkey — zero dependencies.**
  Hands-free wake word is an optional last step, two free options:
  - `@picovoice/porcupine-web` — real "Zibby" keyword spotting, on-device
    WASM; free tier (≤3 active users/month — fine for a single operator) but
    needs a free-account `AccessKey` env var and license phone-home; custom
    `.ppn` trained free in their console.
  - `@ricky0123/vad-web` — MIT, fully OSS, no key; VAD only ("any speech
    activates"), not keyword spotting.
  - openWakeWord rejected: Python-only in practice, non-commercial model
    licenses. Either option needs `copy-webpack-plugin` wiring for
    WASM/worklet assets in `next.config.ts`.
- Sweep the known dead UI: skill edit/delete, global search wired to the
  existing search endpoints, light theme tokens (`light.ts` is a stub).
- **Tests:** web-components tests per surface as built; Playwright: keyboard
  task creation → approval → done happy path stays green.

**Phase exit criterion (FINISH DoD):** spoken task → run → spoken approval →
run completes → spoken result; text fallback works everywhere; total voice
spend: 0 Kč.

---

## Phase 18 — Voice command bridge (speech → action) — ✅ delivered 2026-06-14

_Delivers ROADMAP **§7.2** minus the TTS read-back (which needs §7.1 `useSpeech`,
still pending). Phase 17 made the microphone real but the transcript could only
become a task; this phase makes the operator's voice **act** — "schválit",
"odmítnout", "zastav", "jdi na runs", "zavři" execute against the real mutations,
and anything else is staged as a one-tap new task. A spoken word is never a
silent no-op (same rule as a typed task)._

### 18.1 `parseUtterance` — pure cs/en command grammar

- `features/voice/parseUtterance.ts`: normalize (lowercase + NFD + strip combining
  marks + punctuation) then match a **closed** `VoiceAction` union —
  `approveLatest | rejectLatest | stopActive | navigate(route) | closeOverlay |
  createTask(text)`. Diacritics-insensitive matching, but `createTask` keeps the
  **raw** utterance (diacritics intact) as the task text.
- Guard against hijacking dictated tasks: approve/reject/stop/close match only on
  **concise** utterances (≤3 words beginning with a command verb); navigate needs
  an explicit verb (`jdi na` / `otevři` / `navigate to` / `open` / `show me` …)
  **and** a known page alias, else it falls through to `createTask`. Unknown →
  `createTask` always.

### 18.2 `runVoiceAction` — pure executor + `useUtteranceDispatch` wiring

- `features/voice/runVoiceAction.ts`: pure `(action, deps) → VoiceAck` — switches
  on the action and calls the injected `approve/reject/stop/navigate/stageTask/close`
  handler, returning a localizable ack (`approved`, `nothingToApprove`, `stopped`,
  `navigating`, `heard`, …). No React, fully spy-testable.
- `features/voice/hooks/useUtteranceDispatch.ts`: binds the pure executor to the
  real `useApproveMutation` / `useRejectMutation` / `useStopAgentMutation`, the Next
  router, and the overlay's exit — "latest" approval = the top of the pending queue,
  "active" run = the first running **agent** run. Nothing bypasses the gate: approve/
  reject ARE the operator's spoken decision at the gate; `createTask` only stages.

### 18.3 `VoiceScreen` dispatches finalized utterances

- A new finalized live transcript is dispatched once (a `ref` debounces re-renders);
  the resulting ack renders in an `aria-live="polite"` region. The existing
  "hand to task" button and demo path are unchanged.

### Tests

- `parseUtterance.test.ts`: every grammar row in cs + en, diacritics present and
  stripped, the concise-word guard (long "approve …" sentence → task), navigate with
  known/unknown page, empty → task.
- `runVoiceAction.test.ts`: each action routes to the right handler with spies;
  approve/reject/stop with and without a pending target → the correct ack; navigate
  exits + routes; createTask stages.
- `VoiceScreen.test.tsx`: a finalized command transcript invokes `dispatch`; ack text
  renders; existing transcript/hand-off/unsupported assertions stay green.

**Out of scope (→ next phases):** TTS read-back (§7.1 `useSpeech` — speak the ack
and run outcomes aloud), reconnect backoff ladder, Chrome on-device opt-ins,
Settings → Voice, wake word.

---

## Phase 19 — TTS read-back (`useSpeech`) — ✅ delivered 2026-06-14

_Delivers the **second half of ROADMAP §7.1**: ZIBBY speaks. The command bridge
(Phase 18) showed acks as text; now they're read aloud over free, browser-native
`speechSynthesis` — the "spoken result" the North-Star voice DoD requires, at zero
spend (the §7 cost constraint)._

### 19.1 `useSpeech` — SSR-safe TTS hook

- `features/voice/hooks/useSpeech.ts`: wraps `window.speechSynthesis`. Returns
  `{ isSupported, isSpeaking, voices, speak(text, lang?), stop }`. Voices resolved
  via the `voiceschanged` event inside a `useEffect` (`getVoices()` is `[]` on the
  first call); voice selection = exact locale → on-device `localService` → language
  prefix → browser default. Hardened against the documented TTS bugs from
  `docs/research/phase7-voice-web-speech.md`: the utterance is **held in a ref**
  until `onend` (GC otherwise kills the callback), `cancel()` precedes every
  `speak()`, `utterance.lang` is always set, and SSR is guarded on every API touch.
  The overlay only mounts after a user gesture, so the autoplay policy is satisfied.

### 19.2 `VoiceScreen` speaks acks + a mute control + speaking state

- Each new command acknowledgement is spoken once (a `ref` debounces re-renders),
  in the locale's BCP-47 tag. The previously-dead speaker button is now a **mute
  toggle** (`aria-pressed`, struck-through glyph when muted; muting also cuts
  in-flight speech). The orb + status line gain a `speaking` state (`isSpeaking`
  outranks listen/idle), so the JARVIS HUD animates while ZIBBY talks.
- i18n `voice.mute` / `voice.unmute` (cs + en).

### Tests

- `useSpeech.test.tsx` (+ a `test/speechSynthesisMock.ts` stub — jsdom has no TTS):
  support detection, `voiceschanged` voice resolution, `cancel()`-then-`speak()`
  with the locale set, local exact-locale voice selection, `isSpeaking` toggling on
  `onstart`/`onend`, `stop()` cancelling, empty-utterance no-op.
- `VoiceScreen.test.tsx`: an ack is spoken aloud (`speak("Schváleno.","cs-CZ")`); the
  speaker button mutes (`aria-pressed` flips, `stop()` called). Existing assertions
  stay green (the speech hook is mocked).

**Out of scope (→ next phases):** speak run outcomes/pending approvals aloud beyond
the command ack; reconnect backoff ladder; Chrome on-device opt-ins; Settings →
Voice (mode/language/voice picker); wake word. After this, the only voice work left
is the optional wake word + Settings surface.

---

## Phase 20 — Spoken butler's briefing + run-outcome announce — ✅ delivered 2026-06-14

_Finishes ROADMAP §7.2's "voice reads run outcomes and pending approvals aloud" —
the spoken counterpart of the Phase 6 written briefing. ZIBBY now tells you, aloud,
what's running and what needs you, and calls out runs as they finish while you watch._

### 20.1 `briefing.ts` — pure summarizer + new-completion detector

- `summarizeBriefing(data)` reduces `useVoiceData` (pending approvals, running
  agents, recent runs) to deterministic `BriefingFacts` (counts + top approval +
  `quiet` flag) — template-first, no claude in the browser (same posture as the
  Phase 6 briefing). `pickNewlyFinished(announced, recent)` returns the terminal
  (`done`/`error`) runs not yet announced. Both pure, both unit-tested.

### 20.2 `VoiceScreen` — "Brief me" + outcome announce

- A **"Brief me"** button speaks the assembled cs/en summary; as an explicit
  request it speaks even when auto-speech is muted. An effect announces runs that
  reach a terminal state **while voice is open** — seeded from the first feed so the
  history already on screen is never replayed, and gated on mute. Both reuse the
  Phase-19 `useSpeech`.
- i18n `voice.briefMe` + `voice.speak.{briefing,topApproval,recent,nothing,
  outcomeDone,outcomeFailed,outcomeMany}` (cs + en).

### Tests

- `briefing.test.ts`: `summarizeBriefing` counts + `quiet`; `pickNewlyFinished`
  filters terminal-and-unannounced.
- `VoiceScreen.test.tsx`: "Brief me" speaks the assembled summary; a run that
  finishes after open is announced while the pre-open history is not (rerender test).

**Out of scope (→ remaining voice work):** wake word (`@picovoice/porcupine-web` or
`@ricky0123/vad-web`) and a Settings → Voice surface (live/demo, language, voice
picker) — the last two §7.3 items; both optional. The core voice loop (listen →
command → speak → brief) is complete.

---

## Phase 21 — Skill edit + delete in the UI — ✅ delivered 2026-06-14

_Closes the §7.3 "skill edit/delete" dead-UI gap. The skills **contract + API
already implemented** `updateSkill` (PATCH) and `deleteSkill` (DELETE); only the web
layer was missing — skills could be created but never edited or deleted. (Global
search and skill-category CRUD, the other §7.3 items, were already wired in earlier
work — confirmed by code-level gap analysis, not roadmap claims.)_

- **Mutations/query (web):** `useSkillQuery` (single — fetches the `instructions`
  body the list query omits), `useUpdateSkillMutation`, `useDeleteSkillMutation`
  (invalidate the list + the single skill).
- **`AddSkillModal` edit mode:** an `initial` prop pre-fills name/desc/category/
  glyph/instructions, "Save" replaces "Create", and an edit-only "Delete" button
  calls `onDelete`. The id is immutable (it's the filename), so it isn't editable.
- **`SkillTile`** becomes a clickable button (`as="button"` + accessible label) that
  opens the editor; `Screen` wires tile → lazy fetch → edit modal → update/delete.
- i18n `common.delete`, `forms.skill.edit{Title,Subtitle}`, `skills.editSkillAria`.

**Tests:** `SkillTile` (opens on click / static without `onSelect`); `AddSkillModal`
edit mode (prefill, edit title, Delete button, no Delete in create). Pure web wiring,
so the existing skills API e2e covers the backend. web/DS+api 1464/1464.

---

## Phase 22 — Settings → Voice: TTS voice picker — ✅ delivered 2026-06-14

_Closes the §7.3 "Settings → Voice ... TTS voice picker (populated from getVoices())"
item. Voice config previously exposed only the push-to-talk shortcut; now the
operator chooses which voice ZIBBY speaks in. (Verified first that the prior
candidate — pipeline edit/duplicate — is already fully wired; the roadmap 2.2 "stub"
text was stale.)_

- **`voicePreference.ts`** — localStorage-backed preferred `voiceURI` (device-
  specific, never sent to the server), SSR-safe; empty/`null` = auto.
- **`useSpeech`** — `speak()` prefers the chosen voice when present, else the locale
  match; read at speak-time so a Settings change is live (no cross-component sync).
- **`VoiceVoiceSetting`** — a self-contained DS `Dropdown` of `speechSynthesis`
  voices + a "Test" button (speaks a sample); degrades to a note when TTS is
  unsupported. Wired into the Settings preferences panel.
- i18n `settings.voice{Voice,VoiceHint,VoiceAuto,VoiceUnsupported}`, `voiceTest`,
  `voiceTestSample` (cs + en).
- Test seam: `vitest.setup` installs an in-memory `localStorage` (Node 25's
  experimental global Storage throws without `--localstorage-file`, shadowing
  jsdom's — production is unaffected: real browser / SSR-guarded).

**Tests:** `voicePreference` round-trip; `useSpeech` preferred-voice override +
fallback; `VoiceVoiceSetting` (persist on select, test-speak, unsupported note).
web/DS+api 1472/1472.

---

## Phase 23 — Conversational voice dispatch (North-Star realignment) — ✅ delivered 2026-06-14

_The operator rewrote `north-star.md` (2026-06-14): **Voice is a conversation, not a
command line** — "no 'new task' form to confirm — when ZIBBY understands the intent, it
dispatches to the same `/tasks` layer the HUD drives, on its own, and tells you it has
while the work runs." This re-opens functional voice work. The old voice path staged a
spoken task into the **NewTaskDialog composer** (a confirm modal), conflating "did I
understand you" (the conversation's job, never a modal) with the gate (a transactional
confirm, never skipped). Phase 23 removes that modal seam: a spoken intent dispatches
straight to the tasks layer and ZIBBY narrates it._

**This is the first realignment slice — deliberately small.** Gate answers (spoken
approve/reject) and the control verbs (stop/navigate/close) are unchanged; only the
`createTask` branch changes from *stage-to-modal* to *dispatch-and-narrate*. Turn-by-turn
clarification, live run-event narration, and full "Claude behind the channel" are later
phases.

- **`runVoiceAction`** — the `createTask` branch now calls a `dispatchTask(text)` handler
  (was `stageTask`, which opened the composer) and returns a `dispatching` ack carrying
  the understood text; an empty utterance still returns `heard` without dispatching.
  `VoiceAck.values` widened to `{ page?; task? }`.
- **`useUtteranceDispatch`** — owns `useCreateTaskMutation`; `dispatchTask` fires
  `createTask({ text, paths })` directly (the Phase-11 backend classifier routes
  agent/pipeline/orchestrator), then flips the ack `dispatching → started` on success or
  `dispatchFailed` on error. **No navigation** — the overlay stays open so the new run
  surfaces in the live "Active agents" panel (visible-and-steerable-in-the-HUD). Nothing
  here touches the gate.
- **`VoiceScreen`** — drops `useNewTask`/`openNewTask` entirely; the auto-dispatch of
  each finalized transcript and the manual "Send" button both go through `dispatch`. TTS
  now narrates the dispatch (`dispatching` echoes the understood text, `started` confirms
  it's running) — "the butler talks back while the work happens, not only after."
- i18n `voice.ack.{dispatching,started,dispatchFailed}` + relabelled `voice.send` (cs+en).

**Tests:** `runVoiceAction` dispatch-not-stage + empty-noop; `useUtteranceDispatch`
(dispatch fires `createTask` with text+paths, ack `dispatching→started`, error→failed, no
navigate); `VoiceScreen` (finalized transcript dispatches; Send dispatches without
exiting; speaks the dispatch ack). web/DS+api green.

---

## Phase 24 — Voice status is pull, not push (operator feedback) — ✅ delivered 2026-06-14

_Operator feedback mid-loop: "Logy běhu hlásit nechci ve voice UI. Co se děje bych měl
dostat jen v případě že se zeptám. Dát prostě briefing místo čtení logů." — **voice must not
push run logs/status; status is given only when asked, as a briefing, never read logs.** This
refines the North Star's "narrating as it goes" (#3): narration = high-level dispatch acks
(Phase 23), NOT a play-by-play of run events. It also **retires** Phase 20's unsolicited
auto-announce of runs finishing while voice is open (that is an unasked status push)._

- **`VoiceScreen`** — removed the auto-announce-finishing effect (the `pickNewlyFinished`
  push). The butler stays quiet unless asked.
- **Ask-by-voice → briefing** — `parseUtterance` gains a `briefing` action (cs/en phrase set:
  "co se děje", "status", "shrnutí", "what's happening", "brief me"…); `runVoiceAction` routes
  it to a `brief()` handler that speaks the existing `summarizeBriefing` template (Phase 20),
  so a spoken question and the "Brief me" button are the two pull paths. No logs, ever.
- **`briefing.ts`** — deleted the now-dead `pickNewlyFinished`/`FinishedRun` (no caller after
  the push is gone); `summarizeBriefing` stays.
- i18n `voice.ack.briefing` (cs+en).

**Tests:** `parseUtterance` briefing phrases (+ a longer "co se děje s buildem" stays a task);
`runVoiceAction` briefing → `brief()`; `useUtteranceDispatch` spoken briefing calls `onBrief`,
not `createTask`; `VoiceScreen` a finishing run is **not** auto-announced; `briefing.test` drops
the `pickNewlyFinished` suite. web/DS+api green.

---

## Phase 25 — Turn-by-turn voice clarification — ✅ delivered 2026-06-14

_North Star: "what you want is resolved in the dialogue itself, turn by turn." Phase 23 made a
spoken task dispatch immediately; but when the classifier is **low-confidence** that dispatches
blind. Phase 25 adds the missing conversational turn: a low-confidence utterance gets a **spoken
follow-up question** instead of a blind dispatch, and the operator's next utterance resolves it —
a real two-turn dialogue, still no `NewTaskDialog`._

- **Classify-first** — the spoken task now runs the read-only `classifyTask` before dispatching
  (the same verdict the HUD composer previews). High/medium confidence → dispatch as before
  (`createTask`); **low** confidence (`isLowConfidence`, < 0.4) → ask.
- **One bounded clarification turn** — on low confidence ZIBBY speaks "I'm not sure — can you
  clarify? e.g. {top candidates}" and remembers the original utterance; the **next** utterance is
  combined with it and dispatched **regardless** of confidence (bounded — never a second ask, so
  it always terminates).
- **Acks** — the optimistic task ack is now visual-only "Heard: {task}" (TTS suppressed — ZIBBY
  speaks only the *outcome*: the clarify question, or "it's running"). New `clarify` ack.
- Gate untouched; `live|demo` deterministic. No backend reasoning call — STT/TTS stays free; the
  classifier already exists (Phase 11).

**Tests:** `useUtteranceDispatch` — low-confidence classify → `clarify` ack + no `createTask`; the
clarification answer dispatches (combined text, no second ask); high-confidence still one-shot;
gate answers never classify. `VoiceScreen` speaks the clarify question. web/DS+api green.

---

## Phase 26 — HUD runs feed: one card per task (fold a loop's child runs) — ✅ delivered 2026-06-14

_Operator (2026-06-14): stop Voice work (nice-to-have), polish the HUD — real bugs remain. First
one: when a **loop** (goal) runs, the **Běhy a aktivita** (`/runs`) feed shows TWO cards — the loop
**and** the child agent run it is currently executing. The feed must show **one card per task**
(running / stopped / awaiting-approval / finished); whether it runs as agent/pipeline/loop is detail
that belongs **inside the task**, not a second card._

Root cause: `useRunsQuery` merges the three per-kind history lists (agent + pipeline + goal) with
**no dedup**, and a goal's maker dispatches a child agent/pipeline run (`iteration.makerRunRef`) —
both the goal and its child surface as peer feed cards.

- **`mergeRunFeed` (pure, in `run.ts`)** — extracted the inline merge out of the hook and added the
  fold: collect every goal's child run ids (`iteration.makerRunRef` + the claude verifier's
  `verifier.runRef`) and drop the agent/pipeline runs that are a goal's children. One loop → one
  card; standalone agent/pipeline runs are untouched. `useRunsQuery` now just calls it.
- **Kind lives in the detail** — `GoalDetailPanel`'s iteration timeline now shows each iteration's
  **maker kind** (agent/pipeline glyph + label), so "what it runs as" is answerable from the task
  detail (where the folded child run's execution surfaces).
- i18n `runs.goalMakerKind.{agent,pipeline}` (cs+en).

**Tests:** `run.test.ts` `mergeRunFeed` — a goal + its child agent/pipeline run → one card (child
folded); the claude verifier run folded; a standalone agent run kept; newest-first sort.
`GoalDetailPanel.test.tsx` — the maker kind is shown per iteration. web/DS green.

---

## Phase 8 — Multi-engagement scale

_Goal: the long-term purpose — several delivery engagements in parallel, the
operator only at the decision points._

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

## Phase 9 — Limit resilience: pause, checkpoint, auto-resume

_Goal: a subscription-limit outage is a **pause, not a failure**. A long
pipeline that exhausts the Claude 5h/weekly window halts cleanly, waits for
the window to reset, and continues from its last checkpoint — finished work
is committed and marked in the handoff docs, so nothing is ever
re-implemented from zero._

What exists today (verified 2026-06-12): `detect-limit.ts` already scans run
output for usage-limit signals and extracts the reset epoch, but its only
consumer (`onLimitHit`, `runner-core.ts:707`) just busts the LimitsService
cache; `LimitsService` reads the statusline capture
(`~/.claude/rate-limits.json`) with 5h/weekly windows + reset timestamps;
task `held`/`queued` states and pipeline `parked` exist with restart
survival — but every resume is manual or approval-driven. Missing entirely:
limit-classified run failures, automatic resume on window reset, checkpoint
commits/progress markers.

### 9.1 Limit-aware halt

- Classify the failure: when a run/stage dies **and** a limit signal was
  detected in its output (or LimitsService shows the window exhausted), the
  terminal status is a new `paused-limit` — not `error`, and not `parked`
  (it must not burn the loop's retry budget). Persist `resumeAt` in the run
  sidecar + aggregate `run.json` (priority: `resetsAt` from `detectLimit` →
  LimitsService window reset → conservative fallback backoff); survives API
  restart like every other persisted state.
- Pre-dispatch guard: `TaskSchedulerService` consults LimitsService before
  dispatching; an exhausted window queues the task with `resumeAt` instead
  of spawning a run that dies on its first request. The pipeline stage
  driver does the same check **between** stages — prefer halting at a phase
  boundary over mid-phase.
- Web: `paused-limit` badge in the runs feed + `RunDetail` shows a reset
  countdown ("resumes ~04:30").
- **Tests:** unit for the failure classifier (limit-shaped output vs
  ordinary error, resetsAt extraction priority); e2e (demo runner emits a
  fixture limit line): run → `paused-limit` with `resumeAt`; restart → state
  survives.

### 9.2 Auto-resume on window reset

- `LimitResumeService` on the existing scheduled-task tick: scan
  `paused-limit` runs and limit-queued tasks; when `now >= resumeAt` **and**
  LimitsService confirms actual headroom (the file may lag), resume —
  pipelines continue at the halted stage via the 1.2 stage-resume machinery
  (continue, never restart the pipeline), tasks re-enter the normal dispatch
  guards (budget → concurrency), so 8.1 caps still apply after the limit
  comes back.
- Bounded: max N auto-resume cycles per run, then `parked` for the operator
  — a flapping limit must not thrash forever (same philosophy as the
  delivery loop's finite retries).
- Tier 1 silent + recorded: activity-log entries for both pause and resume;
  the next briefing reads "pipeline X paused 2 h on the usage limit,
  resumed 04:30, finished" (Phase 6 wiring).
- **Tests:** unit for the resume scan against a fake clock + fake limits
  (not yet reset / reset-but-still-exhausted / reset-with-headroom /
  resume-cap exhausted → parked); e2e: `paused-limit` run + simulated reset
  → run continues from the same stage to `done`, activity log holds the
  pause/resume pair.

### 9.3 Checkpointed delivery — commit + mark progress

- The delivery pipeline commits as it goes, on its own run branch
  (`zibby/<runId>-…` worktree from 3.1): a checkpoint commit after each
  completed phase, and inside Kodér after each green verify pass —
  `zibby-checkpoint(<phase>): <summary>`. Local commits to ZIBBY's own
  branch are Tier 1 (nothing reaches the remote); the 3.2 push/PR gates are
  untouched.
- Progress markers in the handoff files: Architekt authors `plan.md` as a
  checkbox work plan; each phase ticks items off (`- [x]`) as they land,
  and the run dir keeps a `PROGRESS.md` (done / in-progress / next, linked
  to checkpoint commits). Updating these is part of "done" for every step
  in the agent prompts — files are the source of truth, so any future run
  can ground itself in what's already finished.
- Resume context injection: every resumed or retried phase — limit resume
  (9.2), parked resume-with-note (2.3), loop back-edge — gets a prefix
  assembled from `PROGRESS.md` + the checkpoint `git log`: "items 1–4 done
  and committed, continue with item 5, do not re-implement." Continuation,
  not restart.
- **Tests:** unit for checkpoint-commit assembly and `PROGRESS.md`
  round-trip/tick parsing; e2e on a fixture repo: kill a delivery run
  mid-pipeline after one checkpoint → resume → branch history shows the
  checkpoints, the resumed phase received the progress prefix, and no item
  was implemented twice.

**Phase exit criterion:** a seeded long pipeline halts on a simulated usage
limit, the operator does nothing, the window resets, and the run finishes —
the branch shows checkpoint commits, `plan.md` is fully ticked, and the
morning briefing accounts for the pause.

---

## Phase 10 — Loop engine: goals, verifier, work discovery

_Goal: promote ZIBBY from an "agent and pipeline launcher" into a **loop
engine** — it discovers work itself, proposes it through the gate, iterates a
maker against a separate verifier, persists every iteration to disk, and
parks when bounded effort is exhausted. The outer loop sitting above a single
run's inner loop — the capstone, not a new subsystem._

**Context.** "Loop engineering" (Osmani / Cherny / Steinberger, June 2026)
names the standard blocks — and ZIBBY already shipped nearly all of them:

| Loop-engineering block     | Where it lives here                                                     |
| -------------------------- | ----------------------------------------------------------------------- |
| Automations (heartbeat)    | core cron tick + Phase 5 triage                                         |
| Worktrees                  | Phase 3.1 (+ 8.2 parallelism, verified)                                 |
| Skills                     | core (`data/skills/`)                                                   |
| Connectors                 | Phase 5.1 integrations                                                  |
| Sub-agents (maker/checker) | Phase 2 delivery loop (`verify` stage, back-edges, escalation, parking) |
| Memory on disk             | Phase 4 vault lifecycle                                                 |
| Budget / cost              | Phase 8.1 `BudgetService` + `held` tasks                                |
| **"Hand off to you"**      | **approval gate + Tier 3 — ZIBBY's differentiator**                     |

What's missing is the connective tissue: the outer loop itself. Phase 10 is
therefore deliberately **thin glue over delivered machinery** — anything below
that smells like re-implementation of 2.x/3.x/6.1/8.1 is a design error.

### 10.1 `goal` task target + `GoalRun`

- Extend `TaskTargetSchema` (`libs/contracts/src/tasks/task.schema.ts`) with a
  fourth kind alongside `agent` / `pipeline` / `orchestrator`:
  `{ kind: "goal", id, … }`. New `goal.schema.ts` + `goal.contract.ts`
  following the pipeline pattern: a stored goal definition (objective, maker
  ref, verifier spec, `maxIterations`, budget) and a `GoalRunSchema` holding
  `iterations[]` (each: maker run ref, verifier verdict, tokens/cost),
  accumulated cost, and a `sessionId` for resumability.
- The maker step is an **existing executor** — a stored agent _or_ a full
  pipeline (the union nests); the goal runner dispatches it per iteration
  through the same runner seams, so demo mode stays the deterministic e2e
  seam and the mid-run approval gate applies unchanged inside every
  iteration.
- YAML frontmatter serialization extended with the goal/verifier definition
  (same file-backed conventions as agents/pipelines).
- **Tests:** contract/schema unit tests (union round-trip, frontmatter
  parse); e2e: create goal → dispatch → `GoalRun` file appears with
  iteration records (demo maker).

### 10.2 Verifier as a first-class stop condition

- Generalizes the 2.1 `verify` stage beyond a fixed pipeline: a verifier is a
  **verifiable predicate** — the deterministic project checks (reuse the
  verify-stage command assembly: lint/tsc/test, per-project override) and/or
  a separate claude pass on a cheaper model (reuse the per-phase
  model-override mechanism from 2.3; the verifier never shares the maker's
  session).
- Stop = verifier returns `satisfied` **or** `maxIterations` / budget (8.1
  `BudgetService`) exhausted. On exhaustion → `parked`, into the existing
  2.3 operator queue with the last verifier output as failure context;
  resume-with-note works unchanged. Failed verification feeds the next
  iteration as context — the Tester→Kodér feedback shape, generalized.
- **Tests:** unit for the stop-condition matrix (satisfied / iterations
  exhausted / budget exhausted / both) and verifier-context assembly; e2e:
  scripted verifier fails twice then passes → run is `done` with 3
  iterations; never-passes → `parked` with context.

### 10.3 Discovery triage — work finds itself

- A scheduled automation (existing automations tick — same pattern as the
  Phase 6 morning briefing) runs a `triage.skill.md` discovery skill: scan
  `git log`, failing tests, `daily/`, and open items in `MEMORY.md` → emit
  task **candidates**. _Proposed ≠ dispatched_ — discovery never starts a
  run.
- Proposals land in the **approvals queue** as a new `kind:
"proposed-task"` (the 5.3 `kind: "channel"` pattern) — the gate _is_ the
  inbox; no parallel surface, no new approval flow. Approving dispatches via
  the existing `createTask` path, so budget guard (8.1), concurrency queue
  (8.2) and outcome write-back (1.3) all apply for free.
- Discovery output is validated against a closed Zod schema, and scanned
  repo/vault content is data, not commands (Law 4) — a candidate can never
  carry gate overrides or raise its own tier.
- **Tests:** triage-skill unit tests on a fixture repo/vault (failing test →
  candidate, clean tree → none, injection-shaped commit message stays inert);
  e2e: automation tick → proposal in approvals queue, **no run started**;
  approve → task dispatched through the budget guard.

### 10.4 Loop run-log + resume + goal UI

- Per-iteration record on disk in the goal run dir (action, verifier
  verdict, tokens, cost) + activity-log entries (6.1) for dispatch/verdict/
  park — the accountable record stays append-only JSONL, the run dir holds
  the detail.
- `GoalRun` survives API restart via the existing reconciliation pattern;
  `sessionId` resumes the maker conversation instead of restarting —
  Phase 9.3's continuation-not-restart principle applied to the outer loop.
  A goal iteration that dies on a usage limit goes `paused-limit` (9.1)
  **without burning an iteration** of the goal's budget.
- Web: **goal task detail view** — polymorphic render alongside agent/
  pipeline in `/runs` + `RunDetail` (iteration timeline, verifier verdicts,
  cost bar vs. budget), TanStack Query per project conventions.
- **Tests:** unit for iteration-record round-trip and restart
  reconciliation; e2e: kill the API mid-goal → restart → run continues at
  the same iteration; web-components tests for the iteration timeline;
  Playwright: discovery proposal → approve → goal runs to done (demo mode).

**Hard invariants (restated, not new):** no auto-push, no auto-merge — ever
(3.2 locked floor, untouched); every proposed task and every transactional
action passes the approval gate; concurrent goals isolate via 3.1 worktrees
and respect 8.1 caps. Out of scope permanently: continual-learning /
self-optimizing evals ("agent slop" risk), concurrency beyond the budget cap.

**Phase exit criterion:** the discovery automation proposes a task from a
seeded failing test; the operator approves it from the queue; the goal
iterates maker → verifier, survives an API restart mid-loop, and either
finishes verifier-green or parks with its full iteration log — and nothing
reached the remote.

---

## Phase 11 — Unified task UX: one input, any execution

_Goal: collapse task entry to a **single described intent**. The operator says
what they want; ZIBBY decides whether that runs as an agent, a pipeline, or a
loop — the "how" becomes a preview behind the gate, never a form. Like Phase 10,
this is **thin glue over delivered machinery** (classifier, goal engine, gate,
projects), not a new subsystem._

**Context.** Standard task entry already does the right thing — describe →
`TaskClassifierService` routes → dispatch. But loops are stranded in a separate
manual tab (`LoopComposer`: maker / verifier / reviewer / iterations /
instructions) because the classifier _deliberately_ never routes to a goal
(`isCoherent`: `kind === "goal"` → reject). And detected paths (`extractPaths`)
end as removable keyword chips — they never become a folder grant. Phase 11
removes the second tab and turns paths into scoped permissions.

Full step-by-step plan, file map, and tests: **`plans/ux-simplification.md`**.

### 11.1 Classifier learns the loop shape

- Drop the blanket goal-exclude in `task-classifier.service.ts`; let routing
  return `kind: "goal"` with a **synthesized** definition (maker = matched
  agent/pipeline or orchestrator; verifier = project checks by default —
  reuse 2.1 assembly; default `maxIterations`; objective = the text).
- Two-legged signal: LLM router prompt gains a fourth "goal" option; the
  `KeywordScorer` fallback recognises loop cues ("until it passes", "dokud
  neprojde", "keep retrying"). Classify response gains `mode` + editable
  `proposedGoal` (`task.schema.ts`).
- **Tests:** loop-shaped text → `mode: loop` + checks verifier; ordinary text
  → agent/pipeline; `proposedGoal` contract round-trip; injection-shaped text
  stays inert (Law 4).

### 11.2 One composer, mode as preview not form

- Remove the Standard/Loop tabs from `NewTaskDialog`; one description field +
  schedule. A compact "ZIBBY will…" plan preview (reusing the `TaskRouting`
  surface) shows mode + target; an **"Edit"** disclosure exposes the old
  advanced fields, pre-filled from `proposedGoal` — power-user control kept,
  no longer mandatory.
- **Tests:** single-field render; loop-shaped submit dispatches a goal;
  disclosure round-trips defaults; low confidence still offers the manual picker.

### 11.3 Paths become scoped permissions

- Detected paths (in **every** mode) resolve against projects (`matchProject`):
  inside a project → "scoped to <project>" badge; outside → a gated **"grant
  access"** action that registers the folder as a workspace root (Tier 3) and
  becomes the run's `cwd`. Builds on 3.1 workspace manager.
- **Tests:** in-project path → badge; outside → grant action; grant
  creates/extends scope; run uses it as `cwd`; no auto-grant without the gate.

**Hard invariants (restated):** the gate is unchanged — unification touches
_entry_, not approval; advanced control survives in the disclosure;
synthesized goals are normal `<id>.goal.md` files; input is data, never
commands (Law 4).

**Phase exit criterion:** typing _or speaking_ "fix the failing test in
project X and keep going until it's green" into one field classifies as a loop,
shows the plan preview, offers the detected path as a folder grant, and — after
one confirmation — runs the goal, with zero hand-filled form fields and nothing
bypassing the gate.

---

## Phase 12 — Self-development safety: resource governance + meta-circular isolation

_Goal: make ZIBBY a safe target for its **own** loop engine. The "MEMORY BOMB"
(commit 96d1294, HEAD) — a Phase 10 goal loop pointed at the ZIBBY monorepo on
the dev server — exhausted machine RAM. The cause was not an infinite cycle or a
leaking buffer (both refuted) but **structurally unbounded heavy work with zero
resource governance, run against the very system that drives it**: when the
target IS ZIBBY, three identities collapse — process (the verifier's `pnpm test`
boots a second AppModule that `reconstruct()`s and re-dispatches the same goal),
filesystem (worktree + artifacts live inside the watched/tested tree), and
resources (no timeout/kill/cap/reaping). This phase restores that separation and
wires a resource floor under every run. **Prerequisite for safely pointing
Phase 10's loop engine at this repo.** Full verified RCA (file:line):
`docs/plans/phase-12.md`._

### 12.1 Scope/forbid the heavy default verifier

- A `{kind:"checks"}` goal verifier with no `commands` and no project `checks`
  falls through to `DEFAULT_VERIFY_CHECKS = ["pnpm lint","npx tsc --noEmit","pnpm
test"]` (`pipeline.schema.ts:45`, chain `verify-command.ts:23`) — the full
  monorepo suite, unscoped. Refuse the heavy default for goals: require explicit
  scope or park with a readable reason (`goal-runner.service.ts:390-396`).
- **Tests:** unit for the resolution change; e2e: no-scope checks-verifier parks,
  never runs full `pnpm test`.

### 12.2 Never run checks from inside the repo

- With no project/worktree, the verifier cwd falls back to `run.cwd` =
  `apps/api/data/goals/runs/<id>` (inside the repo), so `pnpm test` climbs to the
  root (`goal-runner.service.ts:394-396`). Skip/guard the checks verifier when
  `run.workspace`/project is absent instead of falling back to `run.cwd`.
- **Tests:** unit: no-project run never resolves cwd inside the repo; e2e: no
  in-repo suite spawned.

### 12.3 Resource governance in `runShell` + shutdown hook

- `runShell` spawns with no `detached`/`signal`/`timeout`, never stores or kills
  the child, output uncapped (`goal-runner.service.ts:419-433`); GoalRunnerService
  is the only background service without `onModuleDestroy` (`:71`). Add a per-call
  timeout, detached process-group spawn, child tracking, and a shutdown hook that
  `killGroup`s in-flight children — mirroring `RunnerCore.shutdown()`/`killGroup()`
  (`runner-core.ts:298-311,1083-1095`). Cap the output accumulator.
- **Tests:** unit: hung shell times out + is killed; shutdown reaps tracked
  children; output cap holds.

### 12.4 Gate `reconstruct()` re-dispatch (Law 3)

- `onModuleInit → reconstruct()` auto-re-dispatches every `running`/`paused-limit`
  goal on each boot/respawn (`:96-99,760-767`); under `ts-node-dev --respawn`
  (`package.json:6`) + `.env` `AGENT_RUNNER_MODE=claude` (`.env:4`) a restart alone
  spawns real claude. That is an autonomous action without approval — it violates
  Law 3 / Tier 3. Always rehydrate the registry; re-drive only behind explicit
  operator opt-in. Wrap fire-and-forget `drive()` in `.catch` (`:177,808-810`).
- **Tests:** unit: boot rehydrates but does not re-drive; opt-in resume drives; no
  unhandled rejection on dispatch throw.

### 12.5 Global e2e data-dir + runner-mode isolation

- 26 of 28 e2e suites boot AppModule (`app.module.ts:14,37`) but don't isolate
  `GOAL_RUNS_DIR`; `vitest.setup.ts` isolates only `ACTIVITY_DIR` (`:16-26`); the
  committed `.env` `AGENT_RUNNER_MODE=claude` leaks in (`limit-pause.e2e.test.ts:
70-73`). Extend the global setup to force a temp `ZIBBY_DATA_DIR`,
  `AGENT_RUNNER_MODE=demo`, and a fake `CLAUDE_BIN` before any boot — closing the
  meta-circular vector and the standing `pipelines.e2e` flake. Move runner mode out
  of the committed `.env`.
- **Tests:** the suite itself — full `pnpm test` never touches `apps/api/data`,
  never spawns real claude.

### 12.6 Eliminate double verification (done 2026-06-14)

- The delivery pipeline already verifies (`delivery.pipeline.md:38-44`, up to 4×
  per run), then `drive()` runs the goal verifier unconditionally
  (`goal-runner.service.ts:248`). Skip the second pass when the maker pipeline
  already passed an equivalent verify phase.
- **Tests:** unit: pipeline-maker that passed verify → goal verifier skipped;
  checks-maker → still verified.

### 12.7 Worktrees outside the repo

- Worktrees are cut at `path.join(root,"worktree")` under `GOAL_RUNS_DIR` — inside
  the watched/tested tree (`goal-runner.service.ts:151`). Relocate to
  `os.tmpdir()`/`ZIBBY_WORKTREE_ROOT`; keep only forensic artifacts in `data/`.
- **Tests:** unit: worktree path resolves outside the repo; cleanup removes it.

### 12.9 Synchronous reaping on shutdown (added + done 2026-06-14)

- `RunnerCore.shutdown()` (`runner-core.ts:298`) is `void` and only `killGroup`s its
  children without awaiting their exit, so `app.close()` returns while a SIGTERM'd
  child is still flushing its `.log` into the RUNS dir — the e2e `afterAll`'s `fs.rm`
  races it (`ENOTEMPTY`), and on a real signal the process can exit before reaping
  completes. Make `shutdown()` async: after `killGroup`, await each tracked child's
  `close` (bounded timeout, then `SIGKILL` escalation — mirror 12.3's `runShell`); the
  `AgentRunnerService`/`PipelineRunnerService` `onModuleDestroy` already await it.
  Root-caused while delivering 12.7 (worktree relocation alone did NOT fix the flake).
- **Tests:** the `pipelines.e2e`/`agent-runs.e2e` `ENOTEMPTY` is gone across repeated
  runs; a unit that `shutdown()` resolves only after a tracked child's `close`.

### 12.8 Durable self-development posture (done 2026-06-14 — closes Phase 12)

Delivered as `docs/ops/self-development.md` (builder ≠ subject runbook, defense-in-depth
layers, OS-sandbox recommendation, resource-governance-as-contract-dimension), Phase 12
env knobs in `docs/ops/environment.md`, and the guard test
`apps/api/src/shared/self-development.test.ts` (subject worktree never under the builder
tree). **Phase 12 is complete: 12.1–12.7 + 12.9 + 12.8 all green; ZIBBY is now a safe
target for its own loop engine.**

- Builder ≠ subject: the orchestrator runs from a pinned build, not `ts-node-dev`
  on the tree it edits. OS-level sandbox (container/cgroup memory+cpu cap) for the
  subject's verifier. Add a resource-governance dimension to the autonomy contract —
  per-run/per-goal compute + token budget wired into the floor like approval-first
  (composes with 8.1). Self-development runbook.
- **Tests:** documented runbook; budget-cap e2e (reuse 8.1); smoke that a goal
  targeting a sibling checkout never touches the builder's own tree.

**Phase exit criterion:** a goal targeting the ZIBBY repo itself runs to
completion or parks without ever (a) running the full monorepo suite from inside
the repo, (b) leaving an orphaned child after an API kill, (c) re-dispatching
itself on restart, or (d) exhausting RAM — and `pnpm test` is fully isolated from
live data and real claude. The blast-radius set 12.1–12.4 must be green before any
loop is pointed at this repo again.

---

## Phase 13 — Self-development payoff: enforced goal budget + the exit demonstration

_Goal: Phase 12 made the repo **safe** to target; Phase 13 is the **payoff** — wire the
one resource-governance piece 12.8 documented but didn't enforce (per-goal compute
budget), then prove the whole thing end-to-end with the Phase 12 exit demonstration.
Thin glue over delivered machinery (8.1 budget, goal loop, worktree isolation)._

### 13.1 Enforce the per-goal budget (done 2026-06-14)

- `GoalSchema.budget` (a `ProjectBudget`: `dailyRuns`/`weeklyRuns`) existed but was
  **completely ignored** — the goal loop only checked the *project* cap
  (`budgetOk(project)`, `goal-runner.service.ts:294`). Wire the goal's OWN budget into
  the per-iteration guard: count the goal's iterations within a rolling 24h/7d window
  from `run.iterations[].startedAt` (self-contained — no ledger), over-cap → park
  `budget` (existing reason). A windowed cap distinct from `maxIterations` (the total
  fuse). Composes with the project cap (both checked; either parks).
- **Tests:** unit for the windowed counter (under/at/over daily & weekly, no budget →
  always ok); e2e: a goal with `budget.dailyRuns: 1` parks `budget` after one iteration.

### 13.2 Self-development exit demonstration (done 2026-06-14)

- e2e in `goal-loop.e2e.test.ts`: a goal on a **sibling fixture checkout** finishes
  `done` with the worktree under `ZIBBY_WORKTREE_ROOT` (not in the repo/data tree), the
  subject's HEAD unmoved + working tree clean + a `zibby/*` branch present, and the
  scoped `["true"]` verifier passing (a full-repo suite would have failed → `done`
  proves no full-monorepo run). The Phase 12 exit criterion as an executable test.
  Orphan-reaping is already unit-covered (12.3/12.9). Also hardened the `briefing.e2e`
  ENOTEMPTY cleanup race (12.9 idiom).

### 13.4 Test stability under concurrent load (done 2026-06-14)

- The full 90-file e2e suite intermittently red ~1 assertion/run (a different suite each
  time — categories/projects/memory — all green isolated): concurrency/timing contention,
  not a cleanup race. Fix in `apps/api/vitest.config.ts`: cap forks to `max(2, cpus/2)`
  (default ~cpus-1 ran ~9 NestJS AppModule boots at once + per-fork 12.5 data seeding),
  widen `testTimeout`/`hookTimeout` to 30s, and bump `pipelines.e2e` `until` default
  10s→25s (demo-timing). Result: **5/5 consecutive full runs green (680/680), ~11.5s**.
  Both the under-load assertion class and the pre-existing pipelines demo-timeout flake
  gone.

### 13.3 launchd daemon + `GOAL_AUTO_RESUME` (done 2026-06-14 — closes Phase 13)

- Extended the existing `ops/com.zibby.api.plist` (Phase 8.3) with `GOAL_AUTO_RESUME=1`
  (installing the daemon = the operator's explicit opt-in to unattended operation, the
  one legitimate place auto-resume belongs per 12.4) + `ZIBBY_WORKTREE_ROOT`; documented
  the restart-resume semantics + self-development cross-ref in `docs/ops/deployment.md`;
  guard test `apps/api/test/launchd-plist.test.ts`. The behavior is already e2e-covered
  (goal-loop "restart with GOAL_AUTO_RESUME=1"). **Phase 13 complete: 13.1, 13.2, 13.4,
  13.3 all green; the full api suite is reliably 684/684.**

**Phase exit criterion:** a goal with a tight budget parks before exhausting it; the
self-development smoke proves a sibling-checkout goal never touches the builder tree.

---

## Phase 14 — Operator UX for the new goal/loop states

_The roadmap's Phases 1–13 are shipped. Phase 14 closes the UX gap they opened: the new
goal park reasons (`verifier-scope`, `awaiting-resume`) and the per-goal `budget` (12.x/13.1)
land in the data but render as raw enum strings with no operator-legible meaning. Thin web
glue over delivered contracts._

### 14.1 Surface goal park reasons + budget in the web UI (done 2026-06-14)

- `GoalDetailPanel` interpolated `parkedReason` as a RAW enum string. Add friendly cs/en
  i18n labels (`goalParkedReason.<reason>`) for all five reasons + a short hint line
  (esp. `verifier-scope`, which is a config fix, not a plain resume), rendered as a clear
  headline above the existing resume-with-note affordance. Add a **goal-budget bar** (when
  `goal.budget.dailyRuns`/`weeklyRuns` is set): windowed iteration count vs the cap,
  `warn` tone near/at the limit — mirrors the backend `goalBudgetExceeded` window.
- **Tests:** web-components — friendly label per reason; budget bar renders only when a
  budget exists and tones at the cap; raw enum never shown.

### 14.2 Refresh roadmap ground-truth + Playwright audit (done 2026-06-14)

- Rewrote the stale "Where we are today (verified 2026-06-11)" block + gap table — every
  North-Star gap is delivered (the table now names the phase that closed each) + a Phases
  9–14 summary; tests line corrected (7 Playwright specs, ~91 api files, 684/684).
- Ran `pnpm e2e` (Playwright, chromium, 1 worker, boots api+web dev): **8–9 of 10 green.**
  Fixed a REAL pre-existing failure — `pipeline-run.spec` waited for a `/Run · max/`
  button that no longer exists (label drifted to `pipelineRun.launch` = "Run pipeline",
  shared with the trigger); scoped the launch click to the dialog. Verified green across
  runs.
- **Parked (→ 14.3):** `approval.spec` + `channels.spec` flake intermittently — both
  manipulate the shared approvals queue against the single long-lived dev server
  (`workers:1`, one `data-test` dir), so accumulating cross-spec state interferes. NOT a
  latency issue (a 45s bump didn't help) — a test-isolation gap. The 8 deterministic specs
  (memory-graph ×5, briefing, pipeline-edit, pipeline-run) are stable.

### 14.3 Playwright cross-spec isolation (done 2026-06-14)

- Three compounding defects flaked `approval.spec`/`channels.spec`: (1) text-soup
  selection — a greedy `.first()` "Approve" approved the *channel* card (the agent card
  is a high-risk HoldButton, the channel card a plain Button), making the two specs fight
  over one approval (a clean seesaw); (2) `.e2e-data` approvals were never drained, so
  repeated runs piled up agent cards; (3) the gated run spawned REAL `claude` — slow and
  often never gating in 20s. Fixed: a kind-scoped `data-testid=approval-card-{kind}` on
  `ApprovalCard` (no more text-soup), a global-setup that drains the queue (API reject, so
  it clears the reused server's in-memory copy) and then polls until both seeded approvals
  are pending, and `CLAUDE_BIN`→`fake-claude.mjs` + a benign `FAKE_CLAUDE_INTENT` so the
  `requires_approval` agent (→ catch-all `ask`) produces ONE token-free pending approval.
  Both specs now assert the durable outcome (card leaves the queue / inbox handled), not
  the transient optimistic UI. Result: `pnpm e2e` 10/10 across 3 repeated local runs
  (~48s, down from ~1.1m). **Closes Phase 14.**

**Phase exit criterion:** a parked goal shows a human-legible reason + the right next
action; a budgeted goal shows its windowed cap; no raw enum reaches the operator; the
roadmap header reflects reality and `pnpm e2e` is green (14.3).

---

## Phase 15 — Re-enable the Playwright e2e job in CI

_The `e2e.yml` ubuntu `playwright` job has been gated to `workflow_dispatch`-only since
Phase 8.3, DISABLED for two stated reasons: (a) "the approval throughline needs the
`claude` binary, which isn't installed on the runner" and (b) "the cold-start dev-server
path is flaky". **Phase 14.3 removed both.** The suite is now token-free (`playwright.config.ts`
apiEnv points `CLAUDE_BIN` at the committed `fake-claude.mjs` stub) and cold-start-deterministic
(global-setup drains + presence-gates the approvals queue; the gated agent approval is a
deterministic stub intent). So the e2e gate can finally run on every PR. Thin CI glue — no
runtime code changes._

### 15.1 Prove the cold-server path, then re-enable the job (done 2026-06-14)

- **Proof first.** `CI=true pnpm e2e` forces `reuseExistingServer: false`, so Playwright
  boots its OWN fresh api+web servers and tears them down — the exact path a CI runner
  takes (GitHub Actions sets `CI=true` by default). Verified **3/3 green (~50s)** on the
  cold path locally; this also closes the 14.3 caveat that the isolation was only proven on
  a *reused* dev server.
- **Re-enable.** Drop the `if: workflow_dispatch`-only gate on the ubuntu `playwright` job
  so it runs on `pull_request` (the gate's feedback loop) + `workflow_dispatch`, while the
  existing self-hosted macOS job keeps push-to-`main` coverage — no double-run on push.
  Refresh the DISABLED note to record that 14.3 unblocked it; keep the job OUT of required
  branch-protection until it has a CI track record (the existing philosophy).
- **Guard test** (`apps/api/test/e2e-workflow.test.ts`, mirrors `launchd-plist.test.ts`):
  static assertions that the playwright job is no longer dispatch-only / runs on PR, caches
  `~/.cache/ms-playwright` keyed on the Playwright version, runs the suite, and uploads the
  report; plus that `playwright.config.ts` pins the fake-claude `CLAUDE_BIN` (the token-free
  guarantee the CI runner depends on). A trimmed workflow or a dropped stub would silently
  re-break CI overnight — guard the load-bearing shape, not the runner.

**Phase exit criterion:** the ubuntu e2e job runs on PRs (proven green on the `CI=true`
cold path locally), token-free, with browser caching and report upload; the guard test
pins the workflow + stub shape; nothing pushed (the PR is the gate).

---

## Phase 16 — CI e2e flake safety net (retries + trace-on-retry)

_Phase 15 turned the ubuntu Playwright job on for PRs, but `playwright.config.ts` still has
`retries: 0`, so its `trace: "on-first-retry"` can never fire — a single browser hiccup on a
CI runner reds a PR with zero diagnostic. The 2026 standard for a freshly-CI'd suite is a
bounded safety net: retry only in CI (never mask flakes locally), and capture a trace +
screenshot + video on the retry so the Trace Viewer has something to open. Thin config + CI
glue, no runtime code._

### 16.1 Retry-in-CI + diagnostic artifacts (done 2026-06-14)

- `playwright.config.ts`: `retries: process.env.CI ? 2 : 0` (a genuine one-off retries and
  passes; a real failure still fails on every attempt; local runs keep `0` so flakes surface
  loud, never silently retried). Add `screenshot: "only-on-failure"` + `video:
  "retain-on-failure"` alongside the existing `trace: "on-first-retry"` so the retry leaves a
  full diagnostic bundle in `test-results/`.
- `e2e.yml`: both jobs already upload `playwright-report/`; also upload `test-results/`
  (where the trace `.zip` / video / screenshot land) so the diagnostic is actually
  retrievable from the CI run, not just the HTML summary. `if: ${{ !cancelled() }}` and
  `if-no-files-found: ignore` keep it green when there's nothing to upload (the happy path).
- **Proof:** a throwaway spec that fails on attempt 0 and passes on `testInfo.retry > 0`,
  run under `CI=true`, confirms the retry path actually retries-then-passes (then deleted —
  not committed). The real suite stays green locally (`retries: 0` → behaviour unchanged).
- **Guard test** (extend `apps/api/test/e2e-workflow.test.ts`): assert `playwright.config`
  carries `retries: process.env.CI ? 2 : 0` and the failure-artifact settings, and that
  `e2e.yml` uploads `test-results/`. Static-content guard — a silent revert to `retries: 0`
  would quietly re-arm the no-diagnostic-flake foot-gun.

**Phase exit criterion:** a CI e2e run retries a flaky test up to twice and uploads a trace
on the retry; local `pnpm e2e` behaviour is unchanged (no retries); the guard test pins the
retry + artifact shape; nothing pushed.

---

## Phase 17 — Real voice input (live speech-to-text)

_Delivers the STT half of **§7.1**. The voice screen has shipped as a styled
JARVIS takeover from the start, but the session under it (`useVoiceDemoSequence`)
is a scripted timer — the mic cycles a hardcoded `demo.*` conversation; nothing
captures audio. A code-level gap analysis (not roadmap claims) found this the
**only** real user-facing mock left, and the highest-priority functional gap
under LOOP.md (a North-Star JARVIS capability, mock → real). No `phase-7` commit
ever landed. Full plan: `docs/plans/phase-17.md`._

### 17.1 Real `SpeechRecognition` behind a live/demo seam

- `useSpeechRecognition` wraps `window.SpeechRecognition ?? webkitSpeechRecognition`
  (SSR-guarded, resolved once): `continuous` + `interimResults`,
  `{ isSupported, isListening, transcript, interim, error, start, stop }`, error
  mapped to a closed union (`mic-denied | unsupported | network |
  service-denied`; `no-speech`/`aborted` suppressed), bounded silent-drop restart
  (Chrome drops continuous sessions after ~60 s — restart while active, capped at
  5, reset on each real result).
- `useVoiceSession` is the single seam the screen consumes (extended
  `VoiceSession`: `mode`, `state`, `transcript`, `interim`, `isSupported`,
  `error`, `toggleMic`); `mode` = `live` when supported else `demo`, demo path
  delegates to the existing scripted sequence unchanged. `VoiceScreen` shows the
  real utterance + interim ghost text and hands the **real** transcript to the
  Phase-11.4 composer seam (`createTask`); unsupported → fallback note.
- **Tests:** a jsdom `MockSpeechRecognition` (`vitest.setup.tsx`) + hook unit
  tests (start/stop, final/interim, error→union mapping, silent-drop restart cap)
  + a `VoiceScreen` live/unsupported render test. Include glob extended to cover
  `features/*/hooks/**`.

**Phase exit criterion:** in a supporting browser the mic captures a spoken
utterance and routes the real transcript to the composer; unsupported browsers
and CI fall back to the deterministic demo; `pnpm test` green, nothing pushed.
**Next (→ Phase 18):** TTS (`useSpeech`) — speak outcomes/approvals aloud.

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
Phase 8 (scale)      — needs 3 (worktrees) + 6 (per-engagement briefing)
Phase 9 (limit resilience) — needs 1.2 (stage resume), 3.1 (worktrees → checkpoint
                       commits), 8.1 (limits/budget plumbing); 9.1+9.2 can land
                       before 9.3 (task/pipeline pause-resume without checkpoints)
Phase 10 (loop engine) — needs 2 (verify stage, parking, escalation), 3.1+3.2
                       (worktrees, gated push), 4 (vault for discovery), 5.3
                       (approval-queue kind pattern), 6.1 (activity log),
                       8.1 (budget). Phase 9 is complementary, not blocking —
                       but 9.1 should land first so a limit hit inside a goal
                       iteration pauses instead of burning the iteration budget
Phase 11 (unified UX) — needs 10.1/10.2 (goal engine) for 11.1-11.2; 3.1
                       (workspace manager) for 11.3; 11.1+11.2 deliver the core
                       simplification and can ship alone
Phase 12 (self-development safety) — hardens 9.x/10.x machinery; depends on the
                       goal loop (10) existing. 12.1–12.4 are the blast-radius
                       fixes and a PREREQUISITE for pointing the Phase 10 loop
                       engine at the ZIBBY repo itself; 12.5 also fixes the
                       standing pipelines.e2e flake and can land immediately
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
