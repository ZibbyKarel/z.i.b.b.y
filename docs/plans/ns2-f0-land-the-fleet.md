# F0 — Land the Fleet: Implementation Plan

> NS2 phase F0. Planned by Opus subagent, reviewed by orchestrator (addendum at
> bottom — binding). Branch `north-star-2`. Test runner is **vitest everywhere**
> (projects: `api`, `web`, `web-components`, `libs/contracts`, `libs/design-system`).
> Scoped run: `pnpm exec vitest run <file>`. Typecheck per package (NX typecheck is
> unreliable): `pnpm exec tsc -p apps/api/tsconfig.json --noEmit`, same for
> `libs/contracts` and `apps/web`.

## ⚠️ Factual corrections to ROADMAP-2 §F0 (verified in code — plan around these)

1. **"Unify the PR tier" is ALREADY DONE.** `PipelineRunnerService.runOutputs` opens
   the PR immediately, no gate (`pipeline-runner.service.ts:1111` → `openPrOutput`;
   doc at `:1096-1099` says "Tier-2 — act-then-report, no gate"). Nothing sets
   `parkedReason = "output"`; only `resumeOutput` reads it (`:1344`, legacy).
   `pipeline-runner.outputs.test.ts:322-323` already asserts no approval. **F0b is
   therefore ONLY the new `prOpenMode` draft feature.**
2. **`apps/web/features/goals` is NOT dead — do NOT delete.** Live consumers:
   `useCreateGoalMutation` ← `features/tasks/hooks/useTaskSubmit.ts:5,85`;
   `useGoalsQuery` + `useResumeGoalRunMutation` ←
   `features/runs/components/GoalDetailPanel.tsx:15` (rendered in `RunDetail.tsx:770`).
3. **There is no trio of approval inboxes.** Only agent-factory parks approvals
   (`agent-proposal`); gaps writes a vault note only ("Proposes ≠ acts",
   `gap-detector.service.ts:38-39,74-80`); discovery dies in F0a. The kind-agnostic
   approvals feed IS the single inbox already. F0c is minimal (source tag).
4. **CLAUDE.md Law 3 is already amended** (`CLAUDE.md:94-96,126-128`). Only the
   vault `north-star.md:69` ("Any self-modification PR") is stale.

---

## F0a — Delete the discovery orphan (goals stays)

**Verified state:** API module 4 files (`apps/api/src/discovery/{discovery.module,discovery.controller,proposals.storage.service,proposed-task-flow.service}.ts`);
contract 3 files (`libs/contracts/src/discovery/{discovery.contract,proposal.schema,discovery.contract.test}.ts`);
wiring `app.module.ts:17,76`, `app.contract.ts:11,72`, `libs/contracts/src/index.ts:34-35`.
Zero web consumers. Flow already unreachable (scanner retired Phase 116a). The only
producer/registrar of the `proposed-task` approval resolver is
`proposed-task-flow.service.ts:45`; all other occurrences are comments.

**Changes:**

- Delete the 4 API files + dir; delete the 3 contract files + dir.
- `app.module.ts`: remove import `:17` + `DiscoveryModule,` at `:76`.
- `app.contract.ts`: remove import `:11` + `discovery:` key `:72`.
- `libs/contracts/src/index.ts`: remove both export lines `:34-35`.
- **KEEP** `apps/web/features/goals/**` (correction 2).
- **KEEP** `proposed-task` in `ApprovalRunKindSchema` (`approval.schema.ts:19`) —
  stored approvals re-parse on read; removing the value breaks read-compat. Update
  the comment `:16-18`: producer removed in F0a; a pre-existing parked
  `proposed-task` approval is now unresolvable (logged no-op) — acceptable, scanner
  retired long ago.

**Tests:** pure deletion — DoD = three `tsc -p` typechecks green +
`pnpm exec vitest run --project api` + `--project web-components`.

**Commit:** `refactor(api): delete orphan discovery module + contract (F0a)`

---

## F0b — Per-project draft PR mode (`prOpenMode`)

**Verified state:** exactly one `gh pr create` — `WorkspaceService.openPr` argv at
`workspace.service.ts:342` (signature `:311-318`). Call sites: task path
`task-output.service.ts:183` (`openPrNow`, project already loaded `:175-177`;
legacy `resolve` path `:217` has no project — stays `ready`); pipeline path
`pipeline-runner.service.ts:1392` (`openPrOutput` `:1373`, resolve project via
`projectForRun(run)` `:408`). Project schema `project.schema.ts` (`ProjectSchema:207`;
Create `:297` / Update `:310` inherit automatically). UI:
`ProjectBasicsPanel.tsx` (already imports `SelectField` `:6`, body build `:159`,
`checks:` pattern `:196`); test `ProjectBasicsPanel.test.tsx`. i18n `en.json`/`cs.json`.

**Changes (contract first):**

1. `project.schema.ts`: `export const PrOpenModeSchema = z.enum(["ready","draft"]);`
   + `export type PrOpenMode`; add `prOpenMode: PrOpenModeSchema.optional(),` to
   `ProjectSchema` with doc comment (absent = `ready`). `.optional()`, NOT
   `.default()`.
