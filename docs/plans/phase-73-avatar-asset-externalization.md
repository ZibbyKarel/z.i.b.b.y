# Phase 73 — Externalize uploaded avatars to asset files (agents + pipelines)

> Completes TODO item 1: _"avatar u pipeline/agenta by neměl být inline v md souboru. Spíš
> jen uložený jako asset někde ve složce a v md souboru by měl být jen název toho souboru.
> Navrhuji přímo ve složkách .zibby/agents/assets a .zibby/pipelines/assets."_

## Problem

An uploaded agent/pipeline avatar (phase 32) is stored as a `data:image/*;base64,…` URI
**inline in the entity's Markdown frontmatter** (`.zibby/data/agents/<id>.md`,
`.zibby/data/pipelines/<id>.pipeline.md`). A 2 MB image becomes ~2.8 M base64 chars sitting
in a text file that is otherwise human-readable and git-diffable. It bloats the md, makes
diffs unreadable, and is re-read/parsed on every `list()`.

The five bundled agents use `avatar: /avatars/architect.png` (a root path to a web static
asset) — those MUST stay untouched. Only **uploaded data-URI avatars** get externalized.

## Design — storage-layer only, wire contract unchanged

Keep the HTTP/`@zibby/contracts` `avatar` field exactly as today (a `data:image/*` URI or a
`/`-rooted path — `AvatarSchema`). The change is purely how the bytes sit **on disk**:

- **On disk** the frontmatter stores a bare relative reference: `avatar: assets/<id>.<ext>`
  and the bytes live in `<entity-dir>/assets/<id>.<ext>` (i.e. `.zibby/data/agents/assets/`
  and `.zibby/data/pipelines/assets/`). `<ext>` derived from the data-URI mime
  (`image/png`→`png`, `image/jpeg`→`jpg`, `image/webp`→`webp`, `image/svg+xml`→`svg`,
  `image/gif`→`gif`; fallback `png`).
- **On the wire** the entity still carries the full `data:image/*` URI — the storage layer
  inlines the asset back on read. So no contract change, no web change, no serving change.

### New shared helper — `AvatarAssetStore`

`apps/api/src/shared/file-storage/avatar-asset-store.ts` (+ test). A small class constructed
with the entity data dir; assets live in `<dir>/assets`:

- `parseDataUri(value): { mime, ext, bytes } | null` — returns null for non-`data:image/`.
- `async externalize(id, dataUri): Promise<string>` — writes `assets/<id>.<ext>` (atomic;
  reuse `writeFileAtomic` / `ensureDir` from `file-utils`), removing any stale
  `assets/<id>.*` with a different extension first; returns the reference `assets/<id>.<ext>`.
- `inlineSync(ref): string | null` — `ref` like `assets/<id>.<ext>`: `readFileSync` the file,
  return `data:<mime>;base64,<...>` (mime from ext), or null if missing/unreadable. Sync on
  purpose so it slots into the existing sync `fromFrontmatter`. Guard the ref: must match
  `^assets/[A-Za-z0-9._-]+$` (no separators/traversal) — anything else → null.
- `async remove(id): Promise<void>` — unlink any `assets/<id>.*` (tolerant of ENOENT).
- `isAssetRef(value): boolean` — `value.startsWith("assets/")`.

### Wire it into `AgentsStorageService` and `PipelinesStorageService`

Both extend `MarkdownEntityStore`. Give each an `AvatarAssetStore` (constructed from the
same injected dir — `AGENTS_DIR` / the pipelines dir token). Then:

- **Write** (`create` / `update`): after computing the final entity but **before**
  `writeEntity`, if `entity.avatar` is a `data:image/` URI → `externalize(id, avatar)` and
  persist a disk-form entity whose `avatar` is the returned reference; the entity **returned
  to the caller keeps the data URI**. If `avatar` is `/`-rooted (bundled) → leave as-is, no
  asset written. On `update` with `avatar === null` (clear) → `remove(id)` and drop the key
  (already dropped from `merged`). On `update` that replaces one uploaded avatar with another,
  `externalize` overwrites; when replacing an uploaded avatar with a `/`-rooted one, `remove(id)`.
  - Cleanest seam: override `writeEntity` is awkward (it re-serializes the passed entity). Do
    it explicitly in `create`/`update`: build `disk = avatar is dataURI ? {...entity, avatar: ref} : entity`,
    call `writeEntity(disk)` (frontmatter then stores the ref), `return entity` (data URI).
