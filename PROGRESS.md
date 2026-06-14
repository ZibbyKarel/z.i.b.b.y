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

## Next iteration

**Proposed Phase 21 — dead-UI sweep (§7.3): wire the stub operator surfaces.** With voice
functionally complete, the next priority-#1 (mock→real) gap is the small set of dead UI the
roadmap §7.3 flagged: **skill edit/delete** (buttons exist, no mutation), **global search**
(the top-bar search box isn't wired to the existing `/api/memory/search` + entity queries), and
the **`light.ts` theme stub** (light mode is a placeholder; the app forces dark). Pick the one
with the most operator value — likely **global search** (a butler you can't search is half-
blind), or skill edit/delete (CRUD parity with agents/pipelines, which already have it). Each is
a contained mock→real slice with its own web-components test (+ contract/e2e if a new endpoint).
**Watch-out:** check whether the search/skill endpoints already exist (memory.search does) — if
so it's pure web wiring, no API change. Alternative: the optional voice wake word / Settings →
Voice surface if the operator wants hands-free.

Also still open from earlier (fold into a hardening pass if it recurs): the api
`agent-runs.e2e` git-fixture transient under full-suite load (rare; passes isolated — seen
once last iteration in a 688-test run, green on clean re-run). The
[self-development runbook](docs/ops/self-development.md) is ready for a real operator-driven
engagement.
