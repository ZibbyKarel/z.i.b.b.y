# ZIBBY — planning/process/design research for the "company redesign" night run

All paths relative to `/Users/zibby/Workspace/z.i.b.b.y`.

## 1. Top-level status docs

**`ROADMAP.md`** — "Roadmap I" (baselined 2026-07-01). Covers convergence phases
N1–N5 (DNA alignment/SSE/classifier-override, pipeline chaining, CI monitor seam,
UI/UX consistency, "controlling the machine") plus a continuous **NC** (simplify /
fix-architecture / fix-bugs) track. **Status: fully exhausted** — every phase down
to N5b is marked ✅ DELIVERED, tail note says "roadmapa je vyčerpaná... doporučený
další krok je OPERÁTORŮV: otevřít PR z north-star → main." Superseded by ROADMAP-2.
States the still-binding architectural principles (files-as-truth, approval-first
floor, contract-first, index-first memory, SSE-for-streams, explicit-target-overrides
classifier, one interaction grammar, per-project gate floor, single operator).

**`ROADMAP-2.md`** — "Roadmap II: The Federation" (baselined 2026-07-17). Moves ZIBBY
from "a working monolith" to **8 (→11) accountable subsystems** — this is the direct
conceptual precedent for a company/departments redesign, see §7. Phase map F0–F9 + FC
(continuous). Per `docs/ns2/PROGRESS.md` status table, **all of F0–F9 are ✅ done**
(F9 uncommitted on its own branch `ns2-f9-subsystem-only-dispatch` at time of
writing). ROADMAP-2 states one new law on top of North Star I's: **"ownership is
explicit — every dispatchable unit belongs to exactly one subsystem; every subsystem
can account for everything it owns. No orphan agents, no derived rosters, no unowned
heartbeats."**

**`TODO.md`** — flat numbered operator-reported backlog (Czech), not phase-numbered.
13 items, done ones checked `[x]` with a `(branch@sha)` suffix. Currently open:
items 3–8, 10, 11 (verifier ignoring its own verdict, no independent deterministic
verify phase in delivery pipeline, no QA/critic phase, no intra-run parallelism, no
planner that produces file-scoped tasks, can't talk to a running run, ambient
skill-leakage into runs, GitHub team-mention watching). This is the *currently
active* backlog mechanism (most recent commits on `main` close TODO items 12–13),
separate from and more granular than the two ROADMAPs.

**`PROGRESS.md`** — root-level **phase log for the original N1–N5/NC track** (Czech).
One dated entry per landed phase: what shipped, the commit, gotchas found, suite
pass count, and a link to that phase's `docs/plans/phase-*.md`. Ends "Zaparkováno /
známé dluhy: (nic)" and a final recommendation to open the PR from `north-star` →
`main`. This is the template later superseded by the arc-scoped `PROGRESS.md` files
under `docs/ns2/`, `docs/hud2chat/`, `docs/plans/phase-125/`, `docs/plans/phase-126/`.

## 2. Plan format conventions

Two plan locations exist:
- `plans/` (root) — one-off, less formal (e.g. `plans/agents-skills-pipelines.md`,
  a recon → phased import plan for agents/skills/pipelines from community
  collections, with a "Zjištění z reconu" section up front).
- `docs/plans/` — the real convention, ~140 files. Two shapes:
  1. **Single-file per (sub-)phase**, e.g. `phase-NN-slug.md`, `hud2chat-FN-slug.md`,
     `ns2-fN-slug.md`. One plan can cover several lettered sub-phases (`phase-116a`…
     `phase-116g`, `phase-126a`…`phase-126g`).
  2. **Arc folder** for a big multi-wave push: `docs/plans/phase-125/` and
     `docs/plans/phase-126/`, each holding `ROADMAP.md` (execution order/waves),
     `DECISIONS.md` (append-only decision log), `PROGRESS.md` (status board +
     handoff), and optionally `recon/*.md` (pre-implementation research notes read
     by every subagent, e.g. `api-patterns.md`, `web-ds-patterns.md`,
     `scheduler-pr-integrations.md`). The big cross-cutting arcs (`docs/ns2/`,
     `docs/hud2chat/`) use the same trio at the top level instead of under `docs/plans/`.

### Representative single-phase plan skeleton (`docs/plans/hud2chat-F0-immersive-shell.md`)

