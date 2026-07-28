# Roadmap (Phase 125)

The **roadmap** is the per-project delivery backlog — epics + tasks, imported
from Jira/GitHub or created manually, with a dependency graph that gates when
a task is safe to dispatch. This doc covers **125a**: the data model, the
per-project item store, the global level-mapping table, and the endpoints
that land in this sub-phase. See `docs/plans/phase-125-project-roadmap.md`
for the full master plan (import/sync in 125b, play + the dependency gate in
125e, the UI in 125d/f, decomposition in 125g).

## Pieces

| Piece      | File                                                      | Role                                                                           |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Contract   | `libs/contracts/src/roadmap/roadmap-item.schema.ts`       | `RoadmapItemSchema`, `Create`/`UpdateRoadmapItemSchema`, `RoadmapConfigSchema` |
| Contract   | `libs/contracts/src/roadmap/roadmap-readiness.ts`         | Pure `isBlocked()` / `readiness()` helpers (derived board state)               |
| Contract   | `libs/contracts/src/roadmap/level-mapping.schema.ts`      | `LevelMappingSchema`, `DEFAULT_LEVEL_MAPPING`, `resolveLevel()`                |
| Contract   | `libs/contracts/src/roadmap/roadmap.contract.ts`          | `roadmapContract` — item CRUD, config, level-mapping, under `/api`             |
| Store      | `apps/api/src/roadmap/roadmap.store.ts`                   | `RoadmapStore` — two-level file store + per-project config                     |
| Store      | `apps/api/src/roadmap/level-mapping.store.ts`             | `LevelMappingStore` — single global JSON document                              |
| Provider   | `apps/api/src/roadmap/roadmap-attachment-ref.provider.ts` | `AttachmentSetRefProvider` for the orphan-attachment sweep                     |
| Controller | `apps/api/src/roadmap/roadmap.controller.ts`              | implements `roadmapContract`                                                   |
| Module     | `apps/api/src/roadmap/roadmap.module.ts`                  | resolves `ROADMAP_DIR` (`$ROADMAP_DIR` env or `.zibby/data/roadmap`)           |

## Data model

One file per item: `.zibby/data/roadmap/<projectId>/<itemId>.json`. A sibling
`<projectId>/_config.json` holds the project's roadmap config (today: just
the `autoSync` toggle — the toggle next to the future Sync button). A global
`_level-mapping.json` sits at the roadmap root (not per-project).

`RoadmapItemSchema` (full shape lands in 125a; several fields are written
only by later sub-phases — see DECISIONS.md D-005):

```
id            // deterministic for imports: roadmapItemIdForSource(integrationId, externalId);
              // minted (collisionResistantId) for manual items
projectId
level         // "epic" | "task"
parentId?     // the epic id, for a task
name / description (markdown)
source        // { kind: "jira" | "github" | "manual", integrationId?, externalId?, externalKey?, url? }
externalLevel?      // raw source level ("Story", "Sub-task", "Milestone")
attachmentSetId? / attachments[]
dependsOn: string[]              // every roadmap item id this item is gated on
dependsOnFromSource: string[]    // the subset the source owns; re-sync (125b) may rewrite ONLY these
overrideBlocked?    // Tier-3 "pustit i tak"
origin?             // "zibby-decomposed" -> the "navrhla ZIBBY" badge (125g); cleared on any operator edit
lifecycle           // "todo" | "enqueued" | "running" | "awaiting-merge" | "done" | "failed" | "archived"
runs[]              // { taskId, runRef?, prNumber?, prUrl?, artifactPath?, startedAt, finishedAt?, outcome }
createdAt / updatedAt / syncedAt?
```

`runs[].outcome` is `"running" | "awaiting-merge" | "done" | "failed"` — a
tight enum distinct from `RunStatusSchema` (which describes an agent/skill/
pipeline run in general). It only describes a run record's own point of view
and deliberately excludes `todo`/`enqueued`/`archived`, which describe the
**item** before/after a run exists, never a run itself.

### `blocked` is derived, never stored

There is no `blocked` field on the schema. `roadmap-readiness.ts` exports:

- `isBlocked(item, get)` — `!item.overrideBlocked && item.dependsOn.some(id
=> get(id)?.lifecycle !== "done")`. A dependency `get()` can't resolve
  (a dangling id) counts as **not done**, so a missing dependency blocks.
- `readiness(item, get)` — maps an item to one of five states, in this
  order: `done` (lifecycle `done`) → `archived` (lifecycle `archived`) →
  `blocked` (derived) → `in-progress` (`enqueued`/`running`/`awaiting-merge`)
  → `ready` (everything else, including `failed` — a failed item is exactly
  what the operator can act on right now via Restart/Resume, and it still
  never unblocks a dependent since `isBlocked` tests `lifecycle !== "done"`).
  `archived` is not a board column at all; the future board filters it out.

**Watch out — an archived blocker never clears.** `isBlocked` tests
`lifecycle !== "done"`, and `archived` is not `done`, so every dependent of an
item the source stopped returning stays blocked indefinitely. That is the right
fail-closed behaviour (an item whose source issue vanished has demonstrably not
shipped, and silently unblocking on it is how the wrong-order failure this phase
exists to prevent gets back in), but it is a trap if the board just renders
"čeká na X" with no hint that X is gone: the operator sees a card waiting on
something that will never arrive. **The board (125d) must mark an archived
blocker distinctly on the dependency badge**, so the only escape — the Tier-3
`overrideBlocked` — is a visible choice rather than a guess.

