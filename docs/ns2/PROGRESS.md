# NS2 — Federation Implementation Progress

> **Purpose:** durable resume point for the North Star II implementation run. If the
> session is interrupted (usage limits, crash), a fresh orchestrator reads this file +
> `DECISIONS.md` + `ROADMAP-2.md` and continues WITHOUT redoing finished work.
>
> **Working branch:** `north-star-2` (implementation lands here phase by phase;
> main is left untouched — operator merges via PR at the end).
> **Method per phase:** Opus subagent writes a detailed plan → orchestrator reviews →
> plan saved to `docs/plans/ns2-<phase>-<slug>.md` → Sonnet subagent(s) implement →
> scoped tests green → checkpoint commit. Orchestrator never codes directly.

## Status table

| Phase | Title                                    | Status  | Plan doc                                           | Commit                 |
| ----- | ---------------------------------------- | ------- | -------------------------------------------------- | ---------------------- |
| F0a   | Delete discovery orphan (goals STAYS)    | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `c02a68a9`             |
| F0b   | Per-project draft PR mode (prOpenMode)   | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `10de4ad3`             |
| F0c   | Proposal source tag on approvals inbox   | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `101759d7`             |
| F0d   | Law-3 text amendment (vault north-star)  | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `d4c53782`             |
| F1a   | Contract: ownerSubsystem + registry → 10 | ✅      | [ns2-f1](../plans/ns2-f1-ownership-is-data.md)     | `9e45a8e8`             |
| F1b   | Backfill/seed + write 422 + UI selects   | ✅      | [ns2-f1](../plans/ns2-f1-ownership-is-data.md)     | `1037264c`             |
| F1c   | Stored roster (service + RosterTab)      | ✅      | [ns2-f1](../plans/ns2-f1-ownership-is-data.md)     | `7d47af2e`             |
| F2a   | Switchboard emits subsystem verdicts     | ✅      | [ns2-f2](../plans/ns2-f2-two-stage-dispatch.md)    | `888dc425`             |
| F2b   | Per-subsystem dispatcher prompt+fallback | ✅      | [ns2-f2](../plans/ns2-f2-two-stage-dispatch.md)    | `7ede32e9`             |
| F2c   | Classification trace + activity tagging  | ✅      | [ns2-f2](../plans/ns2-f2-two-stage-dispatch.md)    | `40a2ee55`             |
| F3a   | Subsystem gate-rule sets + tier defaults | ✅      | [ns2-f3](../plans/ns2-f3-policy-accountability.md) | `77628764`             |
| F3b   | Briefing per subsystem (Beacon/Ledger)   | ✅      | [ns2-f3](../plans/ns2-f3-policy-accountability.md) | `fab17397`             |
| F3c   | Approvals/activity filters + get_status  | ✅      | [ns2-f3](../plans/ns2-f3-policy-accountability.md) | `c9c3dcaa`             |
| F4a   | Subsystem MOC shelves (record/distill)   | ✅      | [ns2-f4](../plans/ns2-f4-memory-shelves.md)        | `e1d12b7b`             |
| F4b   | Retrieval upgrade (tags + link graph)    | ✅      | [ns2-f4](../plans/ns2-f4-memory-shelves.md)        | `d3c69968`             |
| F4c   | Vault seed + scheduled self-knowledge    | ✅      | [ns2-f4](../plans/ns2-f4-memory-shelves.md)        | `9a78cd2b`             |
| F5a   | Sentinel v1 (CVE + secret watch)         | ✅      | [ns2-f5](../plans/ns2-f5-empty-chairs.md)          | `8bec02a2`             |
| F5b   | Maestro v1 (merge queue, read-side)      | ✅      | [ns2-f5](../plans/ns2-f5-empty-chairs.md)          | `a04fabfa`             |
| F5c   | Loom v1 (scheduled quality audit)        | ✅      | [ns2-f5](../plans/ns2-f5-empty-chairs.md)          | `a71b83ac`             |
| F6a   | Herald reply ledger + graduation         | ✅      | [ns2-f6](../plans/ns2-f6-trust-from-record.md)     | `a1b756df`             |
| F6b   | Live soak harness (opt-in lane)          | ✅      | [ns2-f6](../plans/ns2-f6-trust-from-record.md)     | `b53904e4`             |
| F6c   | Watcher health probes                    | ✅      | [ns2-f6](../plans/ns2-f6-trust-from-record.md)     | `43eef785`             |
| F7a   | Sentry MonitorAdapter                    | ✅      | [ns2-f7](../plans/ns2-f7-monitors-and-actions.md)  | `3381779f`             |
| F7b   | Merge-queue actions + post-merge loop    | ✅      | [ns2-f7](../plans/ns2-f7-monitors-and-actions.md)  | `dc8d4e26`, `4a36ed7e` |
| F8a   | Seat Hearth (registry 10 → 11)           | 🟨 next | [ns2-f8](../plans/ns2-f8-hearth-personal.md)       | —                      |
| F8b   | Personal domain (marking + capture)      | 🟦      | [ns2-f8](../plans/ns2-f8-hearth-personal.md)       | —                      |
| F8c   | Hearth duties v1 (agenda + reminders)    | 🟦      | [ns2-f8](../plans/ns2-f8-hearth-personal.md)       | —                      |

