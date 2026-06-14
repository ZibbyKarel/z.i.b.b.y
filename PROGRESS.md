# ZIBBY — Loop Progress

> Phased self-development on the current branch. One loop iteration = one phase
> slice, design → implement → verify → checkpoint → record. Full roadmap:
> [ROADMAP.md](ROADMAP.md); per-phase plans in [docs/plans/](docs/plans/).

## Phase 17: real voice input (live STT) — ✅ COMPLETE (2026-06-14)

The first **functional** slice since Phase 13 (14–16 were test-infra/CI, which
LOOP.md disqualifies as phases). A code-level gap analysis found the only real
user-facing mock left: the **voice operator interface** — a North-Star JARVIS
capability the roadmap wrongly marked ✅ done. The styled takeover shipped early,
but the session under it (`useVoiceDemoSequence`) was a `setTimeout` script
replaying a hardcoded `demo.*` conversation; no `phase-7` commit ever landed.
Plan: [docs/plans/phase-17.md](docs/plans/phase-17.md). Delivers the STT half of
ROADMAP **§7.1**.

| Item | Status | Notes |
| ---- | ------ | ----- |
| 17.1 Real `SpeechRecognition` behind a live/demo seam | ✅ done (2026-06-14) | `useSpeechRecognition` (SSR-guarded ctor resolve, `continuous`+`interimResults`, closed-union error mapping, bounded silent-drop restart) + `useVoiceSession` (one `VoiceSession` shape over live STT *or* the scripted demo; `mode`=live when supported else demo). `VoiceScreen` now shows the real utterance + interim ghost, hands the **real** transcript to the Phase-11.4 composer seam, surfaces recognition errors (`role="alert"`) + an unsupported note. jsdom `MockSpeechRecognition` test helper; hooks-glob added to `vitest.components.config.ts`. **web-components 228/228, full `pnpm test` 1389/1389, lint+web-tsc clean.** Demo stays the deterministic fallback (unsupported browsers + CI). |

**Out of scope (→ next):** TTS (`useSpeech` — speak outcomes/approvals aloud),
`parseUtterance` action grammar (approve/reject/stop/navigate cs+en), reconnect
backoff ladder, Chrome on-device opt-ins, Settings → Voice, wake word.

## Phase 12: self-development safety — ✅ COMPLETE (2026-06-14)

Make ZIBBY a safe target for its own loop engine (the "MEMORY BOMB" RCA).
**All items 12.1–12.9 done; full suite 672/672 green.** ZIBBY may now be pointed at
its own repo under the [self-development runbook](docs/ops/self-development.md).
Detailed plan + verified RCA: [docs/plans/phase-12.md](docs/plans/phase-12.md).

## Phase 13: self-development payoff — ✅ COMPLETE (2026-06-14)

The payoff of Phase 12: enforce the last governance piece + prove it end-to-end.
**All of 13.1–13.4 done; full api suite reliably 684/684.**
Plan: [docs/plans/phase-13.md](docs/plans/phase-13.md).

## Phase 14: operator UX for the new goal/loop states — ✅ COMPLETE (2026-06-14)

