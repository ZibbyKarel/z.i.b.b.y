# Phase 116 — Automations cleanup + CommandLine-driven create dialog

> Operator ask (2026-07-10): trim system automations to a small, honest set; convert the
> rest to ordinary "prompt automations"; and replace the type/target-picker create dialog
> with the `CommandLine` component (which already knows how to pick agents/pipelines,
> attach files, and steer a prompt). The CommandLine run button reads **"Naplánovat"** and
> **saves** the automation instead of running it; the dialog's own submit button is removed.

This is the master index. Each sub-phase has its own plan file (`phase-116a…g`).

---

## Decisions (locked)

1. **System automations kept** (seeded, `system:true`, non-deletable, reschedule/toggle only):
   | id (data file) | target.type | display name (EN / CS) |
   |---|---|---|
   | `morning-briefing` | `briefing` | Morning briefing / Ranní briefing |
   | `memory-distill` | `memory-distill` | Memory distillation / Destilace paměti |
   | `nightly-patterns` | `pattern-extract` | Pattern extraction / Extrakce vzorů |
   | `gap-detect` | `gap-detect` | **Automation suggestions / Návrhy na automatizaci** (renamed) |
   | `agent-factory` | `agent-factory` | Agent factory / Továrna agentů (**new seed + data file**) |

   `morning-briefing` is promoted from `system:false` → `system:true`. `agent-factory` is
   newly seeded (target type already exists; only the data file/seed were missing).

2. **Removed** (target types + seeds + backing machinery), replaced conceptually by a prompt
   automation the operator creates against an existing pipeline:
   - `discovery` → operator makes a prompt automation targeting the **`code-audit`** pipeline.
     Delete `DiscoveryTriageService` (module/controller/proposals feature stay).
   - `research-digest` → operator targets the **`research`** pipeline. **Keep `ResearchService`**
     (it backs the research contract + Settings → ResearchSection); only drop the automation target.
   - `app-ideas` → operator targets the **`research`** pipeline. Delete the whole
     `apps/api/src/ideas/` dir + `IdeasModule`. Remove the dead `app-ideas-generated` activity kind.
   - Delete data files `discovery-triage.json`, `research-digest.json`, `app-ideas.json`.

3. **Prompt automation = task-spec target.** Add a new `TargetSchema` variant
   `{ type:"task", text, target?: TaskTarget, attachmentSetId?, output?, toolGrants? }`. When it
   fires, the automations `SchedulerService` calls
   **`TaskSchedulerService.createTask(input, now, undefined, target.target, false)`** — reusing
   classification/orchestrator-fallback, project attribution, budget/limit/concurrency, the
   approval gate, the agent/pipeline/goal/chain/orchestrator fan-out, attachment `--add-dir`
   feeding and toolGrants. `code-audit` / `research` pipelines already exist on disk.
   - Attachments + free-text prompt flow for **agent / orchestrator / goal** targets (runner seam);
     **pipeline/chain/subsystem** targets carry neither (pre-existing deferred gap — acceptable).
   - Wire the automation `prompt` into `pipelineRunner.start(..., input)` for the legacy
     `pipeline` target too (one-liner; the runner already accepts `input`).
   - Attachment orphan sweep (`TaskSchedulerService`, 24h TTL) must exempt sets referenced by an
     automation, or the files vanish before the next cron. Use a no-cycle contributor registry
     (automations module contributes referenced ids; task scheduler consults it) — see 116b.

4. **Create dialog** (`AutomationFormDialog`): a schedule/trigger picker (existing
   `ScheduleField` + cron/event toggle) **plus** `<CommandLine submitLabel="Naplánovat"
   onSubmit={save}>`. No dialog submit/create button. `id`/`name` are derived from the typed
   text (`slug(...)`). CommandLine fetches agents/pipelines itself, so the dialog stops passing
   `agents`/`pipelines`.

5. **CommandLine** gains an optional `submitLabel?: string` prop (label only; action still routed
   through `onSubmit` send-delegation). Default behaviour unchanged.

---

## Phases & waves

- **116a** — Backend/contract trim + reshape system automations. *(wave 1)*
- **116b** — Task-spec target + attachments + prompt→pipeline wiring. *(after 116a — same files)*
- **116c** — CommandLine `submitLabel` prop. *(wave 1, independent)*
- **116d** — Create dialog redesign. *(after 116b + 116c)*
- **116e** — DetailScreen edit + AutomationCard for task target. *(after 116d)*
- **116f** — Settings per-system-automation descriptions. *(wave 1, independent)*
- **116g** — Final sweep: i18n, docs, `pnpm check:lint/types/test` green, `graphify update`. *(last)*

Each phase: sonnet subagent implements the phase plan → I review (return for rework if needed)
→ commit → mark done (haiku). Waves run in parallel where dependencies allow.

## Verification per phase
`pnpm check:lint && pnpm check:types && pnpm test` must pass for the touched projects before a
phase is considered done. Contract changes rebuild `@zibby/contracts` consumers.

## Status — all sub-phases done

| Phase | Status | Commit |
|---|---|---|
| 116a | done | `972e6fe3` |
| 116b | done | `2442667d` |
| 116c | done | `07c8e6a4` |
| 116d | done | `38543acf` |
| 116e | done | `4cb93e2e` |
| 116f | done | `ded0aa13` |
| 116g | done | final sweep (i18n parity confirmed, docs cross-checked/fixed, knip run, `check:lint`/`check:types`/`test` green) |

i18n parity, docs (`docs/api/overview.md`, `docs/api/research.md`) and a `knip` dead-code sweep
were verified/fixed in 116g; no orphaned code from 116a–f was found beyond two stale doc
paragraphs (fixed). `pnpm check:lint`, `check:types` and `test` are green (one `runner-core.test.ts`
failure seen under full-suite load did not reproduce on a rerun — pre-existing full-suite flake,
unrelated to this feature).

### Deferred follow-ups (accepted, not blocking)
- **Pipeline/chain/subsystem attachment seam**: a `task`-target automation's attachments only flow
  to an agent/orchestrator/goal destination today — a pipeline/chain/subsystem target carries
  neither prompt-attachment (a pre-existing `TaskSchedulerService`/runner gap, not introduced by
  this feature). Documented in `docs/api/automations.md`.
- **Research digest scheduling**: Phase 116a removed the dedicated `research-digest` automation
  target; there is no default-scheduled digest pass anymore. An operator who wants one back creates
  an ordinary `task`-target automation against the `research` pipeline (see `docs/api/research.md`).