Legend: ⬜ todo · 🟦 planned (plan reviewed) · 🟨 in progress · ✅ done (tests green,
committed) · ⛔ parked (reason in Notes).

## Already done (do NOT redo)

- 2026-07-17 — Five-track core audit (findings folded into `ROADMAP-2.md` "Audit
  Verdict"). North Star II written: `.zibby/data/vault/north-star-2.md`.
- 2026-07-17 — Branch cleanup: 20 local branches verified patch-merged
  (`git cherry` = 0) and deleted. Kept as genuinely unmerged:
  `feat/phase-45-qualify`(10), `feat/todo-chat-detail-width`(3), `develop`(2),
  `feat/speakd-tts-integration`(1), `chore/audit-remediation-plans`(1).

## Implementation log

- **F0 complete (2026-07-17, Sonnet):** suites green (api 1764/1764,
  web-components 1103/1103, 3× tsc). Deviations: `discovery.e2e.test.ts` also
  deleted (exercised the deleted module); 2 pre-existing ProjectBasicsPanel
  category tests switched to `getByLabelText` (new select made DropdownTestId
  ambiguous). Legacy task-output `resolve()` path intentionally ignores
  `prOpenMode` (no project in scope — commented). Known flake: `runner-core.test.ts`
  ENOENT under parallel load, passes in isolation.
- **F1 complete (2026-07-17, Sonnet):** api 1806 tests, web-components 1102/1102,
  contracts 386/386, 3× tsc + check:deps + check:cycles clean. Full-suite runs show
  ~1 random concurrency flake per run (different file each time, all pass isolated
  — pre-existing pattern). Deviations: `ownerSubsystem` field lives on shared
  `AgentEditBasics` (create AND edit — agent forms have no create/edit split);
  monitor integrations excluded from the "Integrace" UI section client-side (wire
  payload keeps full set, `monitors` is a documented subset); `IntegrationRow` has
  no click target (no standalone integration detail route);
  `ChainsStorageService.updateOwnerSubsystem` internal-only.
- **F2 complete (2026-07-17, Sonnet):** api 1808/1822 (14 skipped), web-components
  1104/1104, contracts 393/393, 3× tsc + check:deps clean. Extra commits:
  `27cf7511` (progress), `73191980` (2 stale tasks.e2e `candidates` counts 3→4 —
  F2a's stage-1 subsystem verdict legitimately adds a candidate when catalog agents
  share an owner). Deviations: glyph `"grid"` not `"orbit"` (not a DS IconName);
  `TaskSchedulerService` gained required `agentsStore` ctor param;
  `recordDispatchedActivity` now async+awaited; DS `Tag` used (no `Badge` exists).
  New surfaces for F3+: `ActivityRefs.ownerSubsystem` (`.strict()` — extend
  deliberately), `ScheduledTask.classification`/`TaskRun.classification`
  (`ClassificationTraceSchema`); reference patterns: `ClassificationTracePanel`
  (RunDetail.tsx), `TaskSchedulerService.ownerSubsystemOf` (guarded best-effort
  lookup).
- **F3 complete (2026-07-17, Fable):** api 1828/1843 (14 skipped + 1 speech
  concurrency flake, passes isolated), web-components 1113/1113, contracts
  402/402, 3× tsc + check:deps + check:cycles clean. Deviations: (1) F3a
  write-time 422 on softer-than-floor catalog rules DROPPED per the plan's
  sanctioned fallback (GateRulesModule→GatesModule injection would cycle;
  eval-time strictest-of-buckets is the enforcement boundary —
  `validateSubsystemRuleHardenOnly` exists on the evaluator for future callers);
  (2) F3a runner scope proof implemented at the evaluator level
  (`rulesForAgentInSubsystem` + real catalog store) — runner wiring is a
  one-line call-site change; (3) `SubsystemsModule` gained
  `exports: [SubsystemsService]` (needed by briefing + chat); (4) F3c activity
  filter lives on the **RightRail live log** (`RightRail.tsx` +
  `RightRailTestId.SubsystemFilter`), NOT the plan's named `ActivitySection.tsx`
  — that file is the Settings view-mode config and renders no entries; the rail
  is the actual activity list. New surfaces for F4+: three-bucket gate eval
  (own → subsystem catalog → floor, strictest wins, `SUBSYSTEM_TIER_DEFAULT`
  catch-alls, Beacon defaults `ask`); `Briefing.subsystems?`
  (`BriefingSubsystemLineSchema`) + `## Subsystems` markdown block;
  `Approval.ownerSubsystem?` stamped only by pipeline/agent runners; chat
  `get_status` optional `subsystem` arg (MCP enum sourced from `SUBSYSTEMS`).
- **F5 planned (2026-07-17, Opus):** `../plans/ns2-f5-empty-chairs.md`, 6 corrections
  — Sentinel = Dependabot REST (not pnpm audit); Loom = graphify+madge only (NO
  knip — not installed); Sentinel/Loom ride the automation seam (not
  MonitorAdapter); Maestro read-side half-exists (`ProjectPrService.listOpen`) —
  F5b adds ZERO merge code. BINDING: secret findings never contain the matched
  secret value; sentinel/loom seed `enabled: true`; F5b card defers to F7b if not
  green first try.
- **F6 planned (2026-07-17, Opus):** `../plans/ns2-f6-trust-from-record.md`, 7
  corrections — email can never graduate BY CONSTRUCTION (notify-only returns
  before any reply branch); graduation promotes only confident naturally-T3
  verdicts and always routes through `handleTier2` (gate still wins); exactly 5
  `TickingWatcherBase` watchers (goal loop is NOT one). RULED: `edited` outcome
  reserved-not-produced; global confidence floor stays; soak = fake-channel opt-in
  lane only (`skipIf(!ZIBBY_SOAK)` + 0-tests meta-assertion); 5 graduation safety
  invariants each need a test.
- **F7 planned (2026-07-17, Opus):** `../plans/ns2-f7-monitors-and-actions.md`, 7
  corrections — monitor registry seam IS clean (register + 1 enum value) but first
  monitor-only kind needs a readOnly no-op channel adapter (exhaustive kind switch)
  - per-kind dispatch-instruction Record (the one watcher edit);
    `ProjectPrService` NOT exported (post-merge recording lives inside `merge()` via
    leaf MergeWatchStore); merge response `sha` captured (additive optional). RULED:
    `POST_MERGE_WINDOW_MIN=120`, post-merge-watch seeds enabled, 5 merge-safety
    invariants each need a test, Sentry detail = title/culprit/level/count only.
- **F4 planned (2026-07-17, Opus):** plan at `../plans/ns2-f4-memory-shelves.md`
  with 7 factual corrections — key: shelves are FLAT `knowledge/subsystem-<id>-moc.md`
  notes (vault forbids subdirs; `-moc` suffix auto-indexes as entry point); vault
  seeder must fire ONLY on a zero-note vault (`memory.e2e.test.ts:49` exact-set
  assertion). BINDING: implement F4 only after F1b/F1c (done) — verify shelf fill
  against the seeded ownership map; F4c briefing changes strictly additive (F3b
  owns the briefing restructure).

- **F8 planned (2026-07-17, Opus):** `../plans/ns2-f8-hearth-personal.md`, 7
  corrections — key: calendar ownership STAYS puls ("Puls polls, Hearth consumes";
  north-star-2.md:80 explicit — hearth roster legitimately empty like
  codex/ledger, mandatory comment in owner-seed.ts); no `personal/` vault dir
  possible → `domain: personal` frontmatter marking (parallel to `project:` +
  `ownerProjectOf`); four exact `length === 10` assertions → 11 (contract test
  ×2, subsystems e2e, subsystems.service — ellipseLayout's 8 is unrelated);
  capture_note is free via tier-less `createNote` (raw:true → nightly distiller,
  zero distiller changes); calendar events are already channel items
  (`kind === "calendar"`, text `[<ISO>] <summary>`) — F8c needs no new adapter.
  RULED: personal-task dispatch DEFERRED (FC-7); glyph `coffee` + color
  `#d9694a`; 4 domain-isolation invariants each need a test; F8c briefing edits
  rebase additively onto the post-F7 file (byte-identical-when-empty snapshot
  mandatory).
- **F4 complete (2026-07-17, Fable):** api 1881/1895 (14 skipped, 0 failures — the 2
  documented `pipelines.e2e` flakes did not manifest this run), web-components
  1116/1116, contracts 440/440, 3× tsc + check:deps clean. Three checkpoint commits
  (F4a `e1d12b7b`, F4b `d3c69968`, F4c `9a78cd2b`) plus one follow-up fix commit
  (`494b85b3`) discovered only by the mandatory phase-end full-suite run — F4c's
  new `VaultSeedService` seeds every fresh empty vault (including e2e temp vaults)
  with a `"north-star"` stub, so `agent-runs.e2e.test.ts`'s own unconditional
  `POST /api/memory/notes {id:"north-star"}` fixture started 409ing; fixed by
  switching that fixture to `PATCH /api/memory/notes/north-star`. No other e2e file
  was affected (checked all 6 other `VAULT_DIR`-using e2e suites for a `north-star`
  or note-count collision — none exists). Deviations from the plan, both
  plan-sanctioned: (1) F4b's compose-level 1-hop-expansion test needed
  `"-moc"`-suffixed fixture note ids with carefully engineered relative scores
  (`VaultService.index()` only returns entry-point notes when any exist in the
  vault, so a non-suffixed linked note is invisible to both direct MOC selection
  and `selectLinkedNotes` — this is documented, not a bug); (2) F4c's briefing
  drift line rebases onto F3b's already-landed `## Subsystems` section instead of
  a new `## Memory` heading, exactly per the plan's binding ruling #3 (F3b landed
  before F4c in this run). New surfaces for F5+: `Briefing.selfKnowledgeDrift?`
  (boolean, additive, folds into the existing `## Subsystems` render — no new
  section); `SELF_KNOWLEDGE_AUTOMATION_ID = "self-knowledge-refresh"` system
  automation (cron `30 3 * * *`, between the 3:00 distill and the 7:00 briefing);
  `TargetSchema` gained `{type:"self-knowledge"}` (both web exhaustive tables —
  `TARGET_GLYPH`/`targetKindKey` in `AutomationCard.tsx` — already updated, glyph
  `brain`); `apps/api/src/memory/vault-seed.content.ts` exports
  `composeSeedNotes(subsystems)` (pure, 12 notes: `north-star` stub + `zibby-index`
  root MOC `subsystem: codex` + 10 `subsystem-<id>-moc` shelves) — reuse this if a
  later phase needs the canonical fresh-install note set; `VaultSeedService` lives
  in `MemoryModule` only (do not re-register); ten committed
  `.zibby/data/vault/knowledge/subsystem-<id>-moc.md` shelf files now exist in this
  repo's own vault with `## Poznatky` sections ready for `updateIndex` writes.
- **F5 complete (2026-07-17, Fable):** three checkpoint commits (F5a `8bec02a2`
  Sentinel, F5b `a04fabfa` Maestro, F5c `a71b83ac` Loom). Final full-suite run:
  api 200 files/1940 tests pass (1 pre-existing skip, `goal-loop.e2e.test.ts` +
  13 other skips), web-components 174 files/1116 tests pass, contracts 36
  files/432 tests pass, 3× tsc (contracts/api/web) clean, `check:deps` clean.
  Deviations: (1) F5a — Sentinel rides the automation seam (cron `sentinel-scan`
  target) per the plan's binding correction, no MonitorAdapter involvement;
  secret findings carry file:line + rule name only, never the matched value
  (proven by a dedicated test); (2) F5b — `maestroContract` was registered in
  `libs/contracts/src/app.contract.ts` (`maestro: maestroContract`) beyond the
  plan's literal text (which only specified barrel exports), because the web
  `tsr` client needs it in the aggregate router to reach `GET /api/maestro/queue`
  at all; zero merge code added, `MergeQueueCard` web UI deferred to F7b per the
  plan's own escape hatch (not attempted — noted here as the deferral, not a
  failure); (3) F5c — `LoomService` reuses the EXACT `GRAPH_REPORT_PATH` DI token
  - `resolveGraphReportPath()` factory from `self-knowledge.module.ts` (safe:
    NestJS tokens are just strings, independently scoped per module); `exec` is
    injected as an optional `execImpl` constructor param (same testability
    convention as Sentinel/Maestro's `fetchImpl`) rather than `vi.mock()`'d; no
    knip invocation exists anywhere in the service (proven by a dedicated test).
    Recurring process note (not a functional bug): the `check:self-knowledge`
    pre-commit hook flagged drift at all three subphase commits; each time,
    `pnpm self-knowledge:generate` resolved it with no visible diff on the tracked
    note — matches the existing "check:self-knowledge hook flake" gotcha below,
    now confirmed to recur reliably rather than being a one-off.
    **New surfaces for F6+:** `Briefing` extras gained `securityFindings?: string[]`
    (F5a), `mergeQueue?: string[]` (F5b), `qualityFindings?: string[]` (F5c) — all
    the same established optional-capped-50-string-array pattern, each with its own
    `##` markdown section in `renderBriefingMarkdown()`; `SubsystemFindingsStore`
    (`apps/api/src/subsystems/subsystem-findings.store.ts`) is a shared
    fingerprint-diff store (`read(key): Promise<Set<string>>` /
    `write(key, Set<string>): Promise<void>`), keyed by an arbitrary string
    (`"sentinel"`, `"loom"` in use) — reuse its `read`/`write` pair for any future
    subsystem's own deterministic-scan-dedup needs rather than rolling a new
    mechanism; `TargetSchema` gained `{type:"sentinel-scan"}` and
    `{type:"loom-audit"}` (both web exhaustive tables — `TARGET_GLYPH`/
    `targetKindKey` in `AutomationCard.tsx`, plus `Screen.tsx`'s `resolveTarget` —
    already updated; glyphs `shield`/`code`); `GET /api/maestro/queue` is the only
    new HTTP surface from F5 (Sentinel/Loom are scheduler-only, no controller, not
    in `app.contract.ts` — deliberate, mirrors `GapDetectorService`'s precedent);
    `sentinel-scan` (cron `0 3 * * *`) and `loom-audit` (cron `0 2 * * *`) both seed
    `enabled: true` as system automations in `automations.storage.service.ts`.
- **F6 complete (2026-07-18, Fable):** three checkpoint commits (F6a `a1b756df`
  Herald ledger+graduation, F6b `b53904e4` soak lane, F6c `43eef785` watcher
  health). Final full-suite run: api 205 files/1994 tests pass (17 skipped — the
  documented `pipelines.e2e` flakes did not manifest), web-components 1119 pass,
  contracts 446 pass, 3× tsc (contracts/api/web) clean, `check:deps` +
  `check:cycles` clean. The opt-in soak (`ZIBBY_SOAK=1 pnpm --filter @zibby/api
soak`) ran green 3/3 with the graduated-promotion scenario proven against a
  real AppModule boot; the default lane runs 0 soak tests (meta-guard asserts
  it). All 5 graduation safety invariants have dedicated tests. Deviations:
  (1) F6a — `NOTIFY_ONLY_KINDS` extracted to new
  `apps/api/src/channels/notify-only-kinds.ts`: the plan had Herald import it
  from `channel-triage-flow.service.ts`, but that value-import completes a
  `channels ⇄ herald` module cycle that silently breaks SWC decorator metadata —
  the `@Optional()` HeraldService injected `undefined` in the live app while all
  unit tests (manual construction) stayed green; found ONLY by the F6b soak
  (fan-out 2×T2/3×T3 instead of 3×T2/2×T3), fixed by the extraction. Treat this
  as a standing gotcha: never add a value import from a `channels` module file
  back into anything that imports the triage flow. (2) F6c —
  `SchedulerService`'s own M8 `lastTickAt` field renamed `lastTickAtM8` (TS2415:
  two same-named PRIVATE fields on base+subclass are incompatible); its public
  `health()` shape is unchanged. (3) F6c — the five watcher ctor signatures
  gained a required `WatcherHealthRegistry` param (positional test constructors
  updated in 6 spec files); `BriefingService` likewise. Recurring process note:
  the `check:self-knowledge` hook flagged drift at every commit again;
  `pnpm self-knowledge:generate` + retry resolved each. **New surfaces for
  F7/F8:** `Health.watchers: WatcherHealth[]` (REQUIRED on the wire —
  `WatcherIdSchema` is the closed 5-id enum `channel|monitor|scheduler|`
  `task-scheduler|limit-resume`; add F7's Sentry polling under the existing
  `monitor` watcher, do NOT add an id); `TickingWatcherBase` now has abstract
  `watcherId` + concrete `watcherHealth(now?, staleFactor=3)` (any new subclass
  must declare `watcherId` or tsc fails — that is the guardrail);
  `WatcherHealthRegistry` (`@Global()` WatcherHealthModule, imported once in
  AppModule): `register(probe: () => WatcherHealth)` at `onModuleInit` +
  `all(): WatcherHealth[]` (probes try/caught, drop-with-warn); a stale watcher
  NEVER flips `/health` status (fail-open, v1 contract);
  `Briefing.staleWatchers?: string[]` (max 20, additive) renders as
  `## Watchers` after `## Quality`; settings System tab renders
  `WatcherRows` (`apps/web/features/settings/components/WatcherRows.tsx`,
  testids `settings-watchers` + `settings-watcher-row-<id>`, i18n
  `settings.watchers.*` cs+en); Herald: `ReplyLedgerEntry`/`HeraldGraduation`
  contracts (`libs/contracts/src/herald/reply-ledger.schema.ts`, `edited`
  outcome RESERVED never produced), `HeraldService`
  (`recordProposal`/`recordDecision`/`isGraduated`, ResumableRunner kind
  `herald-graduation`, threshold env `HERALD_GRADUATION_THRESHOLD` default 10),
  stores under `<data>/herald/` (`ledger/` entity files +
  `graduations.json`); the triage-flow promotion branch lives in
  `channel-triage-flow.service.ts` (graduated + confident + naturally-T3 +
  !forceT3 → re-routed through `handleTier2`, reason suffixed
  `(graduated: Tier-2 auto-reply)`); soak harness under `apps/api/test/soak/`
  (scenarios.ts / soak-harness.ts pure + report renderer) — extend
  `SOAK_SCENARIOS` for new autonomous behaviors rather than new e2e boots.

- **F7 complete (2026-07-18, Fable):** three checkpoint commits (F7a `3381779f`
  Sentry MonitorAdapter, F7b-1 `dc8d4e26` merge-queue actions, F7b-2 `4a36ed7e`
  post-merge loop). Final full-suite run: api 210 files/2043 tests pass (17
  skipped, 0 failures — the documented `pipelines.e2e` flakes did not manifest
  this run), web-components 177 files/1130 tests pass, contracts 39 files/466
  tests pass, 3× tsc (contracts/api/web) clean, `check:deps` clean. All 5
  merge-safety invariants have dedicated tests: (a)/(b)/(c) in the F7b-1 web
  suite (queue merge hits only the existing endpoint, one `HoldButton` click
  never merges, no merge control on a non-`ready` entry); (d) an explicit
  assertion in `post-merge-watch.service.test.ts`'s red→gated-fix test that
  scans every `fetchImpl` call for a `PUT` method or a `/merge` URL — none
  found; (e) `project-pr.service.test.ts`'s "recording failure never fails the
  merge" test (mocked `MergeWatchStore.putNew` throws, `merge()` still returns
  `{merged:true, sha}`). Deviations: (1) item 8's optional `mergedRecently`
  briefing-card web section (`automationGaps`-style) DEFERRED per the plan's
  own escape hatch — the first full-suite run was NOT green (two fixes needed,
  below), so per "defer if the suite isn't green first try" this was correctly
  skipped, not attempted; the activity-feed half of item 8 (new
  `merge-completed`/`post-merge-outcome` kinds rendering via their summary,
  both mapped to the `"integrations"` activity group) shipped as planned, no
  new mutation added; (2) the CI-sidecar-reuse heuristic in
  `PostMergeWatchService.rollup()` — treat `MonitorEventStore.listStatuses()`
  as authoritative (skip the GitHub check-runs fetch) only when a matching
  entry's `checkedAt >= watch.mergedAt` — was a judgment call not spelled out
  verbatim in the plan's pseudocode, made to satisfy "CI-sidecar reuse" test
  coverage the plan's own test list requires; (3) discovered by the phase-end
  full-suite run, not caught by any scoped test: `apps/api/data-test/vault/
knowledge/self-knowledge.md`'s committed `## Channels` block was stale
  against `IntegrationKindSchema` (F7a added `"sentry"` as a channel kind, 5→6,
  nobody regenerated the fixture at F7a's own commit) — fixed with a
  **corrected fixture-regen recipe** (below); (4) `apps/web/features/
automations/components/AutomationCard.tsx`'s two exhaustive `Target["type"]`
  maps (`TARGET_GLYPH`, `targetKindKey`) needed a `"post-merge-watch"` case —
  the same "exhaustive Record forces classification" guardrail every prior F5–
  F6 `TargetSchema` addition hit; glyph `branch` (git-domain, no dedicated
  merge/CI glyph exists in the DS icon set), i18n keys `targetPostMergeWatch`
  added to both `en.json`/`cs.json` (`"Post-merge watch"` / `"Hlídka po
sloučení"`).
  **Corrected fixture-regen recipe (supersedes the plain "temp copy +
  `pnpm self-knowledge:generate`" gotcha below when `IntegrationKindSchema` or
  any other self-knowledge input changed):** `generate.ts`'s `AppModule` boot
  seeds a FULL fresh automation/herald/maestro catalog into whatever
  `ZIBBY_DATA_DIR` it's pointed at (harmless — `compose()` never reads
  automations) AND picks up this machine's real `graphify-out/GRAPH_REPORT.md`
  if one happens to exist locally, embedding a "God nodes"/"Communities"
  digest into the regenerated note that CI (no `graphify-out`, gitignored)
  will never reproduce — a phantom drift trap in the opposite direction. Run
  with **both** `ZIBBY_DATA_DIR=<temp copy>/data-test` **and**
  `GRAPH_REPORT_PATH=/nonexistent/GRAPH_REPORT.md` (the exact override
  `self-knowledge.e2e.test.ts` itself applies) so the CODEBASE-SHAPE block
  renders the same "_graphify-out is missing_" hint locally and in CI; then
  copy back ONLY `vault/knowledge/self-knowledge.md` from the temp copy —
  never the seeded `automations/*.json`, `herald/`, `maestro/` dirs, and
  never the agent/pipeline `.md` files even though they also diff (that diff
  is pure YAML-serialization normalization — `EntityFileStore` rewrites
  frontmatter to its canonical form and adds any missing optional field like
  `ownerSubsystem` on any boot-time read — unrelated to self-knowledge content
  and out of scope for this fixture fix). Verify with
  `git status --short apps/api/data-test` showing only the one file, then the
  scoped `self-knowledge.e2e.test.ts` run.
  **New surfaces for F8:** `TargetSchema` gained `{type:"post-merge-watch"}`
  (both web exhaustive tables already updated — reuse this pattern, not a
  fresh one, for any F8c automation target); `IntegrationKindSchema` gained
  `"sentry"` (channel-adapter-only, `readOnly: true`, no outbound dispatch);
  `MergeProjectPrResultSchema.sha?: string` (additive); leaf
  `libs/contracts/src/maestro/merge-watch.schema.ts`
  (`MergeWatch`/`MergeWatchState`) and `apps/api/src/maestro/merge-watch.store.ts`
  (`MergeWatchStore`, `EntityFileStore` subclass, zero imports of its own — safe
  for any module to import directly); `PostMergeWatchService`
  (`apps/api/src/maestro/post-merge-watch.service.ts`) polls via the
  `post-merge-watch` system automation (cron `*/10 * * * *`, `POST_MERGE_WINDOW_MIN
= 120`), never merges/pushes/deploys — only dispatches a gated fix task on red.
  **Final post-F7 briefing section order** (`renderBriefingMarkdown()` in
  `apps/api/src/briefing/briefing-assembly.ts`), for F8c's `personalAgenda` +
  `reminders` additive edit to rebase onto: `## Needs you` → `## Did for you` →
  `## Watching` → `## Subsystems` → `## Security` → `## Merge queue` →
  `## Merged` → `## Quality` → `## Watchers` → `## Gaps I noticed` →
  `## App ideas` → `## Counts`. All post-`## Needs you`/`## Did for you`
  sections follow the same additive-optional-capped-array pattern
  (`?: string[]`, `.max(N)`, conditional spread in `assembleBriefing()`,
  omitted entirely when empty) — F8c's new sections should follow suit and
  append after `## Counts` unless there's a specific reason to interleave
  earlier.

