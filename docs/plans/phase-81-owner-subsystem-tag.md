# Phase 81 — `ownerSubsystem` tag on pipelines & chains

> Design doc: "Existing entities that need to be attributed to a subsystem (pipelines, chains,
> gate rules) gain an `ownerSubsystem` tag field." This phase does pipelines + chains only
> (gate rules come with the Gates tab, phase 87). Pure data-layer attribution — no UI change.

## 1 — Contract

- `libs/contracts/src/pipelines/pipeline.schema.ts`: add
  `ownerSubsystem: SubsystemIdSchema.optional()` to `PipelineObject` (so it flows into
  `PipelineSchema` / `CreatePipelineSchema` / `UpdatePipelineSchema` automatically — verify the
  `.omit({ id: true })` update derivation keeps it).
- `libs/contracts/src/chains/` chain schema: same optional field on the chain object schema
  (find the analogous plain-object schema; mirror the pipelines approach).
- Import `SubsystemIdSchema` from the phase-80 `subsystems` barrel — no duplicated enum.

## 2 — API — storage passthrough

Pipelines are stored as `.zibby/data/pipelines/*.pipeline.md` YAML frontmatter. Find the
frontmatter parser/serializer (the storage service under `apps/api/src/pipelines/`) and make
`ownerSubsystem` round-trip: parse if present, serialize when set, absent stays absent (no
noisy rewrite of untagged files). Same for chains storage (wherever chains persist —
locate `apps/api/src/chains/` storage and mirror).

Validation: an unknown `ownerSubsystem` value must fail schema validation on create/update
(comes free from the zod enum — add a test proving it).

## 3 — Seed the two live attributions

Per the design doc's federation table, tag the two subsystems that exist "today":

- `.zibby/data/pipelines/delivery.pipeline.md` → `ownerSubsystem: forge`
- `.zibby/data/pipelines/code-audit.pipeline.md` → `ownerSubsystem: loom`

Leave every other pipeline untagged — unowned is a legitimate state (the design allows
mandate-only subsystems and subsystem-less pipelines; do not force-assign the rest).

## Tests

- Schema: create/update accepts a valid `ownerSubsystem`, rejects an unknown one, and omitting
  it stays valid (existing fixtures must not need edits — that's the backward-compat proof).
- Storage: frontmatter round-trip preserves the field; a file without it parses to `undefined`
  and is not rewritten with a phantom field.
- Contract round-trip tests updated where they enumerate pipeline fields.

## Verification (paste real output)

- `npx tsc -p` contracts, api, web — clean (web compiles untouched but consumes the type).
- `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/pipelines apps/api/src/chains` — green.

## Constraints

- Additive only: no existing pipeline/chain file becomes invalid; the classifier, runners and
  web are untouched this phase.
- Do not build any "assign owner" UI yet — Roster (phase 85) surfaces ownership.
