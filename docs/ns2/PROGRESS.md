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

| Phase | Title                                    | Status  | Plan doc | Commit |
| ----- | ---------------------------------------- | ------- | -------- | ------ |
| F0a   | Delete orphans (discovery + goals hooks) | ⬜ next | —        | —      |
| F0b   | PR tier unify + per-project draft mode   | ⬜      | —        | —      |
| F0c   | One proposal inbox                       | ⬜      | —        | —      |
| F0d   | Law-3 text amendment                     | ⬜      | —        | —      |
| F1a   | Contract: ownerSubsystem + registry → 10 | ⬜      | —        | —      |
| F1b   | Backfill/seed mapping + write validation | ⬜      | —        | —      |
| F1c   | Stored roster (service + RosterTab)      | ⬜      | —        | —      |
| F2a   | Switchboard emits subsystem verdicts     | ⬜      | —        | —      |
| F2b   | Per-subsystem dispatcher prompt+fallback | ⬜      | —        | —      |
| F2c   | Classification trace + activity tagging  | ⬜      | —        | —      |
| F3a   | Subsystem gate-rule sets + tier defaults | ⬜      | —        | —      |
| F3b   | Briefing per subsystem (Beacon/Ledger)   | ⬜      | —        | —      |
| F3c   | Approvals/activity filters + get_status  | ⬜      | —        | —      |
| F4a   | Subsystem MOC shelves (record/distill)   | ⬜      | —        | —      |
| F4b   | Retrieval upgrade (tags + link graph)    | ⬜      | —        | —      |
| F4c   | Vault seed + scheduled self-knowledge    | ⬜      | —        | —      |
| F5a   | Sentinel v1 (CVE + secret watch)         | ⬜      | —        | —      |
| F5b   | Maestro v1 (merge queue, read-side)      | ⬜      | —        | —      |
| F5c   | Loom v1 (scheduled quality audit)        | ⬜      | —        | —      |
| F6a   | Herald reply ledger + graduation         | ⬜      | —        | —      |
| F6b   | Live soak harness (opt-in lane)          | ⬜      | —        | —      |
| F6c   | Watcher health probes                    | ⬜      | —        | —      |
| F7a   | Sentry MonitorAdapter                    | ⬜      | —        | —      |
| F7b   | Merge-queue actions + post-merge loop    | ⬜      | —        | —      |
| F8    | Hearth + personal domain                 | ⬜      | —        | —      |

Legend: ⬜ todo · 🟦 planned (plan reviewed) · 🟨 in progress · ✅ done (tests green,
committed) · ⛔ parked (reason in Notes).

## Already done (do NOT redo)

- 2026-07-17 — Five-track core audit (findings folded into `ROADMAP-2.md` "Audit
  Verdict"). North Star II written: `.zibby/data/vault/north-star-2.md`.
- 2026-07-17 — Branch cleanup: 20 local branches verified patch-merged
  (`git cherry` = 0) and deleted. Kept as genuinely unmerged:
  `feat/phase-45-qualify`(10), `feat/todo-chat-detail-width`(3), `develop`(2),
  `feat/speakd-tts-integration`(1), `chore/audit-remediation-plans`(1).

## Notes / gotchas for successors

- Registry target: 10 subsystems after F1a (8 + codex + ledger); hearth arrives in F8.
- `prOpenMode` default is `ready` (preserves current behavior); `draft` opt-in per
  project.
- Validation policy: incremental only (prettier/eslint/scoped vitest per touched
  file); repo-wide suites only at phase completion. `rtk` prefix for shell commands;
  `rtk pnpm typecheck` LIES — call `tsc -p` directly per memory.
- API e2e baseline: `apps/api` pipelines.e2e has 2 pre-existing failures (env
  leak/demo timeout) — do not chase, do not count against a phase.