```md
# F0 — Immersive shell foundation

Part of the HUD → Chat UI migration. Read `docs/hud2chat/ROADMAP.md` and
`docs/hud2chat/DECISIONS.md` first. Read `.claude/skills/design-system/SKILL.md`
before touching `libs/design-system`.

**Goal:** <one behaviour-neutral or scoped goal, explicit about what does NOT change>

## Why this shape
<ties the plan back to a design mockup / prior decision, cites the exact file>

## Deliverable 1 — <thing> (design system)
<exact path, props table, structure, requirements: DS primitives only, no forwardRef,
no `any`, TestId enum + data-testid, i18n-agnostic DS vs i18n'd app>

## Deliverable 2 — <thing> (app wrapper)
...

## Deliverable 3 — <wiring change>
<critical invariants called out explicitly, e.g. "hook order must stay stable">

**Behaviour must not change in this phase:** <explicit regression test to add>

## Verification
- pnpm exec prettier --write / eslint --fix on every touched file
- pnpm check:lint
- tsc -p apps/web directly (rtk pnpm typecheck lies)
- Scoped vitest for new/changed test files only

## Out of scope
<explicit list> Do **not** commit — the orchestrator reviews and commits.
```

Every plan I sampled (F0–F10b, phase-119, phase-126a–g) follows this shape: Goal →
Deliverables with exact file paths and prop/behaviour specs → explicit invariants →
Verification block (always the same three-tier incremental command sequence, never
repo-wide) → Out of scope, and ends by telling the executing subagent **not to
commit** — commits are the orchestrator's job after review.

### Arc-level ROADMAP.md skeleton (`docs/plans/phase-125/ROADMAP.md`, `docs/ns2/PROGRESS.md`)

```md
# Phase N — implementation roadmap (execution order)
Master plan: <link>. Live status: PROGRESS.md. Decisions: DECISIONS.md.
Branch: `<branch-name>` — one big PR for the whole arc.

## Wave plan
| Wave | Sub-phases | Parallel? | Rationale |
(waves gated: a wave only starts once the previous wave is code-reviewed+committed)

## Per-sub-phase definition of done
1. Contract-first (libs/contracts before implementation)
2. Unit tests for every pure helper/service method
3. <Component>TestId enum + getByTestId tests for every new component
4. i18n key parity in cs.json AND en.json
5. Prettier + ESLint clean; scoped vitest green
6. One commit per sub-phase, never batched (`feat(scope): …`)

### Repo gates that bite this phase specifically
(tools/docs-sync manifest row, check:self-knowledge, check:cycles / madge, which
vitest "project" a new test actually lands in)

## Hard invariants (rejected at review if violated)
- <derived-not-persisted rules, no-auto-merge/push/dispatch, no `any`/forwardRef/
  inline style, explicit "never touch X">
```

**`DECISIONS.md`** convention: append-only, newest last, every entry = "Context /
Decision / Cost", numbered `D-001`, `D-002`… (or, at the arc-of-arcs level like
`docs/ns2/DECISIONS.md`, dated operator rulings numbered per date). Exists so "no
successor session re-litigates a settled question."

**`PROGRESS.md`** convention: "Read this first after a context loss" banner, links
to the other three docs, a **status board table** (sub-phase | scope | plan link |
state, using ✅/🟨/⬜/⛔ + commit hash), a running validation-gate table
(`pnpm test`, `check:types`, `check:cycles`, `check:lint` results), and (for the
long arcs) a **"Notes / gotchas for successors"** section plus a **"Planning
corrections (verified in code)"** section that documents where the audit/roadmap
turned out to be wrong once implementation actually looked.

### Branch naming observed
- Human/orchestrator-authored arcs: `feat/<slug>` (`feat/hud-to-chat-migration`,
  `feat/phase-126-todo-arc`, `feat/subsystem-handoff`), or a bare codename
  (`north-star-2`, `ns2-f9-subsystem-only-dispatch`).
- Claude-Code-session-generated branches: `claude/<phase>-<slug>-<random>` (e.g.
  `claude/phase-125-roadmap-impl-iao1qm`) — "one big PR for the whole arc."
- ZIBBY's own runtime (the app, not the dev session) generates
  `zibby/<agent-id>_<timestamp>-<slug>` branches for its autonomous runs (visible in
  `git branch -a`, e.g. `zibby/delivery_1781602436781-delivery`) — worktree-isolated,
  distinct from human-authored arc branches.