### Ownership split on re-sync (125b enforces this; 125a's schema reserves the shape for it)

The **source** owns `name`, `description`, `externalLevel`, `attachments`,
`source.url`, `parentId`, and `dependsOnFromSource`. **ZIBBY** owns
`lifecycle`, `runs`, `overrideBlocked`, `origin`, and any edge in `dependsOn`
that is not in `dependsOnFromSource`. A re-sync never touches the second
group. `UpdateRoadmapItemSchema` (the operator-facing PATCH body) currently
allows editing `name`/`description`/`level`/`parentId`/`dependsOn` in
addition to the ZIBBY-owned `overrideBlocked` — for a `manual` item the
operator is the only owner of those fields; for an **imported** item, an
operator edit is a local override that a subsequent re-sync (125b) will
overwrite back to the source's value. `lifecycle` is never operator-editable.

## Level mapping

`libs/contracts/src/roadmap/level-mapping.schema.ts`:

```
LevelMappingEntrySchema = { kind: "jira" | "github", externalLevel: string, target: "epic" | "task" | "ignore" }
LevelMappingSchema = { entries: LevelMappingEntrySchema[] }
```

`DEFAULT_LEVEL_MAPPING` seeds: Jira `Epic→epic`, `Story|Task|Bug|Sub-task→task`,
`Initiative→ignore`; GitHub `Milestone→epic`, `Issue→task`.
`resolveLevel(mapping, kind, externalLevel)` looks a level up
**case-insensitively** (both the stored entry and the lookup are
trimmed + lowercased before comparing) — an external system's casing isn't a
guaranteed contract, and an operator hand-editing the table shouldn't have
to match case exactly. The _stored_ casing is never altered, only the
comparison folds case. Returns `undefined` for a never-seen pair; the sync
tick (125b) calls `LevelMappingStore.ensureLevels(kind, externalLevels[])`,
which appends every unseen level with `target: "task"` (deduped, existing
entries untouched) so the table populates itself from reality.

`LevelMappingStore` loads synchronously in its constructor (same posture as
`PinsStore`/`SystemConfigStore`) and fails open to `DEFAULT_LEVEL_MAPPING` on
a missing **or** corrupt file — a garbled mapping table must never block a
sync tick or the settings page.

## Storage — the two-level file store

`RoadmapStore` is modeled directly on `ChannelItemStore`
(`apps/api/src/channels/channel-item.store.ts`): `EntityFileStore` is
flat-dir only, so a `<root>/<projectId>/<itemId>.json` layout needs its own
class. Resolution is **two steps** — `projectId` is validated against the
roadmap root first, then `itemId` against the resolved project directory.
A single-step resolve against the root would be a traversal hole (an item id
crafted to look like `../other-project/x` could otherwise escape its own
project directory even though it individually passes the item-id regex).

`list(projectId)` tolerates a corrupt file (skips it) and explicitly skips
the sibling `_config.json`, exactly like `ChannelItemStore` skips
`cursor.json`. `update(projectId, itemId, mutate)` is an atomic
get-mutate-write critical section under `withPathLock`, keyed by the
resolved file path.

## Attachment sweep

`RoadmapAttachmentRefProvider` (`apps/api/src/roadmap/roadmap-attachment-ref.provider.ts`)
walks every project's items and collects `attachmentSetId`s, contributed to
`TaskSchedulerService`'s 24h orphan-attachment sweep via the
`ATTACHMENT_SET_REF_PROVIDER` array factory in
`apps/api/src/tasks/attachment-set-refs.module.ts` (there is no NestJS
`multi: true`, so a second contributor extends that factory's array +
`inject`, exactly like `AutomationAttachmentRefProvider`). Without this, a
roadmap item's imported/attached files could age past the sweep TTL and be
reaped before the item ever becomes a `ScheduledTask` (125e).

## Endpoints

Per-project (`/api/projects/:projectId/roadmap/...`):

- `GET /projects/:projectId/roadmap` — list every item in the project.
- `POST /projects/:projectId/roadmap/items` — manually create an epic or
  task (`source.kind: "manual"`, id minted server-side). 422 when `parentId`
  doesn't reference an existing item, or references one that isn't an epic.
- `GET /projects/:projectId/roadmap/items/:itemId` — get one item (404 if
  missing).
- `PATCH /projects/:projectId/roadmap/items/:itemId` — partial edit of the
  operator-owned fields (see "Ownership split" above); `parentId: null`
  clears it (same convention as `UpdateAgentSchema.avatar`). Clears `origin`
  on every edit.
- `DELETE /projects/:projectId/roadmap/items/:itemId` — delete (404 if
  missing).
- `GET|PUT /projects/:projectId/roadmap/config` — the per-project
  `{ autoSync }` toggle.

Global:

- `GET|PUT /roadmap/level-mapping` — the external-level → epic/task/ignore
  table shown at `/settings?tab=tasks` (UI lands in a later sub-phase).

Routes not yet implemented (later sub-phases, same `roadmapContract` file):
`POST /projects/:projectId/roadmap/sync` (125b), a `play` action per item
(125e).
