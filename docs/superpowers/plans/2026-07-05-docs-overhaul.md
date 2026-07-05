# Docs Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate every living reference doc under `docs/` from Czech to English and bring it current against the code, consolidate the duplicated ops docs, and write full documentation for the ~15 backend modules that currently have none — then rebuild `docs/README.md` as a complete English index.

**Architecture:** Each task is an independent doc-writing unit (own source material, own output file(s), no shared state with sibling tasks) — dispatch one subagent per task. The only task with a real dependency is the last one (README rebuild + link-check), which needs every other task's final filenames to be settled first.

**Tech Stack:** Markdown only. No code changes. Verification is `grep`/`find`-based (no diacritics remaining, no dead links, no placeholder markers) since there's no compiler or test runner for prose.

## Global Constraints

- No Czech diacritics (á č ď é ě í ň ó ř š ť ú ů ý ž, upper/lowercase) remain in any translated file — verified with `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]'`.
- New `api/*.md` pages follow the existing template: a **Pieces** table (`file → role`), a **Flow** walkthrough, and an **Endpoints** section where the module exposes one — same bar as `docs/api/gaps.md` and `docs/api/research.md`. Read both before writing any new page.
- Out of scope, do not touch: `docs/plans/`, `docs/research/`, `docs/superpowers/`.
- No code changes — this is a docs-only pass. Do not run `pnpm lint`/`typecheck`/`test` as a gate for these tasks (nothing executable changed); the per-task verification commands below replace that.
- The "Klíčové principy" / "Laws" table (wherever it appears — README today) must match the **Laws (non-negotiable)** section of the root `CLAUDE.md` verbatim in meaning; do not paraphrase a law into something weaker or stronger.
- One commit per task, docs files only.

---

### Task 1: Translate `architecture.md` and `run-states.md`

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/run-states.md`

**Interfaces:**
- Consumes: current content of both files (Czech); current monorepo layout (`apps/`, `libs/` top-level dirs) and the run-state enum — search `apps/api/src` for the run status type (e.g. `grep -rn "RunStatus" libs/contracts/src`) to confirm the 11 states and their names haven't drifted from what `run-states.md` describes.
- Produces: `docs/architecture.md`, `docs/run-states.md` — both linked from the README's Architecture section (Task 15 consumes these paths, unchanged from today).

- [ ] **Step 1: Read sources**
  Read `docs/architecture.md`, `docs/run-states.md` in full. Read `apps/api/src` top-level module list (`ls apps/api/src`) and the run status enum in `libs/contracts` to check both docs are still accurate, not just translate word-for-word.

- [ ] **Step 2: Rewrite both files in English**
  Translate to English, correcting any content that no longer matches the current code (module list, run state names/count, data flow). Keep existing heading structure and tables; only change language and stale facts.

- [ ] **Step 3: Verify no Czech remains**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/architecture.md docs/run-states.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/architecture.md docs/run-states.md
  git commit -m "docs: translate architecture and run-states to English"
  ```

---

### Task 2: Rename and translate `approval-gates.md`

**Files:**
- Create: `docs/approval-gates.md` (renamed from `docs/aproval-gates.md`)
- Delete: `docs/aproval-gates.md`

**Interfaces:**
- Consumes: current content of `docs/aproval-gates.md`; current gate/approval code under `apps/api/src/gates`, `apps/api/src/gate-rules`, `apps/api/src/approvals`.
- Produces: `docs/approval-gates.md` (Task 15's README must link this corrected filename, not the old typo'd one).