Closes the UX gap Phases 12/13 opened (raw enum park reasons, unshown goal budget) and
hardens the Playwright e2e suite. **14.1–14.3 done; `pnpm e2e` 10/10 across 3 runs.**
Plan: [docs/plans/phase-14.md](docs/plans/phase-14.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 14.1 Surface goal park reasons + budget (web) | ✅ done (2026-06-14) | friendly cs/en labels for `verifier-scope`/`awaiting-resume`/`budget`/… + next-step hints + a goal-budget bar (windowed runs vs `goal.budget`); raw enum no longer shown. web-components 211/211 |
| 14.2 Roadmap ground-truth refresh + Playwright audit | ✅ done (2026-06-14) | rewrote stale "Where we are today" (all gaps closed); ran `pnpm e2e` → fixed real `pipeline-run.spec` label drift (verified green); parked approval/channels cross-spec contamination → 14.3 |
| 14.3 Playwright cross-spec isolation | ✅ done (2026-06-14) | three compounding defects: text-soup selection (greedy `.first()` "Approve" approved the wrong card → approval/channels seesaw), `.e2e-data` approvals never drained (piled up across runs), and real `claude` for the gated run (non-deterministic). Fixed: kind-scoped `data-testid=approval-card-{kind}`, global-setup drains+gates the queue, `CLAUDE_BIN`→`fake-claude.mjs`+benign intent (token-free, `requires_approval`→catch-all `ask`), durable-outcome asserts. **`pnpm e2e` 10/10 across 3 runs (~48s); web-components 211/211. CLOSES PHASE 14.** |

## Phase 15: re-enable the Playwright e2e job in CI — ✅ COMPLETE (2026-06-14)

14.3 made the e2e suite token-free + cold-start-deterministic, removing the two reasons
the ubuntu `playwright` job in `e2e.yml` was DISABLED (`workflow_dispatch`-only). Phase 15
flipped that gate back on for PRs — thin CI glue, no runtime code. Plan:
[docs/plans/phase-15.md](docs/plans/phase-15.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 15.1 Prove cold path + re-enable ubuntu e2e job + guard test | ✅ done (2026-06-14) | proved the CI path locally first — `CI=true pnpm e2e` (forces `reuseExistingServer:false` → fresh boot, GHA's path) **3/3 green ~50s** (also closes the 14.3 "reused-server only" caveat); flipped the ubuntu `playwright` job gate `workflow_dispatch`-only → `if: github.event_name != 'push'` (PR + dispatch; self-hosted macOS keeps push-to-main, no double-run); refreshed the DISABLED note; guard test `apps/api/test/e2e-workflow.test.ts` pins the job shape + the fake-claude `CLAUDE_BIN`. api 688/688, lint+typecheck clean. **CLOSES PHASE 15.** |

## Phase 16: CI e2e flake safety net — ✅ COMPLETE (2026-06-14)

Phase 15's CI e2e job ran with `retries: 0`, so its `trace: "on-first-retry"` was dead
config — a single browser hiccup reds a PR with no diagnostic. Phase 16 adds the bounded
retry-in-CI safety net + on-retry artifacts. Plan: [docs/plans/phase-16.md](docs/plans/phase-16.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 16.1 Retry-in-CI + diagnostic artifacts + guard | ✅ done (2026-06-14) | `playwright.config`: `retries: process.env.CI ? 2 : 0` (CI-only; local stays loud) + `trace:"on-first-retry"` / `screenshot:"only-on-failure"` / `video:"retain-on-failure"`; `e2e.yml` both jobs also upload `test-results/`. **Proved the retry path** with a throwaway spec (`expect(testInfo.retry).toBeGreaterThan(0)`) under `CI=true` → Playwright reported "1 flaky" (failed attempt 0, passed retry); deleted, not committed. Real suite `CI=true pnpm e2e` 10/10 (no spurious flaky); guard test extended (api 691/691); lint+typecheck clean. **CLOSES PHASE 16.** |

| Item | Status | Notes |
| ---- | ------ | ----- |
| 13.1 Enforce the per-goal budget | ✅ done (2026-06-14) | `GoalSchema.budget` was dead schema; now `goalBudgetExceeded()` (windowed run-count from `iterations[].startedAt`) parks `budget` at the iteration boundary. Composes with the 8.1 project cap. 679/679 green |
| 13.2 Self-development exit demonstration | ✅ done (2026-06-14) | e2e in `goal-loop.e2e`: a goal on a sibling fixture checkout finishes `done` with the worktree under `ZIBBY_WORKTREE_ROOT` (not in the repo/data), the subject's HEAD unmoved + tree clean + a `zibby/*` branch present, scoped `["true"]` verifier (no full-repo suite). Also hardened `briefing.e2e` ENOTEMPTY (12.9 idiom). 680/680 green |
| 13.4 Test stability under concurrent load | ✅ done (2026-06-14) | `vitest.config.ts` cap forks `max(2,cpus/2)` + `testTimeout/hookTimeout 30s` + `pipelines.e2e until` 25s. **5/5 consecutive full runs green (680/680)** |
| 13.3 launchd daemon + `GOAL_AUTO_RESUME` | ✅ done (2026-06-14) | plist gains `GOAL_AUTO_RESUME=1` + `ZIBBY_WORKTREE_ROOT`; deployment.md resume-semantics + self-dev cross-ref; guard test. **CLOSES PHASE 13** |

| Item | Status | Notes |
| ---- | ------ | ----- |
| 12.5 Global e2e data-dir + runner-mode isolation | ✅ done (2026-06-14) | temp `ZIBBY_DATA_DIR` (seeded, volatile filtered) + `AGENT_RUNNER_MODE=demo` + fake `CLAUDE_BIN` in `vitest.setup.ts`; `data-dir.ts` VITEST tripwire. Full `pnpm test` no longer touches `apps/api/data` or spawns real claude. 643/643 api tests green. |
| 12.1 Scope/forbid heavy default verifier | ✅ done (2026-06-14) | goal `checks` verifier with no commands + no project checks parks `verifier-scope`, never runs full-repo `DEFAULT_VERIFY_CHECKS` |
| 12.2 Never run checks from inside the repo | ✅ done (2026-06-14) | verifier `spawnCwd` never falls back to `run.cwd`; no worktree/project → park `verifier-scope`. Pure `checksVerifierBlocker` + `drive()` pre-flight park + `runVerifier` floor |
| 12.3 Resource governance in `runShell` + shutdown hook | ✅ done (2026-06-14) | detached pgid spawn + wall-clock timeout (SIGTERM→SIGKILL) + `liveShells` tracking + `onModuleDestroy` reaping + output cap; `main.ts` now `enableShutdownHooks()` so reapers fire on SIGTERM |
| 12.4 Gate `reconstruct()` re-dispatch (Law 3) | ✅ done (2026-06-14) | rehydrate always; boot parks live goals `awaiting-resume` (no auto-dispatch) unless `GOAL_AUTO_RESUME=1`; all `drive()` sites `.catch(onDriveError)` |
| 12.6 Eliminate double verification | ✅ done (2026-06-14) | `PipelineRun.verifyCommands` marker (runner-set from real execution); goal `makerAlreadyVerified()` skips `runVerifier` only when resolved commands provably equal. 669/669 api green |
| 12.7 Worktrees outside the repo | ✅ done (2026-06-14) | shared `worktree-root.ts` (not from data root); all 3 runners cut worktrees in `ZIBBY_WORKTREE_ROOT`/`os.tmpdir()`. Does NOT fix the `ENOTEMPTY` flake (that's the RunnerCore shutdown-await race → 12.9) |
| 12.9 Synchronous reaping on shutdown | ✅ done (2026-06-14) | `RunnerCore.shutdown()` async, awaits child exit + log flush (SIGTERM→SIGKILL); e2e cleanups use `fs.rm` `maxRetries/retryDelay` (the real flake fix). `ENOTEMPTY` gone across 6 runs; suite hit 660/660 |
| 12.8 Durable self-development posture | ✅ done (2026-06-14) | `docs/ops/self-development.md` runbook (builder ≠ subject, OS sandbox, defense-in-depth, resource-gov-as-contract) + env knobs doc + guard test (subject worktree never under builder tree). **CLOSES PHASE 12** |

**Blast-radius prerequisite** (must be green before pointing the loop at this repo):
12.1–12.4 — ✅ **COMPLETE** (2026-06-14). 12.5 landed first as the safety foundation
(it protects every subsequent `pnpm test` from re-arming the bomb). Remaining 12.6–12.8
are waste/blast-radius reduction + durable posture, not prerequisites.

### Parked / known flakes

- ~~`pipelines.e2e`/`agent-runs.e2e` `ENOTEMPTY`~~ — **FIXED in 12.9** (e2e cleanups now
  use `fs.rm` `maxRetries/retryDelay` + shutdown awaits reaping). Gone across 6 runs.
- `pipelines.e2e` "seeded delivery pipeline > red verify loops back to koder, then
  finishes green" — intermittent demo-timeout assertion flake (the documented
  `project_api_flaky_pipeline_e2e`); passed 6/7 recent runs. Demo-runner timing, NOT a
  cleanup race. Separate from the ENOTEMPTY work.
- ~~Under-load assertion flakiness~~ — **FIXED in 13.4** (`vitest.config.ts`: fork cap +
  wider timeouts + pipelines `until` 25s). 5/5 consecutive full runs green. The full
  `pnpm test` (api) is now reliably 680/680.

## Phase 14: operator UX for the new goal/loop states — ✅ COMPLETE (2026-06-14)

14.1–14.3 done. Goal park reasons + budget are operator-legible (14.1); the roadmap's
ground truth is current (14.2); and `pnpm e2e` is reliably green (14.3 — 10/10 across 3
repeated local runs, and ~2× faster now that the gated agent run is a token-free stub).

## Phase 17: live STT voice input — ✅ COMPLETE (2026-06-14)

The voice screen's scripted demo timer is replaced by real `SpeechRecognition` behind a
`live | demo` seam (`useSpeechRecognition` + `useVoiceSession`); a real transcript flows to
the unified composer. (The earlier "a11y smoke" proposal was dropped — it's test-infra, not a
valid LOOP.md phase; voice was the real functional gap.)

## Phase 18: voice command bridge (speech → action) — ✅ COMPLETE (2026-06-14)

ROADMAP §7.2 minus TTS. Spoken commands now **act**: `parseUtterance` (pure, cs/en,
diacritics-insensitive) maps an utterance to a closed `VoiceAction` union
(approve/reject/stop/navigate/close/createTask); `runVoiceAction` (pure executor) +
`useUtteranceDispatch` wire it to the real approve/reject/stop mutations + Next router;
`VoiceScreen` dispatches each finalized utterance once and announces the ack in an aria-live
region. Concise-word guard keeps dictated "approve the budget…" a task, not a gate decision.
Nothing bypasses the gate. web/DS 1442/1442; apps/web tsc clean; api 690/691 (the 1 = the
known `pipelines.e2e` demo-timeout flake, passes isolated).

## Phase 19: TTS read-back (`useSpeech`) — ✅ COMPLETE (2026-06-14)

ROADMAP §7.1 second half — ZIBBY speaks. `useSpeech` (SSR-safe `speechSynthesis`: voices via
`voiceschanged`, exact-locale→localService→prefix→default voice selection, utterance held in
ref until onend, cancel-before-speak, always set lang). `VoiceScreen` speaks each command ack
once (ref-debounced), the dead speaker button is now a mute toggle (aria-pressed, struck glyph),
orb/status gain a `speaking` state. `test/speechSynthesisMock.ts` stub (jsdom has no TTS).
web/DS+api **1452/1452**, apps/web tsc + lint clean. The voice loop is now bidirectional:
spoken task → run → spoken command result.

## Phase 20: spoken butler's briefing + run-outcome announce — ✅ COMPLETE (2026-06-14)

Finishes §7.2's "voice reads outcomes/approvals aloud". `briefing.ts` (pure):
`summarizeBriefing` → facts (running agents, pending approvals + top, recent done/error, quiet)
+ `pickNewlyFinished(announced, recent)`. `VoiceScreen`: a "Brief me" button speaks a template-
first cs/en summary (explicit → speaks through mute); an effect announces runs reaching a
terminal state *while voice is open* (seeded from first feed so history isn't replayed). web/DS+
api **1459/1459**, tsc + lint clean. The core voice loop is complete: **listen → command →
speak → brief**.

## Phase 21: skill edit + delete in the UI — ✅ COMPLETE (2026-06-14)

Closed the §7.3 "skill edit/delete" gap. Code-level gap analysis (not roadmap claims) found
global search + skill-category CRUD were already wired; only per-skill edit/delete was missing
— and the contract + API already supported it (`updateSkill`/`deleteSkill`). Pure web wiring:
`useSkillQuery` (single, fetches the body the list omits) + update/delete mutations,
`AddSkillModal` edit mode (prefill + Save + Delete), `SkillTile` clickable → editor. web/DS+api
**1464/1464**, tsc + lint clean.

## Phase 22: Settings → Voice TTS voice picker — ✅ COMPLETE (2026-06-14)

Closed the §7.3 voice-picker item. Verified FIRST that pipeline edit/duplicate (the prior
candidate) is already fully wired — roadmap 2.2 "stub" text was stale. Delivered `voicePreference`
(localStorage voiceURI), `useSpeech` honours it at speak-time, `VoiceVoiceSetting` (DS Dropdown of
voices + Test button) in Settings. Test-env fix: in-memory localStorage in vitest.setup (Node 25's
experimental global Storage shadows jsdom's). web/DS+api **1472/1472**, tsc + lint clean.

## Phase 23: conversational voice dispatch (North-Star realignment) — ✅ COMPLETE (2026-06-14)

The operator rewrote `north-star.md` to make **Voice a conversation, not a command line** —
"no 'new task' form to confirm — when ZIBBY understands the intent, it dispatches to the same
`/tasks` layer the HUD drives, on its own, and tells you it has while the work runs." The old
voice path staged a spoken task into the **NewTaskDialog composer** (a confirm modal),
conflating "did I understand you" (the conversation's job, never a modal) with the gate.
Phase 23 closes that one structural conflict. Plan: [docs/plans/phase-23.md](docs/plans/phase-23.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 23.1 Dispatch-and-narrate (replace the composer seam) | ✅ done (2026-06-14) | `runVoiceAction` `createTask` branch → `dispatchTask` (was `stageTask`/`openNewTask`), returns a `dispatching` ack echoing the understood text; empty utterance → `heard` no-op. `useUtteranceDispatch` owns `useCreateTaskMutation` and fires `createTask({text,paths})` directly (Phase-11 backend classifier routes agent/pipeline/orchestrator), flipping the ack `dispatching → started`/`dispatchFailed`; **no navigation** — overlay stays open, the new run appears in the live "Active agents" panel. `VoiceScreen` drops `useNewTask`/`openNewTask`; auto-dispatch + the relabelled **Send** button both go through `dispatch`; TTS narrates the dispatch ack. Gate untouched (spoken approve/reject still answer it). i18n `voice.ack.{dispatching,started,dispatchFailed}` + `voice.send` (cs+en). Tests: `runVoiceAction` dispatch-not-stage + empty no-op; new `useUtteranceDispatch.test` (createTask wiring + paths, ack transitions, error path, gate-answer path, no navigate); `VoiceScreen` Send-dispatch-no-exit + spoken-ack. **Full workspace 1479/1479** (DS+contracts+forms+api+web), lint + web-tsc clean. |

**Scope kept small (LOOP.md):** `parseUtterance`'s gate/control grammar (approve/reject =
spoken gate, endorsed by the North Star; stop/navigate/close = control affordances) is
unchanged — a later "Claude behind the channel" phase subsumes it. Voice-driven loop/goal
synthesis and live run-event *streaming* narration are deferred.

## Phase 24: voice status is pull, not push (operator feedback) — ✅ COMPLETE (2026-06-14)

Operator mid-loop: _"Logy běhu hlásit nechci ve voice UI. Co se děje bych měl dostat jen v
případě že se zeptám. Dát prostě briefing místo čtení logů."_ — **voice must not push run
logs/status; status is given only when asked, as a briefing.** This redirected my originally
proposed "live run-event narration" Phase 24 (correctly killed — it would have been exactly the
unwanted log narration) and refines North-Star conflict #3: "narration" = the Phase-23 dispatch
acks, NOT a play-by-play. Plan: [docs/plans/phase-24.md](docs/plans/phase-24.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 24.1 Stop pushing status; pull-by-ask briefing | ✅ done (2026-06-14) | Removed the Phase-20 auto-announce of runs finishing while voice is open (an unasked push) — `VoiceScreen` reordered so `useSpeech` + briefing callbacks sit above `useUtteranceDispatch`. Added an **ask-by-voice** path: `parseUtterance` `briefing` action (cs/en exact-phrase set: "co se děje", "status", "shrnutí", "what's happening", "brief me"…; a longer "co se děje s buildem" stays a task), `runVoiceAction` routes it to a `brief()` handler that speaks the existing `summarizeBriefing` template — spoken question + the "Brief me" button are the two pull paths; the `briefing` ack is visual-only (TTS suppressed, `brief()` already spoke). Deleted dead `pickNewlyFinished`/`FinishedRun` from `briefing.ts`. i18n `voice.ack.briefing` (cs+en). Tests: parse briefing phrases + longer-stays-task; run brief(); dispatch onBrief-not-createTask; VoiceScreen does-NOT-auto-announce; briefing.test drops pickNewlyFinished. **Full workspace 1490/1490**, lint + web-tsc clean. |

**Principle captured** ([[feedback_voice_status_pull_not_push]]): ZIBBY's voice surface is **quiet
competence, pull over push** — never stream status/logs unprompted; summarize when asked. Echoes
CLAUDE.md "notify only when genuinely relevant."

## Phase 25: turn-by-turn voice clarification — ✅ COMPLETE (2026-06-14)

North Star: "what you want is resolved in the dialogue itself, turn by turn." Phase 23 dispatched a
spoken task immediately; when the classifier is **low-confidence** that routed blind. Phase 25 adds
the missing turn: ambiguous → ask, the answer resolves it. Plan:
[docs/plans/phase-25.md](docs/plans/phase-25.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 25.1 Classify-first + bounded clarification | ✅ done (2026-06-14) | `useUtteranceDispatch` now runs the read-only `classifyTask` before dispatching: high/medium confidence → `createTask` (as before); **low** (`isLowConfidence` < 0.4) → set `pendingClarify` + a `clarify` ack reading back the top candidate names ("Nejsem si jistý — můžeš upřesnit? Třeba: Kodér, Delivery."). The **next** utterance combines with the original and dispatches **regardless** of confidence (bounded — one round, never a second ask → always terminates). The optimistic `dispatching` ack is now **visual-only** ("Slyším: {task}"); ZIBBY speaks only the *outcome* (clarify / started / failed). `runVoiceAction` + `clarify`/`clarifyGeneric` keys + `values.options`; `VoiceScreen` `SILENT_ACKS` skip-set. i18n reworded `dispatching` + added clarify keys (cs+en). Gate untouched; `live|demo` deterministic; STT/TTS stays free (classifier is the Phase-11 deterministic router, no model call). Tests: low-conf→clarify (no createTask); clarification answer→combined dispatch, no re-classify; high-conf one-shot; gate answers never classify. **web/DS green (voice 113), api 691/691 in isolation.** The full-`pnpm test` reds were the known under-load api e2e flakes (all 6 vitest projects contending → e2e timeouts; web-only change, count varies run-to-run 3→1; each passes isolated). |

## Phase 26: HUD runs feed — one card per task (fold a loop's child runs) — ✅ COMPLETE (2026-06-14)

**Operator pivot:** _stop Voice work (nice-to-have) — polish the HUD, real bugs remain_
([[memory]] `feedback_focus_hud_not_voice`). The voice arc (17–25) is parked as-is; the loop now
hunts HUD bugs + JARVIS/butler polish. First bug fixed here. Plan:
[docs/plans/phase-26.md](docs/plans/phase-26.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 26.1 One card per task in `/runs` (Běhy a aktivita) | ✅ done (2026-06-14) | A running **loop** (goal) showed TWO feed cards — the loop AND the child agent it was executing — because `useRunsQuery` merged the agent/pipeline/goal history lists with **no dedup** (a goal's maker dispatches a child agent/pipeline run = `iteration.makerRunRef`). Fix: extracted a pure `mergeRunFeed(agents, pipelines, goals, scheduled)` into `run.ts` that collects every goal's child run ids (`makerRunRef` + the claude verifier's `verifier.runRef`) and **folds those agent/pipeline runs out** of the feed; standalone runs untouched. `useRunsQuery` now just calls it. Execution kind moved into the task detail: `GoalDetailPanel`'s iteration timeline shows each iteration's **maker kind** (agent/pipeline glyph + label) + i18n `runs.goalMakerKind.{agent,pipeline}`. Bonus: the voice "Active agents" panel + briefing read the same deduped feed, so they no longer double-count either. Tests: `mergeRunFeed` folds child agent/pipeline + claude-verifier runs, keeps standalone, sorts newest-first; `GoalDetailPanel` shows maker kind. **web/DS green (runs 40), full workspace 1499/1499** (one transient red = known under-load api e2e flake, green on re-run; web-only change), lint + web-tsc clean. |

## Phase 27: Goal detail — open the maker / verifier run log (complete the fold) — ✅ COMPLETE (2026-06-14)

Direct follow-up to Phase 26 + North-Star law _"Always answerable."_ Folding a loop's child runs out
of the feed (26) removed the only place their **actual log** was reachable; the goal's own detail
showed the iteration timeline but stopped at status glyphs. The iteration schema already keeps the
refs _"so its log is pollable"_ (`makerRunRef`, `verifier.runRef`) — Phase 27 wires the HUD to them.
Plan: [docs/plans/phase-27.md](docs/plans/phase-27.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 27.1 Drill into the folded child log from the goal detail | ✅ done (2026-06-14) | `RunLogStream` made **ref-driven** — props changed from a whole `RunView` to the three values it reads (`runId`/`logBase`/`live`), so a goal iteration holding a bare runRef can mount it; `RunDetail` caller updated. `GoalDetailPanel` gained a per-iteration **"log" toggle** (single open at a time → at most one live poller); expanding reveals the **agent maker log** (`RunLogStream` on the agents endpoint by `makerRunRef`), the **claude verifier log** (`verifier.runRef`), and the **verifier verdict** (`verifier.output`, always present) in a `CodeBlock`. Collapsed rows mount no stream. Pipeline makers show a note (their per-stage logs live in the pipeline view — deferred, see Phase 28). i18n `runs.goal{OpenLog,MakerLog,VerifierLog,VerifierVerdict,PipelineMakerNote}` (cs+en). Tests: agent maker log opens by `makerRunRef`; claude verifier log + verdict revealed; pipeline-maker note (no stream); single-open invariant; nothing mounted while collapsed. **web/DS green (runs 45), full workspace 1504/1504** (first run, no flake), lint + web-tsc clean. Commit `19f6553`. |

**Decision (recorded):** render the child log **inline** in the goal detail, not deep-link — the runs
`Screen` selects the detail run from the **folded** `list` only (`list.find(...) ?? list[0]`), so a
folded child id can't be navigated to (`?run={childId}` would fall back to the first feed row).

## Phase 28: Pipeline run detail — stage timeline + per-stage logs — ✅ COMPLETE (2026-06-14)

Sibling of Phase 27 (the case it deferred) + North-Star _"Always answerable."_ A pipeline run in
`/runs` showed only a note + an **"open pipeline"** button that linked to the pipeline **definition**
(`/pipelines/{id}`) — never what *this run* did. The data was already on the run
(`PipelineRun.stageRuns[]` + the per-phase log endpoint the parked panel reads).
Plan: [docs/plans/phase-28.md](docs/plans/phase-28.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 28.1 Pipeline run stage timeline + per-stage logs | ✅ done (2026-06-14) | **`PipelineStageTimeline`** (new) — one row per `stageRun` (phase + retried `attempt` + `RunStateBadge`, reusing the shared `RUN_STATE` map since every `StageRunStatus` is a `FeedStatus`), each with a **"log"** disclosure mounting a `StageLog` (`useStageRunLogQuery(runId, phaseId)` → `CodeBlock`); single open at a time → ≤1 stage-log fetch live, collapsed rows fetch nothing; footer keeps the pipeline-**definition** link. **`RunDetail`** got a `kind === "pipeline"` branch (paused-limit/parked notice above the timeline), replacing the note+link placeholder and the separate parked-pipeline branch; `RunView` gained `stageRuns` (set in `pipelineRunToView`). **Simplification:** extracted `LimitPausedPanel` (was 3 inline copies — agent/pipeline/goal); removed the dead `pipelineNote` branch + unused `useRouter`. i18n `runs.{stageTimeline,stageAttempt,stageNone,stageNoLog}` (cs+en). Tests: row per stage incl. attempt; no log fetched until expanded; opens a phase's log by `phaseId`; single-open; footer links to `/pipelines/{owner}`; empty state; `pipelineRunToView` carries `stageRuns`. **web/DS green (runs 52), full workspace 1511/1511** (first run, no flake), lint + web-tsc clean. Commit `0807073`. |

## Phase 29: Goal detail — pipeline-maker iteration opens its stage timeline — ✅ COMPLETE (2026-06-14)

Closes the maker-fold arc **26 → 27 → 28 → 29.** Phase 27 opened the agent maker + claude verifier
logs from the goal detail but left the **pipeline** maker as a note; Phase 28 built the stage
timeline; Phase 29 joins them. Plan: [docs/plans/phase-29.md](docs/plans/phase-29.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 29.1 Reveal the pipeline maker's stage timeline inline | ✅ done (2026-06-14) | **`PipelineStageTimeline` made id-driven** — props `{ pipelineRunId, owner, stageRuns }` instead of a whole `RunView`, so a caller holding only a maker run **ref** (a goal iteration) can render it; the "open pipeline" definition link is hidden when `owner` is empty (maker aggregate still loading → no broken `/pipelines/` link). `RunDetail` caller updated. **`GoalDetailPanel`** — fetches the **open** iteration's pipeline maker run via the existing `usePipelineRunQuery(makerRunRef)` (one hook call, `enabled`-gated on the open row → no per-iteration fan-out); its `stageRuns` + `pipelineId` feed the timeline inline, replacing the Phase-27 note; a brief `stageLoading` line covers the fetch. i18n: dropped dead `goalPipelineMakerNote`, added `runs.stageLoading` (cs+en). Tests: `PipelineStageTimeline` retargeted to new props + "definition link hidden when owner empty"; `GoalDetailPanel` pipeline-maker iteration opens the timeline (mocked `usePipelineRunQuery` + stubbed timeline), wiring maker run id + pipeline id, no agent stream. **web/DS green (runs 53, full web-components 351/351), api 691/691 isolated** (full-suite had 1 known under-load e2e flake; web-only change), lint + web-tsc clean. Commit `5b3de80`. |

**Arc closed:** every folded child execution — agent maker log, claude verifier log, pipeline maker
stages — is now answerable from the task detail (North Star "always answerable" + "all info in the
task detail").

## Phase 30: The gate's "no" rejects, it doesn't delete the run — ✅ COMPLETE (2026-06-14)

Gate/approvals HUD audit (highest-stakes surface). Plan: [docs/plans/phase-30.md](docs/plans/phase-30.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 30.1 RunApprovalGate rejects, not deletes | ✅ done (2026-06-14) | **Bug:** the run-detail decision panel `RunApprovalGate` wired its negative button ("Smazat"/Delete) to `onDelete` → `Screen.tsx` **deletes the whole run + erases on-disk artifacts**, instead of the gate's **reject** endpoint. So rejecting a gated action (PR-open/push/destructive-delete/spend-past-cap) from the run detail destroyed the run record and recorded **no** gate decision (`approval-rejected` activity), while the approvals-queue card (`ApprovalCard`) already used `useRejectMutation`. Violated Laws "the PR is the gate" / "always answerable" / "files are the source of truth". **Fix:** `RunApprovalGate` now calls `useRejectMutation` for the negative decision (backend marks approval `rejected`, records `approval-rejected`, terminates the run **without erasing it** → stays answerable); button relabelled `discard`→`reject` ("Zamítnout"/"Reject"); `onDelete`/`deleting` props removed (deleting a run is a separate header action, never the gate's "no"); `RunDetail` simplified. i18n: dropped `approvals.discard`, added `approvals.reject` (cs+en). Verified reject semantics against `approvals.service.ts` (`decide(id,"rejected")` + activity event + run cancel, no erase). Tests: new `RunApprovalGate.test.tsx` — negative button calls **reject** with the approval id (never delete); positive calls **approve**; skill+action render. **web/DS green (runs 56, full web-components 354/354), api 691/691** (full-suite 1 known under-load e2e flake; web-only change), lint + web-tsc clean. Commit `66af534`. |

## Phase 31: Hold-to-confirm on the run-detail gate for high-risk approvals — ✅ COMPLETE (2026-06-14)

Second gap from the Phase-30 gate audit — guardrail parity. Plan: [docs/plans/phase-31.md](docs/plans/phase-31.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 31.1 HoldButton on Confirm for payment/deletion | ✅ done (2026-06-14) | `ApprovalCard` (queue) gated payment/deletion behind a 0.9s `HoldButton`, but `RunApprovalGate` (run-detail decision panel) approved **every** risk with a plain one-click Button → the highest-consequence actions were *easier* to confirm on the bigger surface. Fix: canonical `HIGH_RISK_TYPES = {platba, mazani}` in `features/approvals/approval.ts` (taxonomy home; mirrors `ApprovalCard`'s `highRisk` set, no fork); `RunApprovalGate`'s Confirm becomes a DS `HoldButton` when `approval.riskType` is high-risk (`tone="bad"` deletion / `"warn"` payment; 0.9s hold → `approve.mutate`), else single-click Confirm. **Reject stays single-click** (safe direction never gated). Unenriched approvals (no `riskType`) degrade to the plain button. i18n `approvals.holdToApprove`/`holdDone` (cs+en). Tests: deletion/payment → `HoldButton` (`hold-button-root`) + no plain Confirm; non-high-risk keeps plain Confirm; reject single-click. **web/DS green (runs 60, full web-components 357/357), api 691/691 isolated** (full-suite 2 known under-load e2e flakes; web-only change), lint + web-tsc clean. Commit `b903d54`. |

## Phase 32: Overview starter cards actually navigate (dead-affordance fix) — ✅ COMPLETE (2026-06-14)

The proposed "surface the briefing" was re-checked against real code and found a **non-gap**
(`SummaryWidget` + `BriefingCard` already read the real `GET /api/briefing`; `ActivityFeed` shows live
activity). Gap analysis instead found a dead interactive element. Plan: [docs/plans/phase-32.md](docs/plans/phase-32.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 32.1 Starter cards navigate (no-op → Link) | ✅ done (2026-06-14) | The fresh-workspace **starter cards** (Skills/Integrations/Agents/Pipelines) on `/overview` were wrapped in a `Pressable` whose `onClick` was an empty no-op with the comment "navigation handled by links" — but there were **no links**. Clicking a starter did nothing — a dead end on the first screen a new operator sees (the only no-op `onClick` in the web app, swept). Fix: each starter `Card` wrapped in a `next/link` `<Link href={`/${id}`}>` (the `STARTERS` ids ARE their route segments), mirroring `BriefingCard`'s `NeedsYouRow`; no-op `Pressable` gone. Tests: a fresh (empty) workspace renders the four starters as links to `/skills`/`/integrations`/`/agents`/`/pipelines` (mutable integrations mock forces `isFresh`). **web/DS green (overview 16, full web-components 358/358), full workspace 1519/1519** (first run, no flake), lint + web-tsc clean. Commit `65a9b1a`. |

## Phase 33: Memory note viewer — navigable wiki-links + backlinks — ✅ COMPLETE (2026-06-14)

Audit of the second-brain `/memory` surface. It reads the **real vault** (graph + search + note +
daily + editor) — solid — but the note viewer broke index-first navigation. Plan: [docs/plans/phase-33.md](docs/plans/phase-33.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 33.1 Navigable links + backlinks in the note viewer | ✅ done (2026-06-14) | The note **body** rendered as raw text (`[[wikilinks]]` inert), **backlinks** were plain `← a, b, c` text, and the note's resolved outbound **`links`** weren't shown at all — yet `NoteSchema` already carries `links` (resolved `[[wiki-link]]` targets) + `backlinks` as note-id arrays. So from an open MOC you couldn't click through to a linked note (only the graph let you traverse) — broke "MOCs are the way in… notes joined by wiki-links." Fix: extracted a testable **`NoteView`** composite rendering, below the body, two **navigable** rows — outbound `links` (→) + inbound `backlinks` (←), each a clickable `Chip` (`Pressable`) → `onSelect(id)`. `Screen` uses it (`onSelect=setSelected`). i18n `memory.noteLinks`/`noteBacklinks` (cs+en). Tests: `NoteView.test.tsx` — body renders; clicking a link/backlink chip calls `onSelect` with that id; both rows for a MOC-style note; no-note fallback. **web/DS green (memory 15, full web-components 363/363), full workspace 1524/1524** (first run, no flake), lint + web-tsc clean. Commit `f6ffc04`. Deferred: full markdown body rendering (inline `[[…]]` clickable, headings/lists). |

## Phase 34: Render the memory note body as markdown — ✅ COMPLETE (2026-06-14)

The deferred half of Phase 33 (readability). Plan: [docs/plans/phase-34.md](docs/plans/phase-34.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 34.1 Markdown-render the note body | ✅ done (2026-06-14) | The vault is "plain markdown… human-readable" but the note viewer rendered the body as one raw `Typography` (a wall of `#`/`-`/`**`/`[[…]]`). **Dependency-frugal fix:** `@uiw/react-md-editor` is already a dep (DS `MarkdownEditor` wraps it) and ships `MDEditor.Markdown` — no new dep, no hand-rolled parser. New DS **`Markdown`** viewer wraps it with the same GitHub-primer→token theme vars (dark, transparent bg); exported from DS index. `NoteView` body → `<Markdown source={note.body} />` (headings/lists/emphasis/code/links render); Phase-33 links/backlinks chip rows stay the index-first nav (inline `[[…]]` stays literal — deferred). Tests: DS `Markdown.test` (`# Hello`→h1, `- item`→listitems, `**bold**`→strong, testid); `NoteView.test` still finds the rendered body. **DS+web green, full workspace 1528/1528** (first run, no flake), lint + apps/web-tsc + ds-tsc clean. Commit `9c84d66`. |

## Next iteration

**Proposed Phase 35 — Audit the /integrations (channels / autonomous mode) HUD surface.** A major
North-Star pillar not yet audited: _"Autonomous mode watching Slack/email on a heartbeat… when
something actionable arrives it acts within its mandate."_ Phase 5 shipped real integrations +
credentials + a `ChannelWatcher` + tiered triage + a two-level item store. GROUND first against real
code: the `/integrations` segment + feature dir + query/mutation hooks + the contract — verify the HUD
shows the **real** connected channels and their **inbound triage items** (the InboxPanel referenced in
Phase-32's briefing grep), that connect/disconnect + credential entry hit the real endpoints (NOT a
mock list), that the autonomy **tier/mandate** of a handled item is visible, and that inbound content
is shown as **data, not commands** (Law 4 — no unsanitized passthrough that could read as an
instruction). Pick the single biggest gap (a mock channel list, an unwired connect button, triage
items with no tier/decision shown, raw inbound leaking) as Phase 35's concrete change.

This continues the operator's "polish the velín" pass. **Open invitation:** the operator is pointing
at concrete HUD bugs as they spot them — each becomes the next phase; in between, the loop audits
feed/detail states for similar double-counting or raw-data leaks.

Also still open (hardening): the api e2e under full-suite contention can flake on timeouts (passes
per-project — api 691/691 isolated). The
[self-development runbook](docs/ops/self-development.md) is ready for a real operator-driven engagement.
