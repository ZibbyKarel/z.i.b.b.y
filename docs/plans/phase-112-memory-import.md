# Paměť — hromadný import z jiného zdroje (folder → halda → destilace) — phase 112

> Design conversation (operator + Claude, 2026-07-10): the operator wants to seed memory
> from an external corpus (another Obsidian vault, a notes folder, an export) in bulk. The
> mechanism to *process* such a dump already exists end to end — the `raw:true` "halda" flag
> + the nightly `MemoryDistillerService` triage sweep landed in phases 105–109 (see
> `docs/plans/phase-105-memory-triage-and-entity-recall-master.md`). What is missing is only
> an **inbound door**: a way to get a pile of external files into the halda so the existing
> distiller can triage them. This phase adds exactly that door and nothing more — it reuses
> the triage machinery verbatim. Decisions below are BINDING (from the conversation) — do not
> reopen without a new operator decision.

## Binding decisions (from the design conversation — do not reopen)

1. **Import is a server-side folder path, not a browser upload.** ZIBBY is self-hosted,
   single-operator; the source lives on the same machine. The operator supplies an absolute
   folder path; the API reads it directly. No multipart, no `webkitdirectory` upload — that
   whole class of size/transport problems is avoided by construction. (Operator: _"z jiné
   složky na témže počítači"_.)
2. **A dedicated staging folder OUTSIDE the vault is the queue.** Imported files are *copied*
   (not moved — the operator's source folder is left untouched) into `dataDir("import")` =
   `<repo>/.zibby/data/import/`, a **sibling** of the vault dir, never a subdir of it. This is
   load-bearing: `VaultService.scan()` walks the vault dir only, so staged files do NOT appear
   as notes in the graph until distillation actually ingests them. The staging folder is the
   inspection queue and the natural reversibility surface (the operator can eyeball / clear it
   before it is processed). (Operator: _"soubory se prostě jen zkopírují do oddělené složky pro
   import"_.)
3. **Everything is treated as halda.** Every accepted file becomes a note with `raw:true`;
   the EXISTING `triageRawNotes()`/`triageOne()` sweep sorts it (durable → condense+type+tags+
   links, clear `raw`; noise → `triaged-noise`; **never delete**). No import-specific triage
   logic, no structure/wikilink preservation from the source — the source's own organisation is
   deliberately discarded in favour of re-derivation. (Operator: _"halda k roztřídění"_.)
4. **Accepted types = the ones memory already supports: `.md` and `.txt`.** The vault stores
   `.md`; a `.txt` is wrapped in frontmatter (title from the filename). A `.md` keeps its own
   title if present, else the filename; `raw:true` is forced regardless (it is halda). Any other
   extension is skipped and *reported in the result count* — never silently dropped.
   (Operator: _"typy které teď podporujeme … textové soubory a markdown"_.)
5. **No batch cap on distillation. Operator chooses timing at import.** The import dialog offers
   **"destilovat hned"**: if checked, distillation is fired immediately (in the background); if
   not, the whole queue is processed in bulk by the nightly `memory-distill` cron. There is
   deliberately NO per-run cap — the operator owns the token cost of a large import (single
   operator, self-hosted; consistent with the budget being the operator's, not the system's, to
   police here). Mitigation, not a cap: the "now" path runs detached so the HTTP request never
   blocks, and the staging queue always shows what is still pending. (Operator: _"strop bych
   nedával … dal operátorovi na výběr zda chce rovnou spustit destilaci, jinak bulkově v noci"_.)
6. **Ingested source files are archived, not deleted.** After a staged file is turned into a
   raw note, it is moved from the queue to `import/_imported/<YYYY-MM-DD>/`. This is the
   idempotency guard (an archived file is never re-ingested) and honours "files are the source
   of truth — never a silent destructive delete". (Operator: _"3 je v pohodě"_ = archiv zdrojů.)

## Verified RECON (2026-07-10) — anchors + wiring

**Distiller wiring** (`apps/api/src/memory/memory-distiller.service.ts`):
- `MemoryDistillerService.distill()` (`:93`) already orchestrates the nightly pass: `gather()`
  (`:141`) → `fileDigest()` (`:294`) → `triageRawNotes()` (`:365`) → `triageOne()` (`:388`) →
  `markDistilled()` (`:465`). `triageRawNotes()` consumes `VaultService.rawNotes()` (`vault.service.ts:235`)
  = every note with `raw === true`. **So: create raw notes before the triage step of a `distill()`
  run and they are triaged in the SAME pass — no triage code changes.**
- The distiller is `VITEST`-guarded (skips the real `claude -p` under test) — mirror that guard in
  the ingest step's tests.

**Automation / "distill now" trigger** (`apps/api/src/automations/scheduler.service.ts`):
- `dispatch()` (`:130`) `case "memory-distill"` (`:155-159`) is literally `return this.distiller.distill()`.
  `trigger(id)` (`:117`) = `dispatch()` + `markFired()`. The nightly automation is
  `apps/api/data/automations/memory-distill.json` (cron `0 3 * * *`, `system:true`).
- ⚠ For the "now" path, calling `this.distiller.distill()` **directly** (detached, fail-open) from
  the import flow is simpler than `scheduler.trigger("memory-distill")` and avoids stamping the
  cron automation's `lastFiredAt`. Prefer the direct call; keep it inside a `trace.run(...)` scope
  like the cron path (`:107-109`) so the background run is traceable.

**Vault store** (`apps/api/src/memory/vault.service.ts`):
- `createNote()` (`:333`): when `tier` is omitted it defaults `tier=knowledge` **and forces
  `raw:true`** (phase-107). Ingest can therefore call it with `tier` omitted and get halda
  semantics for free; do NOT hand-roll frontmatter. `NoteIdSchema` enforces a filesystem-safe
  basename + containment guard — ingest must slug the filename to a safe id and resolve
  collisions (numeric suffix), and may pass the existing `dedupe` write-option to fold near-dupes.
- `scan()` (`:432`, private, 5 s cache) walks the vault dir skipping dotdirs. Confirms the import
  staging folder must live OUTSIDE the vault dir (decision 2) — `dataDir("import")` is a sibling of
  `dataDir("vault")` and is never scanned.
- `resolveVaultDir()` in `memory.module.ts` = `VAULT_DIR` env or `dataDir("vault")`; `dataDir()`
  (`shared/.../data-dir.ts`) anchors `.zibby/data` to repo root. Reuse the same `dataDir("import")`.

**Contracts** (`libs/contracts/src/memory`):
- `memory.contract.ts` — ts-rest router, prefix `/api`, existing routes incl. `createNote`
  `POST /memory/notes`. Adding one more route is additive; **the `index.ts` barrel is a wildcard
  re-export, so a new route on an existing contract needs no barrel change** (per phase-105 RECON).
  A brand-new exported schema symbol (`ImportRequestSchema`/`ImportResultSchema`) is picked up by
  the same wildcard.
- `memory.schema.ts` — home for the two new schemas. Round-trip test pattern to mirror:
  `memory.contract.test.ts:107-166`.

**Web** (`apps/web/features/memory`):
- `Screen.tsx` (`:73-99`) `PageHeader` already carries two create actions ("Quick capture" ghost,
  "New note" primary). The **"Import"** action is a third `PageHeader` button. Dialog pattern to
  mirror: `NoteEditorDialog.tsx` (DS `Dialog`, testid enum, RHF-free simple form is fine here).
- Import is a plain JSON `POST` (`{ sourcePath, distillNow }`) — it goes through **ts-rest
  normally** (unlike task-attachment upload, which needed raw multipart). New mutation
  `useImportMutation` under `features/memory/mutations/`, invalidating `["memory"]` (so a "now"
  run's results show up after refetch).

---

## Phase 112a — Contracts (foundation, contract-first) — ✅ DONE

> Landed: `ImportRequestSchema`/`ImportResultSchema` (+ inferred `ImportRequestInput`/`ImportResult`)
> in `memory.schema.ts`; `import` route `POST /memory/import` on `memoryContract` reusing the shared
> `ErrorSchema` for 400/422; round-trip tests (request defaults `distillNow:false`, rejects empty
> `sourcePath`; result `skippedByReason` optional/back-compat) + contract-surface assertion. Barrel
> is a pure wildcard — untouched. `libs/contracts` tsc + web tsc clean; contracts vitest 328 passed.
> ⚠ EXPECTED contract-first ripple: repo-wide `tsc` is red on `memory.controller.ts` (its
> `tsRestHandler` must now implement `import`) until 112b lands — not a regression.

- [x] `memory.schema.ts`: `ImportRequestSchema` = `{ sourcePath: z.string().min(1), distillNow:
  z.boolean().optional().default(false) }`. `ImportResultSchema` = `{ staged: z.number().int(),
  skipped: z.number().int(), skippedByReason: z.record(z.string(), z.number()).optional(),
  distillTriggered: z.boolean() }`. Docblock: import copies external `.md`/`.txt` into the halda
  queue; other types counted under `skipped`.
- [x] `memory.contract.ts`: add `import: { method: "POST", path: "/memory/import", body:
  ImportRequestSchema, responses: { 200: ImportResultSchema, 400: ErrorSchema, 422: ErrorSchema } }`.
- [x] Round-trip test in `memory.contract.test.ts` (mirror `:107-166`): request/result parse,
  `distillNow` default `false`, `skippedByReason` optional/back-compat.
- [x] Barrel unchanged (wildcard) — verified, not edited.

## Phase 112b — API: import staging + ingest front-phase + "distill now"

- [ ] **`MemoryImportService`** (new, `apps/api/src/memory/memory-import.service.ts`):
  - `stageFrom(sourcePath): Promise<ImportResult>` — validate the path (exists, is a directory,
    readable → else 422/400); walk it recursively skipping dotdirs and NOT following symlinks out
    of the tree; collect `.md`/`.txt`; **copy** each into `dataDir("import")` with a
    collision-safe filename; sanity-cap per-file size (skip oversized, count under
    `skippedByReason`); tally `staged` / `skipped` / `skippedByReason` (by extension + reason).
    Never throws on a single bad file — fail-open per file, aggregate into the result.
  - `ingestQueue(): Promise<number>` — for each file in the queue (not the `_imported/` archive):
    read it, derive a safe note id (slug of the basename, numeric-suffix on collision), call
    `VaultService.createNote` with **`tier` omitted** (→ `knowledge` + forced `raw:true`) and the
    file's text as body (`.md` keeps its own frontmatter title if present, `.txt` gets the
    filename as title); on success **move** the source file to `import/_imported/<day>/`. Fail-open
    per file (a bad file stays in the queue, logged, not fatal). Returns the count ingested.
- [ ] **Distiller front-phase**: `MemoryDistillerService.distill()` calls
  `this.import.ingestQueue()` at the very start (before `gather()`), so freshly-ingested raw notes
  are present when `triageRawNotes()` runs later in the same pass. Guard fail-open (an ingest error
  must never abort the nightly tick). Inject `MemoryImportService` into the distiller module.
- [ ] **Import controller** (implement the `import` contract route): call
  `MemoryImportService.stageFrom(body.sourcePath)`; if `body.distillNow`, fire
  `this.distiller.distill()` **detached** inside a `trace.run({ traceId })` scope (do NOT await —
  the HTTP response returns immediately with `distillTriggered:true`); fail-open if the detached
  run rejects (log only). Map path errors → 400/422 like the other memory controller mappings.
- [ ] **Staging dirs + gitignore**: ensure `dataDir("import")` and `import/_imported/` are created
  on demand; add both to `.gitignore` (mirror how `daily/` is ignored) — imported/archived content
  is runtime data, never committed.
- [ ] Tests (`memory-import.service.test.ts` + distiller/controller):
  - `stageFrom`: mixed folder → only `.md`/`.txt` staged, others counted in `skippedByReason`;
    non-existent / non-directory path → typed error; source folder left untouched (copy, not move).
  - `ingestQueue`: staged file → raw note created (tier `knowledge`, `raw:true`), source moved to
    `_imported/<day>/`, re-run does NOT re-ingest (archive idempotency); id collision → suffixed.
  - distiller: ingest runs before triage in one `distill()` pass (a staged file ends the pass as a
    triaged note, not raw) — under the `VITEST` distiller guard.
  - controller: `distillNow:false` → staged only, `distillTriggered:false`; `distillNow:true` →
    returns immediately, `distillTriggered:true` (assert the detached call was invoked, not awaited).

## Phase 112c — Web: Import button + dialog + mutation

- [ ] `features/memory/Screen.tsx`: add a third `PageHeader` action **"Import"** (ghost/secondary,
  `download`/`folder` icon) opening a new `ImportDialog`. testid `memory-import-open`.
- [ ] `features/memory/components/ImportDialog.tsx`: DS `Dialog` with a text field for the folder
  path + a DS `Switch`/`Checkbox` "Destilovat hned" (default off) + submit. On success, close and
  toast: _"Zařazeno N souborů (M přeskočeno). {Roztřídí se hned na pozadí | Roztřídí se při noční
  destilaci}."_ `<ImportDialogTestId>` enum, `data-testid` on the field / toggle / submit.
- [ ] `features/memory/mutations/useImportMutation.ts`: ts-rest mutation on `POST /memory/import`;
  `onSuccess` invalidates `["memory"]` (re-exported from `mutations/index.ts`).
- [ ] i18n: add the CS (default) + EN strings for the button, dialog labels, and the two toast
  variants to `apps/web/i18n/messages/{cs,en}.json`.
- [ ] Component test (`ImportDialog.test.tsx`, mirror `NoteEditorDialog.test.tsx`): renders field +
  toggle; submit calls the mutation with `{ sourcePath, distillNow }`; success toast copy switches
  on the toggle.

## Tests (cross-cutting)

- `libs/contracts`: round-trip for `ImportRequestSchema`/`ImportResultSchema` (112a).
- `apps/api`: `MemoryImportService` stage/ingest/idempotency + distiller ingest-before-triage +
  controller now/later branches (112b).
- `apps/web`: `ImportDialog` render/submit/toast + Screen wiring (112c).

## Verification (paste real output, per phase)

- `npx tsc -p tsconfig.base.json --noEmit` (contracts/api) + `npx tsc -p apps/web/tsconfig.json
  --noEmit` (web) — clean (watch for the known pre-existing `machine.service.ts` error; confirm any
  api error is that one, not new).
- `pnpm check:lint` (eslint --fix) — clean.
- `pnpm test` for the touched dirs — green.
- Manual smoke: point `sourcePath` at a small mixed folder, import with "destilovat hned" off →
  files land in `.zibby/data/import/`, none in the graph yet; toggle on → after the detached run,
  raw notes appear then get triaged, sources sit in `import/_imported/<day>/`.

## Global constraints (every phase)

- Contract-first: `libs/contracts` lands before api/web consume it.
- React 19 (no `forwardRef`), no `any`, no raw inline DOM `style` in `apps/web` (compose DS props).
- **Fail-open everywhere** — a bad source file, a single ingest failure, or a detached "now" run
  rejecting must never block the HTTP response or abort the nightly `distill()` tick. This mirrors
  the grounding / nightly-distiller / `RunRecorderService` posture.
- **Never a silent destructive delete** — the operator's source folder is copied, not moved;
  ingested queue files are archived to `_imported/`, not removed. Skipped files are always counted,
  never dropped without a trace.
- Staging + archive dirs live OUTSIDE the vault dir so `VaultService.scan()` never surfaces
  un-ingested files as notes.
- ⚠ Commit hygiene (self-knowledge drift gate): before each phase commit run
  `pnpm self-knowledge:generate` and `git add` the note. Do NOT run `graphify update .` between
  phases — run it once at the very end. Do not touch unrelated operator WIP (`TODO.md` is
  currently modified) or run destructive git operations.