### Commit convention
Conventional-commits style throughout: `feat(scope): …`, `fix(scope): …`,
`docs(phase-NNN): …`, `chore(deps): …`, `refactor(web): …`, `test(e2e): …`. One
commit per sub-phase/deliverable, never batched. PROGRESS.md tables always cite the
commit hash next to the sub-phase.

## 3. Night-run / autonomous multi-phase execution machinery

### The per-phase loop (from `docs/hud2chat/HANDOFF.md`, mirrored by `docs/ns2/PROGRESS.md`'s header and `docs/plans/phase-125/ROADMAP.md`'s wave table)

```
1. Opus (orchestrator) writes docs/plans/<arc>-<phase>-<slug>.md
2. Dispatch a Sonnet general-purpose subagent with the plan as its brief.
   Subagents do NOT commit.
3. Opus reviews the diff vs. the plan + the relevant SKILL.md (design-system, etc.)
4. pnpm check:lint → tsc -p apps/web (direct, not via rtk pnpm typecheck) → scoped vitest
5. Orchestrator commits per phase, then updates ROADMAP.md + PROGRESS.md +
   HANDOFF/DECISIONS immediately (so a crashed session's successor can resume
   from disk without redoing finished work).
```

For arcs with independent sub-phases, the orchestrator dispatches **waves** of
parallel subagents (`docs/plans/phase-125/ROADMAP.md`, `phase-126`): a wave only
starts once the previous wave is code-reviewed and committed; sub-phases inside a
wave are chosen for **disjoint file ownership** so parallel subagents don't collide.
A final wave is always "full-repo validation" (`pnpm check:lint && check:types &&
test`, screenshots, PR) — the one point repo-wide checks are actually allowed.
`docs/ns2/PROGRESS.md`'s header states the method explicitly: *"Opus subagent
writes a detailed plan → orchestrator reviews → plan saved → Sonnet subagent(s)
implement → scoped tests green → checkpoint commit. Orchestrator never codes
directly."*

### Gates that fire regardless of who's driving

- **`.githooks/pre-commit`** (installed via `.clinerules`/git config, invoked as
  `rtk` when available): `lint-staged` on staged files → incremental `tsc --noEmit`
  (base + `apps/web/tsconfig.json`, cached `.tsbuildinfo`) only if a staged file is
  `.ts`/`.tsx` → `pnpm check:self-knowledge` (drift check against a committed vault
  fixture, see `docs/plans/phase-06.md` "Fáze 1") → `pnpm check:docs-sync`
  (`tools/docs-sync/manifest.mjs`; blocks a commit that adds a brand-new
  `apps/api/src/<module>` with no `docs/api/*.md` mapping) → a non-blocking graphify
  staleness nudge. **Tolerant by design**: skips entirely if `node_modules` isn't
  installed yet (never blocks a fresh clone).
- **`.githooks/pre-push`**: whole-project incremental typecheck (tsc has no
  diff-scoped mode) + `vitest run --changed <upstream-ref>` (only tests touching the
  branch's diff).
- **CI** (`.github/workflows/ci.yml` / `e2e.yml`) is the *only* place full-repo
  checks run: full lint, full `check:types`, `check:cycles` (madge, `apps/web`),
  full `pnpm test` (6 vitest projects), self-knowledge drift pinned to fixture,
  `web:build`, Playwright E2E.
- **Claude Code `Stop` hook** (`.claude/settings.json`, not a git hook): re-runs
  docs-sync coverage over the whole session's uncommitted diff at end-of-turn,
  blocking the turn from ending if a touched module's doc was never touched (up to
  3 attempts, then gives up rather than loop forever).
- **`self-knowledge`**: a generated vault note (`vault/knowledge/self-knowledge.md`)
  the pre-commit hook diffs against; regenerate via `pnpm self-knowledge:generate`.
  Gotcha recorded in `docs/ns2/PROGRESS.md`: it can flake once correlated with a
  stale graphify warning — retry before assuming real drift; and when regenerating
  under a fixture data dir, `GRAPH_REPORT_PATH` must be pinned to a nonexistent path
  or a local `graphify-out/GRAPH_REPORT.md` digest leaks into the fixture as phantom
  drift (CI has none).