- [ ] **Step 1: Read source**
  Read `docs/aproval-gates.md` in full, and skim `apps/api/src/gates`, `apps/api/src/gate-rules`, `apps/api/src/approvals` to confirm the tier/policy description still matches current code (e.g. the autonomy tiers described in root `CLAUDE.md`'s "The autonomy contract" section).

- [ ] **Step 2: Write the renamed file**
  ```bash
  git mv docs/aproval-gates.md docs/approval-gates.md
  ```
  Translate the moved file to English, refreshing any stale content found in Step 1.

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/approval-gates.md`
  Expected: no output.
  Run: `test -f docs/aproval-gates.md && echo STILL_EXISTS || echo GONE`
  Expected: `GONE`.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/approval-gates.md
  git commit -m "docs: rename aproval-gates.md to approval-gates.md and translate to English"
  ```

---

### Task 3: Translate `api/overview.md`, `api/agents-runs.md`, `api/pipelines.md`

**Files:**
- Modify: `docs/api/overview.md`
- Modify: `docs/api/agents-runs.md`
- Modify: `docs/api/pipelines.md`

**Interfaces:**
- Consumes: current file content; `apps/api/src/main.ts`/app module for `overview.md`; `apps/api/src/agents`, `apps/api/src/runner` for `agents-runs.md`; `apps/api/src/pipelines` for `pipelines.md`.
- Produces: three refreshed English files at the same paths.

- [ ] **Step 1: Read sources**
  Read all three docs, then skim the matching source dirs listed above to confirm module names, endpoints, and flow descriptions are current.

- [ ] **Step 2: Rewrite in English**
  Translate each file, correcting drift against current code.

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/api/overview.md docs/api/agents-runs.md docs/api/pipelines.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/api/overview.md docs/api/agents-runs.md docs/api/pipelines.md
  git commit -m "docs: translate api overview/agents-runs/pipelines to English"
  ```

---

### Task 4: Translate `api/gates.md`, `api/tasks.md`, `api/memory.md`

**Files:**
- Modify: `docs/api/gates.md`
- Modify: `docs/api/tasks.md`
- Modify: `docs/api/memory.md`

**Interfaces:**
- Consumes: current file content; `apps/api/src/gates`, `apps/api/src/gate-rules` for `gates.md`; `apps/api/src/tasks` for `tasks.md`; `apps/api/src/memory` for `memory.md`.
- Produces: three refreshed English files at the same paths.

- [ ] **Step 1: Read sources**
  Read all three docs and the matching source dirs.

- [ ] **Step 2: Rewrite in English**
  Translate each file, correcting drift against current code (e.g. budget-guard fields in `tasks.md` should match `apps/api/src/budget` behavior described once Task 11 exists — a forward cross-reference is fine, don't duplicate the budget module's own detail here).

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/api/gates.md docs/api/tasks.md docs/api/memory.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/api/gates.md docs/api/tasks.md docs/api/memory.md
  git commit -m "docs: translate api gates/tasks/memory to English"
  ```

---

### Task 5: Translate `api/channels.md`, `api/activity.md`, `api/approvals.md`

**Files:**
- Modify: `docs/api/channels.md`
- Modify: `docs/api/activity.md`
- Modify: `docs/api/approvals.md`

**Interfaces:**
- Consumes: current file content; `apps/api/src/channels` for `channels.md`; `apps/api/src/activity`, `apps/api/src/activity-view` for `activity.md`; `apps/api/src/approvals` for `approvals.md`.
- Produces: three refreshed English files at the same paths.

- [ ] **Step 1: Read sources**
  Read all three docs and the matching source dirs.

- [ ] **Step 2: Rewrite in English**
  Translate each file, correcting drift (e.g. the email notify-only redesign and the `LINK_BOILERPLATE_RE` triage fix should already be reflected in `channels.md` if it currently describes autonomous email replies — check current `apps/api/src/channels` code before asserting behavior).

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/api/channels.md docs/api/activity.md docs/api/approvals.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/api/channels.md docs/api/activity.md docs/api/approvals.md
  git commit -m "docs: translate api channels/activity/approvals to English"
  ```

---

### Task 6: Translate `api/automations.md`, `api/extensibility.md`

**Files:**
- Modify: `docs/api/automations.md`
- Modify: `docs/api/extensibility.md`

**Interfaces:**
- Consumes: current file content; `apps/api/src/automations` for `automations.md`; `apps/api/src/commands`, `apps/api/src/mcp`, `apps/api/src/hooks` for `extensibility.md`.
- Produces: two refreshed English files at the same paths.

- [ ] **Step 1: Read sources**
  Read both docs and the matching source dirs.

- [ ] **Step 2: Rewrite in English**
  Translate each file, correcting drift.

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/api/automations.md docs/api/extensibility.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/api/automations.md docs/api/extensibility.md
  git commit -m "docs: translate api automations/extensibility to English"
  ```

---

### Task 7: Translate `api/chains.md`, `api/chat.md`, `api/machine.md`, `api/monitors.md`

**Files:**
- Modify: `docs/api/chains.md`
- Modify: `docs/api/chat.md`
- Modify: `docs/api/machine.md`
- Modify: `docs/api/monitors.md`

**Interfaces:**
- Consumes: current file content; `apps/api/src/chains` for `chains.md`; `apps/api/src/chat` for `chat.md`; `apps/api/src/machine` for `machine.md`; `apps/api/src/monitors` for `monitors.md`.
- Produces: four refreshed English files at the same paths (all four were previously missing from the README index — Task 15 must link all four).

- [ ] **Step 1: Read sources**
  Read all four docs and the matching source dirs.

- [ ] **Step 2: Rewrite in English**
  Translate each file, correcting drift.

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/api/chains.md docs/api/chat.md docs/api/machine.md docs/api/monitors.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/api/chains.md docs/api/chat.md docs/api/machine.md docs/api/monitors.md
  git commit -m "docs: translate api chains/chat/machine/monitors to English"
  ```

---

### Task 8: Review `api/gaps.md`, `api/research.md` for currency (no translation needed)

**Files:**
- Modify (if drift found): `docs/api/gaps.md`
- Modify (if drift found): `docs/api/research.md`

**Interfaces:**
- Consumes: current file content (already English); `apps/api/src/gaps` for `gaps.md`; `apps/api/src/research` for `research.md`.
- Produces: confirmed-current versions of both files at the same paths (Task 15 links both — they were previously orphaned from the README index despite existing).

- [ ] **Step 1: Read and compare**
  Read both docs. Read `apps/api/src/gaps` and `apps/api/src/research` and confirm every file/behavior claim in the docs (file paths, endpoint list, scheduling cron strings) still matches current code.

- [ ] **Step 2: Fix any drift found**
  Update only what's actually stale — these files don't need a language pass, just a correctness check.

- [ ] **Step 3: Verify**
  Run: `grep -iE 'TBD|TODO|FIXME' docs/api/gaps.md docs/api/research.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/api/gaps.md docs/api/research.md
  git commit -m "docs: verify api gaps/research docs are current"
  ```
  (If no changes were needed, skip the commit — note that in the task result instead.)

---

### Task 9: Translate `web/overview.md`, `web/state.md`, `libs/contracts.md`, `libs/design-system.md`

**Files:**
- Modify: `docs/web/overview.md`
- Modify: `docs/web/state.md`
- Modify: `docs/libs/contracts.md`
- Modify: `docs/libs/design-system.md`

**Interfaces:**
- Consumes: current file content; `apps/web/app`, `apps/web/features` for `web/overview.md`; TanStack Query conventions (see root `CLAUDE.md`'s "TanStack Query" section) for `web/state.md`; `libs/contracts/src` for `contracts.md`; `libs/design-system` for `design-system.md`.
- Produces: four refreshed English files at the same paths.

- [ ] **Step 1: Read sources**
  Read all four docs. Cross-check `web/overview.md`'s route list against `ls apps/web/app/\(dashboard\)`, and `libs/contracts.md`'s domain list against `ls libs/contracts/src` (30 domains today — confirm the doc doesn't only list a stale subset).

- [ ] **Step 2: Rewrite in English**
  Translate each file, correcting drift (route list, contract domain list, DS conventions per root `CLAUDE.md`'s "Design system" section).

- [ ] **Step 3: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/web/overview.md docs/web/state.md docs/libs/contracts.md docs/libs/design-system.md`
  Expected: no output.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/web/overview.md docs/web/state.md docs/libs/contracts.md docs/libs/design-system.md
  git commit -m "docs: translate web and libs docs to English"
  ```

---

### Task 10: Consolidate ops docs

**Files:**
- Modify: `docs/ops/deployment.md`
- Modify: `docs/ops/environment.md`
- Modify: `docs/ops/self-development.md`
- Delete: `docs/ops.md`

**Interfaces:**
- Consumes: current content of all four files; `ops/com.zibby.api.plist`, `ops/com.zibby.backup.plist`, `ops/zibby.newsyslog.conf`, `apps/api/scripts/backup.sh` for verifying deployment claims; `apps/api/src/system/system-config.store.ts` for the runtime system-config table in `environment.md`.
- Produces: `docs/ops/deployment.md`, `docs/ops/environment.md`, `docs/ops/self-development.md` (all English, all linked from Task 15's README); `docs/ops.md` no longer exists.

- [ ] **Step 1: Read all four sources**
  Read `docs/ops.md` (top-level, already English, more complete), `docs/ops/deployment.md` and `docs/ops/environment.md` (Czech, thinner, older), and `docs/ops/self-development.md` (Czech). Note that `docs/ops.md`'s content (launchd install, budgets & caps, backups, log rotation, CI, the "rebooted once" rehearsal) is the more current and complete version of what `ops/deployment.md` and `ops/environment.md` only partially cover.

- [ ] **Step 2: Merge into `ops/deployment.md`**
  Rewrite `docs/ops/deployment.md` in English using `docs/ops.md`'s content as the base (launchd install/management, budgets & caps, backups, log rotation, CI, the rehearsal section), folded together with anything `ops/deployment.md` had that `ops.md` didn't (e.g. specific plist snippet details).

- [ ] **Step 3: Merge into `ops/environment.md`**
  Rewrite `docs/ops/environment.md` in English, combining `docs/ops.md`'s env var table with `ops/environment.md`'s existing (more detailed) runtime `system-config.json` key table. Verify the system-config keys against `apps/api/src/system/system-config.store.ts` — the doc must list every key the store actually reads.

- [ ] **Step 4: Translate `self-development.md` and fix its dead link**
  Translate `docs/ops/self-development.md` to English. It links `../plans/phase-12.md`, which does not exist under `docs/plans/` (that directory only has `phase-01.md` through `phase-05.md`, for an unrelated plan). Remove that link — replace with a plain-text reference to "the Phase 12 post-mortem (see git history around commit `96d1294`)" rather than inventing a target file.

- [ ] **Step 5: Delete the top-level file**
  ```bash
  git rm docs/ops.md
  ```

- [ ] **Step 6: Verify**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/ops/deployment.md docs/ops/environment.md docs/ops/self-development.md`
  Expected: no output.
  Run: `test -f docs/ops.md && echo STILL_EXISTS || echo GONE`
  Expected: `GONE`.
  Run: `grep -n "phase-12.md" docs/ops/self-development.md`
  Expected: no output.

- [ ] **Step 7: Commit**
  ```bash
  git add docs/ops/deployment.md docs/ops/environment.md docs/ops/self-development.md
  git commit -m "docs: consolidate ops.md into docs/ops/, translate to English, fix dead link"
  ```

---

### Task 11: New docs — Tier 1 batch A: `api/goals.md`, `api/budget.md`, `api/briefing.md`

**Files:**
- Create: `docs/api/goals.md`
- Create: `docs/api/budget.md`
- Create: `docs/api/briefing.md`

**Interfaces:**
- Consumes: `docs/api/gaps.md` and `docs/api/research.md` as the style template (Pieces table → Flow → Endpoints); source dirs `apps/api/src/goals` (`goal-runner.service.ts`, `goals.storage.service.ts`, `goals.controller.ts`, `goals.errors.ts`, `goal-stop.ts`, plus the `*.test.ts` files for behavior clues), `apps/api/src/budget` (`budget.service.ts`, `budget-config.store.ts`, `ledger.store.ts`, `budget.controller.ts`), `apps/api/src/briefing` (`briefing.service.ts`, `briefing-assembly.ts`, `claude-cli-briefer.ts`, `briefing.controller.ts`); contracts at `libs/contracts/src/goals`, `libs/contracts/src/budget`, `libs/contracts/src/briefing`.
- Produces: `docs/api/goals.md`, `docs/api/budget.md`, `docs/api/briefing.md` (Task 15 links all three under Backend).

- [ ] **Step 1: Read the template and sources**
  Read `docs/api/gaps.md` and `docs/api/research.md` in full to internalize the template. Read every file listed above for all three modules, plus the relevant contract dirs.

- [ ] **Step 2: Write `docs/api/goals.md`**
  Cover: the goal loop engine (maker/verifier cycle referenced in root `CLAUDE.md`'s "The delivery loop"), `GoalRunnerService`'s run lifecycle, storage format (`goals.storage.service.ts`), stop/park semantics (`goal-stop.ts`, `goals.errors.ts`), and the controller's endpoints. Use a Pieces table, a Flow section, and an Endpoints section.

- [ ] **Step 3: Write `docs/api/budget.md`**
  Cover: `BudgetService`'s enforcement logic, `BudgetConfigStore` (global caps: `pauseAtRollingPct`/`pauseAtWeeklyPct`), `LedgerStore` (the dispatch ledger), and per-project `dailyRuns`/`weeklyRuns`/`maxConcurrent` caps (cross-reference `docs/ops/environment.md`'s "Budgets & caps" section from Task 10 rather than duplicating it — link to it instead). Use a Pieces table, a Flow section, and an Endpoints section.

- [ ] **Step 4: Write `docs/api/briefing.md`**
  Cover: `BriefingService`, `briefing-assembly.ts` (how sections are assembled — gaps, research, activity, approvals), and `claude-cli-briefer.ts` (if it shells out to `claude -p` for the summary, describe that seam explicitly, since it's the one LLM-in-the-loop piece of this module). Use a Pieces table, a Flow section, and an Endpoints section.

- [ ] **Step 5: Verify**
  Run: `grep -c '^## ' docs/api/goals.md docs/api/budget.md docs/api/briefing.md`
  Expected: each file reports 2 or more.
  Run: `grep -iE 'TBD|TODO|FIXME' docs/api/goals.md docs/api/budget.md docs/api/briefing.md`
  Expected: no output.

- [ ] **Step 6: Commit**
  ```bash
  git add docs/api/goals.md docs/api/budget.md docs/api/briefing.md
  git commit -m "docs: add goals/budget/briefing module docs"
  ```

---

### Task 12: New docs — Tier 1 batch B: `api/mandate.md`, `api/integrations.md`, `api/system.md`

**Files:**
- Create: `docs/api/mandate.md`
- Create: `docs/api/integrations.md`
- Create: `docs/api/system.md`

**Interfaces:**
- Consumes: `docs/api/gaps.md` / `docs/api/research.md` as style template; source dirs `apps/api/src/mandate` (`mandate.storage.service.ts`, `mandate.controller.ts`), `apps/api/src/integrations` (`integrations.storage.service.ts`, `credentials.store.ts`, `credential-kind.ts`, `connection-tester.ts`, `integrations.controller.ts`), `apps/api/src/system` (`system-config.store.ts`, `system.controller.ts`); contracts at `libs/contracts/src/mandate`, `libs/contracts/src/integrations`, `libs/contracts/src/system`.
- Produces: `docs/api/mandate.md`, `docs/api/integrations.md`, `docs/api/system.md` (Task 15 links all three).

- [ ] **Step 1: Read the template and sources**
  Read `docs/api/gaps.md` / `docs/api/research.md`. Read every listed file for all three modules and the matching contract dirs.

- [ ] **Step 2: Write `docs/api/mandate.md`**
  Cover: what "mandate" means in this codebase (the autonomy scope a channel/project operates under — cross-reference root `CLAUDE.md`'s "The autonomy contract" section rather than re-deriving the tier definitions), `MandateStorageService`'s persistence, and the controller's endpoints.

- [ ] **Step 3: Write `docs/api/integrations.md`**
  Cover: `IntegrationsStorageService`, the credential model (`credential-kind.ts` — note the rule from memory: email uses `{password}`, else `{token}`), `ConnectionTester`, and how integrations are now scoped under a project (cross-reference `docs/web/overview.md`'s routing section — integrations live on the project detail page, not a standalone `/integrations` route).

- [ ] **Step 4: Write `docs/api/system.md`**
  Cover: `SystemConfigStore` (the file-backed runtime config replacing start-only env knobs — same keys documented in `docs/ops/environment.md` from Task 10, link rather than duplicate the table), and the system policy floor endpoints (`GET/PUT /api/system/config`, plus whatever `system.controller.ts` exposes for the locked POLICY.md floor referenced in the web `/gates` page).

- [ ] **Step 5: Verify**
  Run: `grep -c '^## ' docs/api/mandate.md docs/api/integrations.md docs/api/system.md`
  Expected: each file reports 2 or more.
  Run: `grep -iE 'TBD|TODO|FIXME' docs/api/mandate.md docs/api/integrations.md docs/api/system.md`
  Expected: no output.

- [ ] **Step 6: Commit**
  ```bash
  git add docs/api/mandate.md docs/api/integrations.md docs/api/system.md
  git commit -m "docs: add mandate/integrations/system module docs"
  ```

---

### Task 13: New docs — Tier 2 batch A: `api/workspace.md`, `api/artifacts.md`, `api/limits.md`, `api/discovery.md`

**Files:**
- Create: `docs/api/workspace.md`
- Create: `docs/api/artifacts.md`
- Create: `docs/api/limits.md`
- Create: `docs/api/discovery.md`

**Interfaces:**
- Consumes: `docs/api/gaps.md` / `docs/api/research.md` as style template; source dirs `apps/api/src/workspace` (`workspace.service.ts` — no contract dir, likely internal-only), `apps/api/src/artifacts` (`artifacts.storage.service.ts`, `artifacts.controller.ts`), `apps/api/src/limits` + `apps/api/src/limits-resume` (`limits.service.ts`, `rate-limits.reader.ts`, `usage-fetcher.ts`, `limit-resume.service.ts`, `limits.controller.ts`), `apps/api/src/discovery` (`discovery-triage.service.ts`, `proposals.storage.service.ts`, `proposed-task-flow.service.ts`, `discovery.controller.ts`); contracts at `libs/contracts/src/artifacts`, `libs/contracts/src/limits`, `libs/contracts/src/discovery` (note: no `libs/contracts/src/workspace` — confirm in Step 1 whether `workspace.service.ts` is consumed only internally, e.g. by the goal runner for worktree setup, and document it as internal with no public endpoint if so).
- Produces: `docs/api/workspace.md`, `docs/api/artifacts.md`, `docs/api/limits.md`, `docs/api/discovery.md` (Task 15 links all four).

- [ ] **Step 1: Read the template and sources**
  Read `docs/api/gaps.md` / `docs/api/research.md`. Read every listed file for all four modules and the matching contract dirs (where they exist).

- [ ] **Step 2: Write `docs/api/workspace.md`**
  Cover what `WorkspaceService` actually does (read its callers with `grep -rn "WorkspaceService" apps/api/src` to find who consumes it) — likely worktree/checkout path resolution for self-development (cross-reference the Builder ≠ Subject rule in `docs/ops/self-development.md` from Task 10). State plainly if it has no HTTP surface.

- [ ] **Step 3: Write `docs/api/artifacts.md`**
  Cover: the artifact provenance registry (`ArtifactsStorageService`), what a "durable artifact" record looks like, and the controller's endpoints. Cross-reference root `CLAUDE.md`'s "Pipelines & artifacts" section for the concept, but document the actual storage/API here.

- [ ] **Step 4: Write `docs/api/limits.md`**
  Cover both `limits/` (rate-limit reading — `rate-limits.reader.ts`, `usage-fetcher.ts`, `limits.service.ts`) and `limits-resume/` (`LimitResumeService` — the daemon that resumes paused-on-limit runs, checkpoint commits) as one page with two clearly labeled sections, since they're one user-facing concern (limit resilience). Include the controller's endpoints.

- [ ] **Step 5: Write `docs/api/discovery.md`**
  Cover: `DiscoveryTriageService` (bug/request triage from inbound channels), `ProposalsStorageService`, `ProposedTaskFlowService` (how a triaged item becomes a proposed task), and the controller's endpoints.

- [ ] **Step 6: Verify**
  Run: `grep -c '^## ' docs/api/workspace.md docs/api/artifacts.md docs/api/limits.md docs/api/discovery.md`
  Expected: each file reports 2 or more.
  Run: `grep -iE 'TBD|TODO|FIXME' docs/api/workspace.md docs/api/artifacts.md docs/api/limits.md docs/api/discovery.md`
  Expected: no output.

- [ ] **Step 7: Commit**
  ```bash
  git add docs/api/workspace.md docs/api/artifacts.md docs/api/limits.md docs/api/discovery.md
  git commit -m "docs: add workspace/artifacts/limits/discovery module docs"
  ```

---

### Task 14: New docs — Tier 2 batch B: `api/ideas.md`, `api/patterns.md`, `api/pins.md`, `api/events.md`, `api/health.md`

**Files:**
- Create: `docs/api/ideas.md`
- Create: `docs/api/patterns.md`
- Create: `docs/api/pins.md`
- Create: `docs/api/events.md`
- Create: `docs/api/health.md`

**Interfaces:**
- Consumes: `docs/api/gaps.md` / `docs/api/research.md` as style template; source dirs `apps/api/src/ideas` (`idea-generator.service.ts`), `apps/api/src/patterns` (`pattern-extractor.service.ts`), `apps/api/src/pins` (`pins.store.ts`, `pins.controller.ts`), `apps/api/src/events` (`events.controller.ts` — already read during planning; it's the single multiplexed SSE channel merging agent-run/pipeline-run/goal-run/channel/activity events, see the doc comment at the top of the file), `apps/api/src/health` (`subsystem-health.service.ts`, `health.controller.ts`); contracts at `libs/contracts/src/pins`, `libs/contracts/src/health` (note: no `libs/contracts/src/ideas`, `libs/contracts/src/patterns`, or `libs/contracts/src/events` — confirm in Step 1 whether these are internal-only, and for `events` specifically document it as a raw NestJS `@Sse` endpoint outside the ts-rest contract, matching root `CLAUDE.md`'s "SSE for live streams" DNA rule).
- Produces: `docs/api/ideas.md`, `docs/api/patterns.md`, `docs/api/pins.md`, `docs/api/events.md`, `docs/api/health.md` (Task 15 links all five).

- [ ] **Step 1: Read the template and sources**
  Read `docs/api/gaps.md` / `docs/api/research.md`. Read every listed file for all five modules and the matching contract dirs (where they exist).

- [ ] **Step 2: Write `docs/api/ideas.md`**
  Cover: `IdeaGeneratorService` — what it generates, from what input, where it writes output (likely a vault suggestions note, similar to `GapDetector` in `docs/api/gaps.md` — check if it follows the same "proposes ≠ acts" pattern).

- [ ] **Step 3: Write `docs/api/patterns.md`**
  Cover: `PatternExtractorService` — what patterns it extracts and from what source (likely activity log or run history), and what consumes its output.

- [ ] **Step 4: Write `docs/api/pins.md`**
  Cover: `PinsStore` and the controller — the quick-launch pins feature (per the most recent commit, "run cost, chain TaskTarget, quick-launch pins" — check `git log --oneline -- apps/api/src/pins` if the current doc-writing agent needs the change history for context).

- [ ] **Step 5: Write `docs/api/events.md`**
  Cover: the single multiplexed `GET /api/events` SSE endpoint — every scope it merges (`agent-runs`, `pipeline-runs`, `goal-runs`, `channel-items`, `activity`), the "thin invalidation signal, client refetches" design (quote the doc comment in `events.controller.ts` for the exact rationale), and the heartbeat. This is the concrete implementation of the "SSE for live streams, polling for state" DNA rule — say so explicitly.

- [ ] **Step 6: Write `docs/api/health.md`**
  Cover: `SubsystemHealthService` and the controller's endpoints — what subsystems it checks and what a healthy/unhealthy response looks like.

- [ ] **Step 7: Verify**
  Run: `grep -c '^## ' docs/api/ideas.md docs/api/patterns.md docs/api/pins.md docs/api/events.md docs/api/health.md`
  Expected: each file reports 2 or more.
  Run: `grep -iE 'TBD|TODO|FIXME' docs/api/ideas.md docs/api/patterns.md docs/api/pins.md docs/api/events.md docs/api/health.md`
  Expected: no output.

- [ ] **Step 8: Commit**
  ```bash
  git add docs/api/ideas.md docs/api/patterns.md docs/api/pins.md docs/api/events.md docs/api/health.md
  git commit -m "docs: add ideas/patterns/pins/events/health module docs"
  ```

---

### Task 15: Rebuild `docs/README.md` and verify the whole tree

**Files:**
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: every file path produced by Tasks 1–14 (all must exist and be committed before this task starts); root `CLAUDE.md`'s "Laws (non-negotiable)" section as the source of truth for the principles table.
- Produces: `docs/README.md` — the final English index; this is the last task in the plan.

- [ ] **Step 1: Enumerate every doc file**
  Run: `find docs -maxdepth 3 -name "*.md" -not -path "docs/plans/*" -not -path "docs/research/*" -not -path "docs/superpowers/*" | sort`
  Confirm the list includes: `README.md`, `architecture.md`, `run-states.md`, `approval-gates.md`, all 32 files under `docs/api/` (15 translated in Tasks 3–7 + 2 reviewed in Task 8 + 6 Tier 1 new in Task 11–12 + 9 Tier 2 new in Task 13–14 — every module documented gets a page, none are skipped as "internal-only" even if it has no HTTP endpoint, per Task 13/14's instructions to say so plainly instead of omitting the page), `web/overview.md`, `web/state.md`, `libs/contracts.md`, `libs/design-system.md`, `ops/deployment.md`, `ops/environment.md`, `ops/self-development.md`. Confirm `docs/ops.md` and `docs/aproval-gates.md` do NOT appear.

- [ ] **Step 2: Rewrite `docs/README.md` in English**
  Rebuild the index with sections: Architecture, Backend (apps/api) — one line per `api/*.md` file with a short description, Frontend (apps/web), Shared libraries (libs/), Ops & infrastructure. Every file from Step 1's list must have exactly one link. Translate the "Klíčové principy" table to "Key principles" / "Laws", copied from root `CLAUDE.md`'s "Laws (non-negotiable)" section — five laws, not paraphrased into something different.

- [ ] **Step 3: Link-check the whole docs tree**
  Run this check (adjust the loop if your shell needs it):
  ```bash
  for f in $(find docs -maxdepth 3 -name "*.md" -not -path "docs/plans/*" -not -path "docs/research/*" -not -path "docs/superpowers/*"); do
    dir=$(dirname "$f")
    grep -oE '\]\(\.{1,2}/[^)]+\.md[^)]*\)' "$f" | sed -E 's/^\]\((.*)\)$/\1/' | while read -r link; do
      target=$(echo "$link" | sed -E 's/#.*$//')
      resolved=$(cd "$dir" && realpath -m "$target" 2>/dev/null)
      [ -f "$resolved" ] || echo "BROKEN in $f -> $link"
    done
  done
  ```
  Expected: no `BROKEN` lines. Fix any that appear (either the link or the missing file).

- [ ] **Step 4: Verify no Czech remains in the README**
  Run: `grep -oE '[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]' docs/README.md`
  Expected: no output.

- [ ] **Step 5: Full read-through**
  Read the finished `docs/README.md` top to bottom once as a reader would, checking every section is present, every link text matches its target's actual topic, and terminology is consistent (e.g. "run" vs "task run", "gate" vs "approval gate" — pick one per concept and use it throughout; if Task 1–14's output disagrees, fix the README's link description rather than rewriting fourteen other files).

- [ ] **Step 6: Commit**
  ```bash
  git add docs/README.md
  git commit -m "docs: rebuild README as full English index linking every doc"
  ```

---

## Execution note

Tasks 1–14 have no dependencies on each other and can be dispatched in parallel batches (they touch disjoint files). Task 15 must run last, after every other task's commit has landed, since it depends on final filenames and needs to link everything that exists.
