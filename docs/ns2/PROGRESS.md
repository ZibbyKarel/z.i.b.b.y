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

| Phase | Title                                    | Status  | Plan doc                                           | Commit     |
| ----- | ---------------------------------------- | ------- | -------------------------------------------------- | ---------- |
| F0a   | Delete discovery orphan (goals STAYS)    | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `c02a68a9` |
| F0b   | Per-project draft PR mode (prOpenMode)   | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `10de4ad3` |
| F0c   | Proposal source tag on approvals inbox   | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `101759d7` |
| F0d   | Law-3 text amendment (vault north-star)  | ✅      | [ns2-f0](../plans/ns2-f0-land-the-fleet.md)        | `d4c53782` |
| F1a   | Contract: ownerSubsystem + registry → 10 | ✅      | [ns2-f1](../plans/ns2-f1-ownership-is-data.md)     | `9e45a8e8` |
| F1b   | Backfill/seed + write 422 + UI selects   | ✅      | [ns2-f1](../plans/ns2-f1-ownership-is-data.md)     | `1037264c` |
| F1c   | Stored roster (service + RosterTab)      | ✅      | [ns2-f1](../plans/ns2-f1-ownership-is-data.md)     | `7d47af2e` |
| F2a   | Switchboard emits subsystem verdicts     | ✅      | [ns2-f2](../plans/ns2-f2-two-stage-dispatch.md)    | `888dc425` |
| F2b   | Per-subsystem dispatcher prompt+fallback | ✅      | [ns2-f2](../plans/ns2-f2-two-stage-dispatch.md)    | `7ede32e9` |
| F2c   | Classification trace + activity tagging  | ✅      | [ns2-f2](../plans/ns2-f2-two-stage-dispatch.md)    | `40a2ee55` |
| F3a   | Subsystem gate-rule sets + tier defaults | ✅      | [ns2-f3](../plans/ns2-f3-policy-accountability.md) | `77628764` |
| F3b   | Briefing per subsystem (Beacon/Ledger)   | ✅      | [ns2-f3](../plans/ns2-f3-policy-accountability.md) | `fab17397` |
| F3c   | Approvals/activity filters + get_status  | ✅      | [ns2-f3](../plans/ns2-f3-policy-accountability.md) | `c9c3dcaa` |
| F4a   | Subsystem MOC shelves (record/distill)   | 🟨 next | [ns2-f4](../plans/ns2-f4-memory-shelves.md)        | —          |
| F4b   | Retrieval upgrade (tags + link graph)    | 🟦      | [ns2-f4](../plans/ns2-f4-memory-shelves.md)        | —          |
| F4c   | Vault seed + scheduled self-knowledge    | 🟦      | [ns2-f4](../plans/ns2-f4-memory-shelves.md)        | —          |
| F5a   | Sentinel v1 (CVE + secret watch)         | 🟦      | [ns2-f5](../plans/ns2-f5-empty-chairs.md)          | —          |
| F5b   | Maestro v1 (merge queue, read-side)      | 🟦      | [ns2-f5](../plans/ns2-f5-empty-chairs.md)          | —          |
| F5c   | Loom v1 (scheduled quality audit)        | 🟦      | [ns2-f5](../plans/ns2-f5-empty-chairs.md)          | —          |
| F6a   | Herald reply ledger + graduation         | 🟦      | [ns2-f6](../plans/ns2-f6-trust-from-record.md)     | —          |
| F6b   | Live soak harness (opt-in lane)          | 🟦      | [ns2-f6](../plans/ns2-f6-trust-from-record.md)     | —          |
| F6c   | Watcher health probes                    | 🟦      | [ns2-f6](../plans/ns2-f6-trust-from-record.md)     | —          |
| F7a   | Sentry MonitorAdapter                    | 🟦      | [ns2-f7](../plans/ns2-f7-monitors-and-actions.md)  | —          |
| F7b   | Merge-queue actions + post-merge loop    | 🟦      | [ns2-f7](../plans/ns2-f7-monitors-and-actions.md)  | —          |
| F8a   | Seat Hearth (registry 10 → 11)           | 🟦      | [ns2-f8](../plans/ns2-f8-hearth-personal.md)       | —          |
| F8b   | Personal domain (marking + capture)      | 🟦      | [ns2-f8](../plans/ns2-f8-hearth-personal.md)       | —          |
| F8c   | Hearth duties v1 (agenda + reminders)    | 🟦      | [ns2-f8](../plans/ns2-f8-hearth-personal.md)       | —          |

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