- **Read** (`fromFrontmatter`): if `data.avatar` is a string and `isAssetRef(it)` → replace it
  with `avatarAssets.inlineSync(it)` **before** building the schema candidate. If inline
  returns null (asset file gone), omit `avatar` (entity still valid; UI falls back to glyph).
  `/`-rooted and already-`data:` values pass through unchanged.
- **Delete** the entity → also `remove(id)` its asset (in the storage `delete` override, or in
  the controller — prefer the storage layer so it's centralized; add a `delete` override that
  calls `super.delete` then `avatarAssets.remove(id)`).

### Migration of existing inline avatars

There is likely at least one on-disk entity already carrying an inline data URI (from a prior
upload). Add a tiny **idempotent, lazy migration**: none required as a separate script — the
next `update` naturally externalizes. But to convert existing files without an edit, add a
one-shot `onModuleInit` sweep in each storage service: `list()` the entities; for any whose
**raw frontmatter** avatar is a `data:` URI, rewrite it through the externalize path. Keep it
cheap and tolerant (log + skip on error). If no inline avatars exist on disk, this is a no-op.
(Grep first: `grep -l 'avatar: data:' .zibby/data/agents/*.md .zibby/data/pipelines/*.pipeline.md` —
if none, still ship the sweep for future robustness but note it found nothing.)

### `.gitignore` / assets dir

The `assets/` dirs hold binary uploads — decide with the repo's convention. The `.zibby/data`
tree appears committed (agents/pipelines are in git). Uploaded binaries probably should NOT be
committed: add `.zibby/data/agents/assets/` and `.zibby/data/pipelines/assets/` to `.gitignore`
(check the existing `.gitignore` for how `.zibby/data` is handled — mirror it). Add a
`.gitkeep`-free approach: `ensureDir` creates them at runtime. If the repo intentionally commits
seed data, leave a note but default to gitignoring the binary assets.

## Files

- `apps/api/src/shared/file-storage/avatar-asset-store.ts` (new) + `.test.ts`
- `apps/api/src/shared/file-storage/index.ts` — export it
- `apps/api/src/agents/agents.storage.service.ts` — wire in (create/update/delete/read/sweep)
- `apps/api/src/pipelines/pipelines.storage.service.ts` — same
- `apps/api/src/agents/agents.storage.service.test.ts` /
  `apps/api/src/pipelines/pipelines.storage.service.test.ts` — add cases
- `.gitignore` — ignore the two `assets/` dirs (mirroring existing `.zibby` handling)

## Tests (must add)

- `AvatarAssetStore`: externalize writes `assets/<id>.png` + returns ref; inlineSync round-trips
  to the same data URI; ext is derived from mime; stale-ext cleanup; ref-guard rejects
  `assets/../x` and absolute paths; remove unlinks; missing asset → inlineSync null.
- Agents storage: create with a `data:image/png;base64,…` avatar → the on-disk `.md`
  frontmatter contains `avatar: assets/<id>.png` (NOT a data URI) AND `get(id)` returns the
  full data URI; a `/avatars/x.png` avatar is stored verbatim and no asset file is written;
  `update({avatar:null})` removes the asset file; `delete` removes it. Same for pipelines.
- Assert the md file body does not contain `data:image` after create with an uploaded avatar
  (the core acceptance criterion).

## Verification (run, paste real output)

- `npx tsc -p apps/api/tsconfig.json --noEmit` (only the 2 known pre-existing machine errors).
- `npx eslint` on touched files — clean.
- `rtk proxy npx vitest run apps/api/src/shared/file-storage apps/api/src/agents apps/api/src/pipelines`
  — green modulo documented pre-existing reds; any NEW red is yours.
- Manually create an agent via the store test to confirm the `.md` is human-readable again.

## Constraints

- No contract change, no web change (pure storage refactor). React/DS rules N/A here.
- No `any`; strict TS; atomic writes; fail-closed ref guards (no path traversal in asset refs).
- Keep the five bundled `/avatars/*.png` agents byte-for-byte unchanged on disk.