## Planning corrections (verified in code — the audit/roadmap were wrong here)

- PR tier unify: ALREADY SHIPPED (`pipeline-runner.service.ts:1096-1111`, no gate);
  F0b is only the `prOpenMode` draft feature.
- `apps/web/features/goals` hooks are LIVE (useTaskSubmit, GoalDetailPanel) — never
  delete them.
- Only one approval inbox exists (kind-agnostic approvals feed); gaps is
  vault-note-only by design. Candidate follow-up (operator to decide someday):
  route gaps findings into approvals.
- Monitors have no standalone entity — owner derives from Integration; ALL
  integrations seed to `puls` (herald split deferred, `TODO(F-herald)`).
- Orb map handles 10 orbs with zero layout code (ellipseLayout is count-generic);
  only the two `SUBSYSTEM_GLYPH` Record tables must gain codex/ledger keys.

## Notes / gotchas for successors

- Registry target: 10 subsystems after F1a (8 + codex + ledger); hearth arrives in F8.
- `prOpenMode` default is `ready` (preserves current behavior); `draft` opt-in per
  project.
- Validation policy: incremental only (prettier/eslint/scoped vitest per touched
  file); repo-wide suites only at phase completion. `rtk` prefix for shell commands;
  `rtk pnpm typecheck` LIES — call `tsc -p` directly per memory.