2. `workspace.service.ts`: `draft?: boolean` in `openPr` opts; argv gains
   `...(opts.draft ? ["--draft"] : [])` adjacent to `create`; update method doc.
3. `task-output.service.ts:183`: pass `draft: project?.prOpenMode === "draft"`.
   Legacy `:217` path unchanged + comment.
4. `pipeline-runner.service.ts` `openPrOutput`: resolve
   `const project = await this.projectForRun(run).catch(() => null);` and pass
   `draft: project?.prOpenMode === "draft"`.
5. `ProjectBasicsPanel.tsx`: `SelectField` bound to `prOpenMode`, seed
   `project?.prOpenMode ?? "ready"`, include in submit body (omit when `"ready"`,
   mirroring `checks`).
6. i18n cs+en: `prOpenMode.label` ("Režim otevírání PR"), `.ready` ("Připravené"),
   `.draft` ("Koncept") — under the projects settings namespace.

**Tests:** contracts — `PrOpenModeSchema` accepts/rejects + Project/Update accept
field (`pnpm exec vitest run libs/contracts/src/projects/projects.contract.test.ts`);
workspace — `openPr({draft:true})` argv contains `--draft`, without it doesn't
(mock exec seam); pipeline — extend `pipeline-runner.outputs.test.ts` `pr sink`
case: project `prOpenMode:"draft"` → `openPr` called `draft:true`; KEEP the
no-approval assertion `:323` (roadmap's named test); task —
`task-output.service.test.ts` same draft assertion; web —
`ProjectBasicsPanel.test.tsx` renders select + submit includes `prOpenMode:"draft"`.

**Commit:** `feat(projects): per-project prOpenMode draft PR setting (F0b)`

---

## F0c — One proposal inbox (minimal, honest scope)

**Verified state:** agent-factory parks `agent-proposal` approvals with diff preview
(`agent-proposal-flow.service.ts:20-52,81`), candidates live in the agents store as
`status:"proposed"` (`agents.storage.service.ts:83-84,179`); gaps = vault note only;
approvals web feed is kind-agnostic (no per-kind special-casing found).

**Decision:** the single inbox already exists (ApprovalsService + approvals feed).
Minimal consolidation only:

- Tag proposal origin via the **`detail` JSON envelope** (preferred — zero schema
  migration): `source: "agent-factory"` set where `AgentProposalFlowService`
  requests the approval. Old records without `source` render unchanged.
- Update `proposed-task` comment in `approval.schema.ts:16-18` (producer gone,
  kept for read-compat).
- Web: approvals feed shows an origin chip/label when `detail.source` present.
  DS primitives only, no new screen.
- **Leave gaps as a briefing producer** — converting it to approvals changes its
  documented "vault-only, proposes ≠ acts" semantics. Flagged to operator as a
  possible follow-up, NOT implemented here.
- No new store, no new controller, nothing rebuilt on discovery.

**Tests:** agent-proposal flow test asserts parked approval carries
`detail.source === "agent-factory"`; gaps test still asserts vault-note-only;
web approvals feed test asserts origin label renders.

**Commit:** `refactor(approvals): tag proposal source on the one approvals inbox (F0c)`

---

## F0d — Law-3 text amendment (vault; CLAUDE.md one clause)

**Verified state:** vault `.zibby/data/vault/north-star.md:69` lists
`- Any self-modification PR` under "What ZIBBY Never Does Without Approval" —
contradicts the Tier-2 posture. `:67` "Merge to a production branch" is correct.
CLAUDE.md already correct (`:94-96,126-128`).

**Changes:**

- `north-star.md:69` → `- **Merge** a self-modification PR (opening one is the
  sanctioned autonomous Tier-2 push — see Law 3)`; add one sentence noting PR
  opening is per-project configurable via `prOpenMode` (`ready`/`draft`) and never
  changes the merge gate.
- `CLAUDE.md` Law 3: append clause "…a project may open its PRs as drafts
  (`prOpenMode`), which never changes the merge gate."

**Tests:** none (prose). `git diff` shows only the two markdown files.

**Commit:** `docs(vault): Law 3 — PR-opening is the sanctioned autonomous push (F0d)`

---

## Sequencing

F0a → F0b → F0c → F0d, one commit each, contract before impl within a subphase.
After F0a run all three `tsc -p` typechecks (deep-import safety per NC2 lesson).

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED as written, including all four corrections. Rulings:

- F0c uses the **detail-envelope** variant for `source` (plan's preferred option) —
  no approval schema field migration.
- The gaps→approvals conversion is explicitly OUT of F0; recorded as a candidate
  follow-up in `docs/ns2/PROGRESS.md` notes.
- ROADMAP-2.md gap #2 and §F0b are corrected to match reality (tier unify already
  shipped; F0b = draft mode only) — done by the orchestrator alongside this plan.
- Commit messages end with the standard Co-Authored-By + Claude-Session footers.
