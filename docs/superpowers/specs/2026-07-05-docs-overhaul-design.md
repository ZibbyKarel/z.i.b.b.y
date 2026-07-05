# Docs overhaul: English, refreshed, and gap-filled

**Date:** 2026-07-05
**Status:** approved, moving to implementation plan

## Problem

`docs/` mixes two eras: an older Czech-language reference layer (README, architecture,
run-states, approval-gates, most of `api/`, all of `web/` and `libs/`, most of `ops/`)
written early in the project, and a newer English layer added since (`api/gaps.md`,
`api/research.md`, `docs/plans/`, `docs/research/`, `docs/superpowers/`). The Czech
layer is also stale against current code, and the README index doesn't link every doc
that exists. Separately, ~15 backend modules under `apps/api/src/` have no doc at all —
most notably `goals`, the entire loop-engine/self-dev subsystem from phases 10–14.

## Scope

### In scope — translate + refresh (living reference docs)

All Czech-language docs, rewritten in English and brought current against the code
they describe:

- `docs/README.md`, `docs/architecture.md`, `docs/run-states.md`
- `docs/aproval-gates.md` — renamed to `docs/approval-gates.md` (typo fix); update the
  link in README
- `docs/api/{overview,agents-runs,pipelines,gates,tasks,memory,channels,activity,
  approvals,automations,extensibility,chains,chat,machine,monitors}.md`
- `docs/web/{overview,state}.md`
- `docs/libs/{contracts,design-system}.md`
- `docs/ops/{deployment,environment,self-development}.md`

Two already-English files get a content review + a README link instead of a
translation pass: `docs/api/gaps.md`, `docs/api/research.md`.

**Ops consolidation:** `docs/ops.md` (top-level) is a newer, more complete English
runbook that overlaps `docs/ops/deployment.md` and `docs/ops/environment.md` (older,
thinner, Czech). Merge `ops.md`'s content into `ops/deployment.md` (launchd, backups,
log rotation, CI) and `ops/environment.md` (env var table), keeping
`ops/environment.md`'s more detailed `system-config.json` section, then delete the
top-level `docs/ops.md`. `docs/ops/self-development.md` is a distinct topic (kept,
just translated) — its link to `../plans/phase-12.md` is dead (that file doesn't
exist under `docs/plans/`, which only has `phase-01..05.md` for an unrelated plan);
drop or fix that reference rather than inventing a target.

### Out of scope

`docs/plans/phase-01..05.md`, `docs/research/`, `docs/superpowers/specs/`,
`docs/superpowers/plans/` — already English, historical/dated artifacts (design docs
and phase logs), not living reference docs. Left untouched.

### In scope — new docs for undocumented modules

Diffing `docs/api/*.md` against `apps/api/src/*` turned up modules with no doc file.
Each gets a full page in the existing `api/*.md` style (a "Pieces" table of
file → role, a "Flow" walkthrough, an "Endpoints" section where applicable) —
scaled to what a reader needs to understand the module without reading its source,
same bar as `api/gaps.md` / `api/research.md`.

**Tier 1** (write first — architecturally central):
`api/goals.md`, `api/budget.md`, `api/briefing.md`, `api/mandate.md`,
`api/integrations.md`, `api/system.md`

**Tier 2** (write after Tier 1):
`api/workspace.md`, `api/artifacts.md`, `api/limits.md` (covers both `limits/` and
`limits-resume/`), `api/discovery.md`, `api/ideas.md`, `api/patterns.md`,
`api/pins.md`, `api/events.md`, `api/health.md`

### README rewrite

Full English index, restructured to link every doc that exists: the 6 currently
orphaned files (`chains`, `chat`, `gaps`, `machine`, `monitors`, `research`) plus all
15 new Tier 1/2 files, plus the renamed `approval-gates.md` and consolidated `ops/`
docs. Same "Klíčové principy" table, translated, cross-checked against the current
North Star laws in the root `CLAUDE.md` (the table must not drift from the canonical
laws there).

## Non-goals

- No hook to build — `.claude/settings.json` already has a `PostToolUse` hook on
  `Edit|Write` that injects a "DOCS-HINT" reminder whenever a non-test file under
  `apps/` or `libs/` changes. That already is the lightweight staleness tracker this
  project would otherwise add. No changes to it as part of this work.
- No changes to `docs/plans/`, `docs/research/`, `docs/superpowers/` content.
- No code changes — this is a docs-only pass.

## Approach

Parallel agent fleet, not one sequential pass: each doc file is an independent unit
of work (own source material, own output file, no shared state with siblings), so
this is the dispatching-parallel-agents pattern, not a single long agent session.

Per file, an agent gets: the existing Czech doc (if any), pointers to the source
directories it describes, and a same-tier English doc as a style reference (e.g. new
`api/*.md` pages match `api/gaps.md`'s structure). It produces the final English
markdown in place.

Batching (detailed in the implementation plan): group by directory/tier so agents in
a batch share context cheaply (e.g. all `api/` translations together, all Tier 1 new
docs together), review a sample from each batch before moving to the next, and do the
README + cross-link pass myself at the end, after every individual file is settled —
that pass needs the full picture, not an independent slice.

## Verification

No lint/typecheck/test — nothing here is executable code. Instead:

1. **Link check** — every markdown link in `docs/` resolves to a file that exists
   (catches both the renamed `approval-gates.md` and the ops.md merge/delete).
2. **Terminology pass** — a read-through for consistent English terminology across
   files that were translated independently (e.g. "run" vs "task run", "gate" vs
   "approval gate") — since parallel agents don't see each other's output.
3. **Full README read-through** for coherence as a single entry point.

## Open risk

Translating ~13 large files (some 200+ lines) plus writing 15 new pages in parallel
is a lot of independent agent output to spot-check. The plan should budget explicit
review checkpoints (per batch, not just at the very end) so a systemic issue (wrong
terminology, wrong doc-page template) gets caught early rather than after all 43
files are written.