- API e2e baseline: `apps/api` pipelines.e2e has 2 pre-existing failures (env
  leak/demo timeout) — do not chase, do not count against a phase.
- **F1b 422 ripple:** any test/tool creating an agent or integration MUST now pass
  `ownerSubsystem` (api e2e suite already fixed wholesale in F1b).
- **self-knowledge prettier trap:** `apps/api/data-test/vault/knowledge/self-knowledge.md`
  is in `.prettierignore` (F1c) because lint-staged silently re-prettifies staged
  `.md` files and breaks `self-knowledge.e2e.test.ts`. Do not remove the ignore.
- **data-test fixture landmines:** `apps/api/data-test` pipeline ids ≠ real
  `.zibby/data/pipelines` ids; running CLI generators with `ZIBBY_DATA_DIR` pointed
  at the shared fixture mutates tracked files (boot backfill + automation seeding)
  — use a temp copy, then `git status --short apps/api/data-test`.
- **check:self-knowledge hook flake:** may fail once with a drift report correlated
  with a stale graphify warning; retry `pnpm self-knowledge:generate` (default env)
  before assuming real drift.
- **self-knowledge fixture regen — pin `GRAPH_REPORT_PATH` too (F7):** when a
  phase's own change is what's driving the drift (e.g. a new `IntegrationKindSchema`
  member changing the `## Channels` count), the plain "temp copy of
  `apps/api/data-test` + `pnpm self-knowledge:generate`" recipe embeds this
  machine's local `graphify-out/GRAPH_REPORT.md` digest into the regenerated note
  if one happens to exist — CI has none, so that would be a NEW phantom drift.
  Also set `GRAPH_REPORT_PATH=/nonexistent/GRAPH_REPORT.md` (same override
  `self-knowledge.e2e.test.ts` applies) before regenerating, and copy back ONLY
  `vault/knowledge/self-knowledge.md` — never the automation/herald/maestro seed
  noise or the agent/pipeline `.md` YAML-normalization diffs the same boot also
  produces. Full recipe + rationale in the F7 implementation-log entry above.