- **`graphify`**: `graphify update .` (AST-only, no API cost) keeps
  `graphify-out/GRAPH_REPORT.md`/`graphify-out/graph.json` current; pre-commit only
  *nudges* (never blocks) if a touched `apps`/`libs` file is newer than the report.
  `.claude/CLAUDE.md`'s "graphify" section directs agents to `graphify query`/`path`/
  `explain` before raw grep for codebase questions.

### "A phase is marked done" =
1. Its Deliverables land with the verification tier (prettier+eslint on touched
   files, direct `tsc -p <project>`, scoped vitest) green.
2. One commit (or, for a wave, a batch of per-sub-phase commits) with a
   conventional-commit message.
3. `ROADMAP.md`/`PROGRESS.md`/`DECISIONS.md` (and `HANDOFF.md` where present) are
   updated in the same breath — the status board row flips to ✅ with the commit
   hash, so a crashed/replaced session can resume purely from disk.
4. The arc as a whole ends "PARKED at the PR gate" — **never** pushed/merged
   autonomously (Law 3 of `CLAUDE.md`: opening the PR is the one sanctioned
   autonomous push; merge is always the operator's). `docs/hud2chat/HANDOFF.md` and
   `docs/plans/phase-125/PROGRESS.md` both say this explicitly: "nothing pushed, no
   PR... the operator reviews and merges."

### `docs/ops/self-development.md` — a different, more meta layer

This is not the plan-execution loop above; it's the rulebook for when **ZIBBY's own
in-app loop/goal engine** (the autonomous system this codebase builds) is pointed at
its own repo as a "self-development" target. Golden rule: **builder ≠ subject** — the
running API instance driving the loop must never be the same checkout/worktree/data-dir
it's modifying (root-caused from the Phase-12 "MEMORY BOMB" incident). Not directly
part of the Claude-Code-session night-run machinery described above, but relevant if
the company-redesign plan intends ZIBBY's own goal engine (not a Claude Code session)
to execute any part of itself autonomously — the same builder/subject separation,
worktree-outside-repo, timeout/reap/budget/boot-gate defenses would apply.

## 4. `design/Z.I.B.B.Y/` — prior designs

Top level: 18 standalone HTML mockups + `redesign/`, `zibby/` (shared `.jsx` design
components the mockups `<script type="text/babel" src="zibby/…">` in), `before/`
(pre-redesign snapshot components), `scraps/` (loose PNGs), `screenshots/`,
`uploads/`, `debug/`. Files:

| File | What it is | Implemented? |
|---|---|---|
| `ZIBBY Velin-D.html` | "Velín-D · Orby subsystémů" — the **subsystem orb map**: 8(→11) glowing orbs = subsystems, the direct visual precedent for a company/department view. | Yes — Velín-D orb map, orb prominence/atmosphere, octagon layout, mitosis animation, webgl handoff particles shipped across `phase-93`…`phase-97`, `phase-101`, `phase-114/115`, `phase-124` (subsystem crew roster), `phase-126g` (orbiting agent-run dots). |
| `ZIBBY Redesign Canvas.html` | "Redesign · before / after" — a side-by-side before/after comparison scene (uses `redesign/hud-after.jsx`, `voice-after.jsx`, `tokens2.jsx`, `design-canvas.jsx`, `boards.jsx`, `changelog.jsx`). A **meta-tool for presenting a redesign**, not a shipped product screen. | Not a shipped app screen — it's a design-review artifact. Its `changelog.jsx` fed `ZIBBY Implementace - Changelog.html`. |
| `ZIBBY Design Audit.html` | Full design-token/spacing/component audit surface. | Fed `docs/plans/phase-42-design-audit-compliance-sweep.md`, `phase-21-audit-quick-wins.md` — largely delivered as the compliance sweep. |
| `ZIBBY Orb.html` | Standalone orb visual spec (the base orb component, pre-federation). | Delivered — chat orb / wireframe sphere / pulse-glow (`phase-15`, `phase-55/56`, `phase-115`), predates the multi-orb Velín-D map. |
| `ZIBBY Loading Screen.html` | Boot/loading splash spec. | Delivered as `BootSplash` (referenced throughout `docs/hud2chat/HANDOFF.md` as a known gotcha: it swallows early clicks on `/chat`). |
| `ZIBBY Roadmap.html` | The roadmap board mock (epics left rail + 3-column `To Do / In Progress / Done` board). | Delivered, but **deviated from the mock on purpose** — `docs/plans/phase-125/DECISIONS.md` D-001 overrides the mock's 3 columns with 4 (`BLOKOVANÉ | READY | IN PROGRESS | DONE`), reasoning documented. |
| `ZIBBY Companies.html` | **"Firmy" — company as a super-entity over projects**: catalog + detail, canonical team, default budget inherited into projects, project link/unlink. Explicit source comment: *"P0 #2 „Companies" — firma jako super-entita nad projekty... Net-new mockup, žádný předchůdce v designu."* | Delivered — `features/companies/{Screen,DetailScreen}.tsx`, `LinkProjectDialog.tsx` per `phase-68-company-entity-master.md`, `phase-72-projects-company-wiring.md`, `phase-75-company-add-member-project.md`. **This is the closest existing precedent to "company structure" in the UI**, though it models a client/customer company, not ZIBBY's own org chart. |
| `ZIBBY Handoff.html` | Inline mad-libs rule editor ("signál → cíl → tier") in the subsystem drawer. Source comment: *"P0 #6 „Handoff"... Net-new mockup."* | Delivered — `feat/subsystem-handoff` arc, `docs/plans/handoff-implementation-plan.md` / `handoff-rule-editor-plan.md`. |
| `ZIBBY Implementace - Changelog.html` | Rendered changelog view of the audit implementation. | Presentation artifact, not a live app screen. |
| `ZIBBY Agenti.html`, `Commands.html`, `Hooks.html`, `MCP servery.html`, `Pravidla schvalování.html`, `Signály.html`, `Velin.html`, `Velin-B.html` | Per-entity-type mocks (agents/commands/hooks/mcp/gate-rules/signals) + two earlier orb-map iterations (Velín, Velín-B) superseded by Velín-D. | Delivered as their respective `/agents`, `/commands`, `/hooks`, `/mcp`, `/gates` sections; Velín/Velín-B superseded. |

`design/Z.I.B.B.Y/zibby/` holds the **shared component library the mockups are built
from** (`companies.jsx`, `handoff.jsx`, `velin-d-*.jsx` for the orb map's dock/log/
search/chat/map pieces, `data.jsx`/`data-extra.jsx` fixture data, `zt.jsx` = "ZT.*"
design-vocabulary tokens — explicitly **not** runtime tokens per
`docs/hud2chat/HANDOFF.md`). A future company/departments redesign mock would almost
certainly be dropped here (`design/Z.I.B.B.Y/zibby/<new>.jsx` + a top-level
`ZIBBY <Name>.html` wrapper), following the `companies.jsx`/`handoff.jsx` precedent
of a short `<!-- P0 #N "<name>" ... Net-new mockup. Zdroj: <target tsx files> -->`
comment naming the eventual implementation target.

### How `design-match` consumes a design HTML (`.claude/skills/design-match/SKILL.md`)

- Mockups must live **inside the repo working directory** — `measure` refuses (exit
  3) to serve anything outside cwd, `$HOME`, or an ancestor of it, even via symlink;
  the fix it prints is "copy the mockup into the repo (`design/…`)". It no longer
  opens mockups over `file://` (Babel/XHR/`crossorigin` all break there); it spins up
  a throwaway `node:http` server on `127.0.0.1` with two mounts — `/` for the
  mockup's own directory (so sibling `zibby/*.jsx` resolve) and
  `/__design-match-cdn` for a shared CDN asset cache.
- `measure <design.html> "<description>"` inventories DOM regions in the rendered
  mockup, ranks candidates by how well the free-text description matches
  tag/class/text (falling back to area on ties — a known footgun on full-bleed
  mockups where nested full-viewport wrappers win by construction; `--region <n>`
  overrides), then writes `.design-match/<slug>/spec.json` + `design.png`.
- `compare --slug <slug> (--story <storybook-id> | --route <path> --selector <css>)`
  runs **one round** against the real implementation (a Storybook story or a live
  Next.js route) and diffs pixels. It is **not** a loop by itself — the driving agent
  reads the exit code + `report.md`, edits code, calls `compare` again.
- **Gate order is structural: structure (skeleton) before pixel values.** Two
  skeleton-gate failures anywhere in a run park it (exit 2) — that's read as
  evidence the *component choice* is wrong, not that values need tuning. Reusing an
  existing DS component is "a result, not a default" — it must pass the skeleton
  check on its existing props alone; an unmatched style value becomes a new
  semantically-named token, never a hex literal.
- Done = pixel diff < 0.5% **and** largest contiguous differing block ≤ 4×4px. Hard
  ceiling of 5 rounds (parks after the 5th). A thrash guard parks a run whose
  round-over-round improvement drops below 20% relative once it's already made some
  progress (never on a first round at 0%). Exit codes: 0 HOTOVO / 1 POKRAČUJ / 2 PARK
  / 3 CHYBA (refusal — bad invocation/environment, never "continue").
- `.design-match/<slug>/` on disk per matched scene (seen today: `chat-zprava`,
  `orb-canvas-leaf`, `orb-idle`, `radek-pravidla-predavani`, `roadmap-board-sloupce`,
  `stranka-firmy`, `vd-topbar`, `vd-dock`, `vd-tasks`, `vd-bottom`, etc.) —
  `stranka-firmy` ("company page") is the extant company-design parity record.

## 5. `docs/ns2/` and `docs/hud2chat/` — order and lessons

**Order they ran in (both are the two biggest prior restructures):**
- `docs/hud2chat/` (HUD → Chat UI migration): F0 (immersive shell) → F1 (settings) →
  F2 (archive) → F3/F4 (catalogs A/B) → F5 (orchestration) → F6/F6b (delivery
  entities + hero dedup) → F7 (memory/gates) → F8a–F8e (briefing message, status
  line, dissolve overview module, delete overview runs, briefing trigger) → F9
  (reachability sweep) → F10/F10b (delete old shell, landmarks). Reusable "migration
  recipe" = the 9 numbered steps in `docs/plans/hud2chat-F3-catalogs-a.md`, reused
  (not restated) by every later phase in the arc.
- `docs/ns2/` (Federation / Roadmap II): F0 (land the fleet — merge debt +
  PR-tier-unify + dead-weight) → F1 (ownership is data) → F2 (two-stage dispatch) →
  F3 (policy/accountability) → F4 (memory shelves) → F5 (empty chairs: Sentinel/
  Maestro/Loom v1) → F6 (Herald trust-from-record) → F7 (monitors/merge-queue) → F8
  (Hearth/personal domain) → F9 (subsystem-only dispatch, fleet prune 61→38).

**Named lessons/gotchas (grep'd for "lesson"/"gotcha"/"LESSON"):**
- **Verify with exit codes, not output text** (`docs/hud2chat/HANDOFF.md`, decision
  D20): a subagent's `tsc` run genuinely failed (TS6059) but `rtk`'s filter printed
  "TypeScript: No errors found" while the exit code stayed non-zero; the orchestrator
  trusted the *sentence* and wrote up a false all-clear. Rule going forward: `npx tsc
  -p <proj> --noEmit; echo $?` and trust the number.
- **Check a bundled subagent report's claims separately** (D21): a subagent claiming
  two regressions in one breath had one real, one false — "a bundle is not a unit of
  truth."
- **Measure before calling something a layout bug**: F5 nearly "fixed" a
  deliberately pannable canvas; compare `clientWidth` vs `scrollWidth` first.
- **`grep -v X file > file` silently truncates under `rtk`'s transparent rewrite** —
  corrupted a chat transcript in F8a; write to a temp file and `mv` it instead.
- **Chat transcripts are append-only JSONL, gitignored** — any `ChatMessageSchema`
  change must keep old on-disk lines parsing; verify against real files, not
  reasoning.
- **`rtk git commit` can print "ok (nothing to commit)" while it actually
  succeeded** — always re-verify with `rtk git log --oneline`.
- **jsdom cannot see certain full-bleed CSS defects** (`GlassSurface radius="none"`
  vs `"panel"`) — only a real-browser check catches that class of bug.
- **`BootSplash` swallows early clicks on `/chat`** — live-browser verification must
  wait for it to clear and click by element ref, not pixel coordinates.
- **NS2-specific** (`docs/ns2/PROGRESS.md` "Notes / gotchas for successors"):
  - Any test/tool creating an agent or integration must pass `ownerSubsystem` after
    F1b (422 otherwise) — the whole e2e suite needed a wholesale fix for this.
  - `apps/api/data-test/vault/knowledge/self-knowledge.md` is in `.prettierignore`
    on purpose (lint-staged silently re-prettifying it broke the e2e test) — do not
    remove the ignore.
  - `apps/api/data-test` pipeline ids ≠ real `.zibby/data/pipelines` ids — running a
    CLI generator against the shared fixture with `ZIBBY_DATA_DIR` pointed at it
    mutates tracked files; always copy to a temp dir first, then `git status
    --short apps/api/data-test` to confirm nothing leaked.
  - The orb map's `ellipseLayout` is count-generic (handles 10 orbs with zero new
    layout code) — only the `SUBSYSTEM_GLYPH` Record tables need new keys per new
    subsystem. **Directly relevant**: adding department/company-structure entities
    as new subsystems is cheap on the visualization side.
  - "Planning corrections" section: several roadmap/audit claims were simply wrong
    once code was actually read (e.g. PR-tier unification was already shipped;
    `features/goals` hooks were live, not dead) — the roadmap doc is a hypothesis to
    verify against code, not ground truth.

## 6. Validation policy — exact commands

Source of truth: `docs/ops/validation-policy.md` (see also `CLAUDE.md` "After
editing a file", which is the enforced short version).

| Tier | Trigger | Scope | Commands |
|---|---|---|---|
| On-edit | file saved / agent finishes an edit | that file + its test | `pnpm exec prettier --write <file>`; `pnpm exec eslint --fix <file>`; `pnpm exec vitest run <path/to/Foo.test.tsx> --project web` (or `design-system`/`api`/`contracts`/`web-components`/`forms`) if an obvious test exists. Never `tsc` here — rely on the editor's TS language service. |
| Pre-commit | `git commit` | staged files (+ whole-project incremental typecheck if any `.ts`/`.tsx` staged) | `lint-staged`; `tsc -p tsconfig.base.json --noEmit --incremental --tsBuildInfoFile .cache/tsc-base.tsbuildinfo && tsc -p apps/web/tsconfig.json --noEmit --incremental --tsBuildInfoFile .cache/tsc-web.tsbuildinfo`; `pnpm check:self-knowledge`; `pnpm check:docs-sync`; non-blocking graphify staleness nudge |
| Pre-push | `git push` | whole-project typecheck (tsc has no diff mode) + diff-scoped tests | same incremental tsc invocation; `pnpm exec vitest run --changed <upstream-ref>` |
| CI | push/PR to `main` | entire repo | `pnpm exec eslint .`; `pnpm run check:types`; `pnpm run check:cycles` (madge, `apps/web`); `pnpm run test` (all 6 vitest projects); self-knowledge drift vs. committed fixture; `pnpm run web:build`; Playwright E2E (PR + `workflow_dispatch` on ubuntu, plus self-hosted macOS on push to main) |

**Never run repo-wide (`check:lint`, `check:types`, `test`, `web:build`,
`check:cycles`, `e2e`) as a side effect of a single file edit** — only at true
phase/arc completion or hand-off.

**rtk gotchas** (repeated across multiple memory notes and `validation-policy.md`
itself):
- `rtk pnpm typecheck` **lies** — the base config doesn't cover `apps/web`; always
  call `tsc -p apps/web` (or the relevant tsconfig) directly.
- `rtk`'s dedicated `tsc` filter only engages when `tsc` is the *literal* command it
  sees — routed through a `pnpm` wrapper it's unfiltered passthrough, so both hooks
  invoke `rtk tsc <flags>` directly, not `pnpm exec tsc`.
- `rtk` prints friendly success text even when the underlying exit code is non-zero
  (the D20 "TypeScript: No errors found" false-positive above) — **trust `$?`, not
  the sentence**, always.
- `git diff`/`git rev-parse` calls that a hook parses for control flow are
  deliberately **not** routed through `rtk` (its compacted output isn't guaranteed
  machine-parseable).
- `rtk git commit` can report "nothing to commit" on a commit that actually
  succeeded.
- `grep` piped into a redirect over its own input file (`grep -v X f > f`) breaks
  silently under rtk's rewrite.
- `rtk npx next typegen` silently generates nothing — use `rtk proxy npx next
  typegen`.

**Known flaky / pre-existing failures — do not chase:**
- `apps/api` `pipelines.e2e` — 2 pre-existing failures (env leak / demo timeout),
  noted in both `docs/ns2/PROGRESS.md` and separate memory notes.
- `apps/api/src/runner/runner-core.test.ts` — pre-existing flake, unrelated to
  hud2chat work.
- `check:self-knowledge` may fail once with a drift report correlated with a stale
  graphify warning — retry `pnpm self-knowledge:generate` once before treating it as
  real drift.
- Approvals e2e: 2 under-load socket-flaky tests observed once, did not reproduce on
  a clean run (per root `PROGRESS.md`).

## 7. Recommendations for a night-run-ready company/departments redesign plan

Given everything above, a plan that must run unattended and multi-phase should:

1. **Recognize the redesign already has a real substrate: subsystems.** ROADMAP-2 /
   `docs/ns2/` already turned "department" into a first-class, owned, accountable
   entity (`ownerSubsystem` on every agent/pipeline, 422 on write without it, a
   stored roster per subsystem, per-subsystem gate-rule sets, per-subsystem memory
   shelves, a complexity ladder of agents/pipelines per subsystem). A "company"
   redesign is very likely **a re-skin/extension of the subsystem federation**, not
   a green-field concept — the plan should explicitly state which parts of F1–F9 it
   reuses vs. supersedes, the way ROADMAP-2 itself opened with "Already Delivered —
   Do Not Rebuild" and NS2's DECISIONS log opened with "Standing (inherited, still
   binding)".
2. **Structure as an arc folder, not a flat plan.** Create
   `docs/plans/<arc-slug>/{ROADMAP.md,DECISIONS.md,PROGRESS.md,recon/}` (or
   `docs/<arc-slug>/` for a cross-cutting restructure at ROADMAP-2's scale) up front.
   `PROGRESS.md` is what lets an unattended run survive a context loss/session
   crash and resume purely from disk — this is not optional for a genuinely
   unattended multi-phase run.
3. **Do recon before planning, and commit the recon.** `docs/plans/phase-125/recon/`
   shows the pattern: dedicated pattern-reference docs (existing API patterns, DS
   patterns, scheduler/PR integration points) written *before* the phase plans, then
   cited by every subsequent sub-phase plan instead of re-derived.
4. **Wave the sub-phases by file disjointness, gate each wave on review+commit.**
   Never let two subagents touch overlapping files in the same wave; the last wave
   is always full-repo validation + PR, never earlier.
5. **Every sub-phase plan needs, verbatim:** exact file paths for each deliverable,
   explicit "must not change" invariants, a verification block using only the
   incremental tier commands (never repo-wide), an explicit out-of-scope list, and
   an instruction that the subagent does not commit — the orchestrator reviews then
   commits.
6. **Define "hard invariants (rejected at review if violated)" once per arc** —
   derived-vs-persisted state rules, no-auto-merge/push/dispatch, no `any`/
   `forwardRef`/inline style, and anything structurally load-bearing for the
   company-org concept (e.g., "every agent/pipeline/employee belongs to exactly one
   department, no orphans" mirrors NS2's Federation Law almost exactly and should
   probably just be reused).
7. **Wire the repo gates in from sub-phase 1, not as an afterthought**: any new
   `apps/api/src/<module>` needs its `tools/docs-sync/manifest.mjs` row + doc file
   in the *same* commit (pre-commit blocks otherwise); any new entity/taxonomy value
   affecting counts feeding `self-knowledge.md` needs the fixture-regen recipe (temp
   copy + pinned `GRAPH_REPORT_PATH`) accounted for in the plan; `graphify update .`
   should run at arc completion, before the final PR.
8. **If a design mockup exists or will be produced**, drop it as
   `design/Z.I.B.B.Y/zibby/<name>.jsx` + a top-level `ZIBBY <Name>.html` wrapper with
   the `<!-- P0 #N "<Name>" ... Net-new mockup. Zdroj: <target tsx files> -->` header
   comment (exact precedent: `companies.jsx`/`ZIBBY Companies.html`,
   `handoff.jsx`/`ZIBBY Handoff.html`), then run `design-match measure`/`compare`
   per scene — structure-gate before pixel-gate, 5-round ceiling, park (don't force)
   on thrash or repeated skeleton failure. Deviations from the mock must be logged
   as a `DECISIONS.md` entry with reasoning (see D-001's 4-vs-3-column precedent),
   never silently substituted.
9. **State explicitly whether this is a Claude-Code-session-driven arc (the pattern
   in §3) or intended to run through ZIBBY's own in-app goal/loop engine** — if the
   latter, `docs/ops/self-development.md`'s builder≠subject rule and worktree/
   timeout/budget/boot-gate defenses are a hard prerequisite, not optional context.
10. **End state is always "parked at the PR gate."** No plan in this repo's history
    ends with an autonomous merge — the plan's own definition of done should say so
    explicitly, matching Law 3.
