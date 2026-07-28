# Roadmap (Phase 125)

The **roadmap** is the per-project delivery backlog — epics + tasks, imported
from Jira/GitHub or created manually, with a dependency graph that gates when
a task is safe to dispatch. This doc covers **125a** (the data model, the
per-project item store, the global level-mapping table, and the CRUD
endpoints), **125b** (`RoadmapSourceService`'s Jira/GitHub import and the
manual `POST .../roadmap/sync` route) and **125e** (play, the dependency gate,
merge signals, lifecycle completion, Tier-3 override, restart/resume). See
`docs/plans/phase-125-project-roadmap.md` for the full master plan (the UI in
125d/f, decomposition in 125g).

## Pieces

| Piece      | File                                                      | Role                                                                                                |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/roadmap/roadmap-item.schema.ts`       | `RoadmapItemSchema`, `Create`/`UpdateRoadmapItemSchema`, `RoadmapConfigSchema`                      |
| Contract   | `libs/contracts/src/roadmap/roadmap-readiness.ts`         | Pure `isBlocked()` / `readiness()` helpers (derived board state)                                    |
| Contract   | `libs/contracts/src/roadmap/level-mapping.schema.ts`      | `LevelMappingSchema`, `DEFAULT_LEVEL_MAPPING`, `resolveLevel()`                                     |
| Contract   | `libs/contracts/src/roadmap/roadmap-play.schema.ts`       | `PlayRoadmapItemsSchema` (bulk play body), `OverrideRoadmapItemSchema` (125e)                       |
| Contract   | `libs/contracts/src/roadmap/roadmap.contract.ts`          | `roadmapContract` — item CRUD, config, level-mapping, sync, play/override/restart/resume, `/api`    |
| Contract   | `libs/contracts/src/roadmap/roadmap-sync.schema.ts`       | `RoadmapSyncResultSchema` — the sync endpoint's response                                            |
| Store      | `apps/api/src/roadmap/roadmap.store.ts`                   | `RoadmapStore` — two-level file store + per-project config                                          |
| Store      | `apps/api/src/roadmap/level-mapping.store.ts`             | `LevelMappingStore` — single global JSON document                                                   |
| Provider   | `apps/api/src/roadmap/roadmap-attachment-ref.provider.ts` | `AttachmentSetRefProvider` for the orphan-attachment sweep                                          |
| Service    | `apps/api/src/roadmap/roadmap-source.service.ts`          | `RoadmapSourceService` (125b) — Jira/GitHub import + upsert                                         |
| Service    | `apps/api/src/roadmap/roadmap-gate.service.ts`            | `RoadmapGateService` (125e) — play/override/restart/resume, the FIFO drain, release signals         |
| Pure fn    | `apps/api/src/roadmap/adf-to-markdown.ts`                 | `adfToMarkdown()` — Jira ADF `description` → markdown, bounded + never throws                       |
| Pure fn    | `apps/api/src/roadmap/merge-depends-on.ts`                | `mergeDependsOn()` — the re-sync `dependsOn` ownership-split merge                                  |
| Pure fn    | `apps/api/src/roadmap/roadmap-task-text.ts`               | `buildRoadmapTaskText()` (125e) — name + description + the roadmap-context footer                   |
| Controller | `apps/api/src/roadmap/roadmap.controller.ts`              | implements `roadmapContract`                                                                        |
| Module     | `apps/api/src/roadmap/roadmap.module.ts`                  | resolves `ROADMAP_DIR` (`$ROADMAP_DIR` env or `.zibby/data/roadmap`); `@Global()` (125e, see below) |

`ProjectPrService` (`apps/api/src/projects/project-pr.service.ts`) also grows
two 125e pieces: `getPr`/`isMerged` (the merge-state poll read) and a
fire-and-forget `roadmapGate.onMerge(...)` call inside `recordMerge` (the eager
release signal) — see "Release signals" below.

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
output?             // 125e: the gate's terminal output choice for this item's task; absent = { type: "pr" }
lifecycle           // "todo" | "enqueued" | "running" | "awaiting-merge" | "done" | "failed" | "archived"
enqueuedAt?         // 125e: stamped by play/playBulk/restart; the gate drains a project's enqueued
                    // items strictly FIFO by this timestamp, never `updatedAt`
runs[]              // { taskId, runRef?, prNumber?, prUrl?, artifactPath?, startedAt, finishedAt?, outcome }
createdAt / updatedAt / syncedAt?
```

`output` and `enqueuedAt` are 125e additions to the 125a schema (see
DECISIONS.md D-005's "routes land per sub-phase" — a schema itself can grow a
field in the sub-phase that first needs it, same as `runs[]` did). Both are
operator/gate-owned, `.optional()`, and don't disturb the ownership split
above (a re-sync never touches either).

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

## Import & sync (125b)

`RoadmapSourceService` pulls items from the project's **effective** integrations —
resolved through `ResolvedProjectService.resolveIntegrations(project)`, never a raw
`integrations.list().filter(...)`, so a company-level Jira/GitHub integration is
visible to its projects. Credentials come from `CredentialsStore` and are never
logged. `fetchImpl` is injectable (`@Optional()`), so the fetchers are testable
without network.

It deliberately does **not** reuse `ChannelAdapter.poll`: the channel adapters fetch
a message-shaped subset (`JiraChannelAdapter` doesn't even request `description`),
while the import needs full fields, links and attachments. It also deliberately
**backfills** — the channel adapters seed their cursor to "now" and ingest nothing on
a first poll, which would leave a fresh roadmap empty. Both fetchers paginate
(Jira via `startAt`/`total`, GitHub via `page`), each capped at `MAX_PAGES` (20 pages
of 100) so a full backfill still terminates deterministically against a very large
project/repo.

### Jira

`POST /rest/api/3/search`, requesting
`summary,description,issuetype,parent,issuelinks,attachment,status`.

- `description` arrives as **ADF JSON, not text** — `adf-to-markdown.ts` flattens it
  (paragraphs, headings, lists, code blocks, links, inline marks). It is bounded by
  an explicit depth cap and degrades unknown nodes to their text content; it never
  throws, including on `null`, a bare string, or absurdly deep input.
- **Edge direction is the sharp edge here.** A link exposes its direction by which of
  `inwardIssue` / `outwardIssue` is present, each paired with its own phrase
  (`type.inward` / `type.outward`) describing _this_ issue's relationship to the
  referenced one. For the stock "Blocks" type that is
  `{ inward: "is blocked by", outward: "blocks" }` — so an `outwardIssue` entry means
  this issue **blocks** the other and must **not** become a dependency. Only the
  "blocked by" phrase creates an edge, whichever side carries it. Inverting this
  would gate the wrong item, which is precisely the failure this phase exists to
  prevent, so it is tested from both directions
  (`roadmap-source.service.test.ts`'s Jira fixture).
- Hierarchy (`parentId`) is resolved by walking `fields.parent` up to the nearest
  ancestor whose level-mapping target is `"epic"` (`resolveEpicParent`), capped at 25
  hops against a malformed/cyclic chain. One walk covers BOTH the classic "Sub-task
  flattens to `task`, inherits the parent's epic" case (the immediate parent is a
  Story, which itself has an epic parent) and a team-managed Story/Task that names
  its epic directly via `parent` (one hop) — deliberately NOT keyed off
  `issuetype.hierarchyLevel`, so the operator-editable level-mapping table stays the
  single source of truth for what counts as an epic. A parent outside the current
  sync's batch (not returned by the same search) leaves the item unparented rather
  than erroring.

### GitHub

`GET /repos/{repo}/issues?state=all` — entries carrying `pull_request` are dropped,
because that endpoint returns PRs too — plus `GET /repos/{repo}/milestones?state=all`
(Milestone → epic, Issue → task; a milestone's own `parentId` is unset, an issue's
`parentId` is its milestone's item, when it has one). Bodies are already markdown, no
flattening needed. Edges come from two sources, unioned:

- `Depends on #N` / `Blocked by #N` parsed from the body — case-insensitive, and
  tolerant of a list on one line (`Blocked by #12, #14 and #16`) via a phrase-then-
  numbers regex that only reads `#N`s actually named by the phrase, not every
  issue-number mentioned in the prose.
- Best-effort native sub-issues (`GET /issues/{n}/sub_issues`, a newer GitHub
  hierarchy API): a parent issue depends on each of its declared native sub-issues —
  the same "not really done until its children are" relationship Jira's flattened
  sub-tasks carry implicitly. A 404/410 (an older API without the endpoint) — or any
  other failure — degrades to "no native sub-issues" rather than erroring; this is a
  best-effort ENRICHMENT, not a fetch the sync depends on.

GitHub issues expose attachments only as inline markdown links in the body, with no
listing/download endpoint the way Jira's `fields.attachment` is a structured array —
downloading GitHub attachments is out of scope for this sub-phase.

### Level mapping

Each item's level goes through `resolveLevel(mapping, kind, externalLevel)`, and every
level seen in a fetch is fed to `LevelMappingStore.ensureLevels` so unseen levels
append themselves as `task`. A level whose target is `"ignore"` is parsed but never
becomes an item — it counts toward the summary's `skipped`.

### Attachments

Bytes are downloaded into a new set via `AttachmentStorageService`. Caps are **25 MB
per file and 10 files per item**; anything over is skipped and recorded on the item's
`syncNotes` rather than silently dropped. A download failure skips that one file with
a note instead of failing the whole sync.

`syncNotes` is a field on the item, **not** text appended to `description` — the
description is source-owned and a re-sync overwrites it, so a note parked there would
vanish on the next tick.

**Re-download avoidance rule.** A within-cap attachment list is only (re)downloaded
when it differs from what's already stored: both lists are reduced to a
`name:size` signature (sorted, joined), and an unchanged signature reuses the
existing `attachmentSetId`/`attachments` as-is — no bytes are re-fetched just because
a sync ran again. A changed signature (an attachment added, removed, or resized)
downloads the WHOLE within-cap set fresh and gets a new `attachmentSetId`; the old
set is simply no longer referenced (not eagerly deleted) and ages out through the
existing 24h orphan-attachment sweep once nothing points at it, same as everywhere
else that sweep applies.

### Upsert and the ownership split

Keyed by `(integrationId, externalId)` through `roadmapItemIdForSource`, so re-import
is idempotent and one issue never becomes two items.

A re-sync writes only `name`, `description`, `externalLevel`, `attachments`,
`source.url`, `parentId`, `dependsOnFromSource`, `syncNotes` and `syncedAt`. It never
touches `lifecycle`, `runs`, `overrideBlocked`, `origin` — or any manual `dependsOn`
edge.

That last one is subtle enough to live in its own pure, separately-tested function,
`mergeDependsOn(current, oldFromSource, newFromSource)`: `dependsOn` is the union of
source-declared and operator-added edges, so a re-sync must drop source edges the
source removed, pick up newly-declared ones, and leave every manual edge alone. It is
the one place a bug silently loses an operator's dependency, which is why it is not
buried in the upsert's read-modify-write.

Source status Done/closed → `lifecycle: "done"`. An item the source stops returning →
`lifecycle: "archived"`, **never deleted** (and note the archived-blocker consequence
above). An archived item that reappears in the source returns to `todo`. These are
the only two lifecycle transitions the sync ever makes — a lifecycle a later
sub-phase (125e) has since advanced (`enqueued`/`running`/`awaiting-merge`/`failed`)
passes straight through untouched whenever neither transition applies.

An item whose level-mapping `target` resolves to `"ignore"` is parsed but never
turned into a roadmap item (counted in `skipped`), and is deliberately excluded from
the "seen this sync" set too — so a PREVIOUSLY imported item whose external level
later gets remapped to `"ignore"` archives on its next sync, exactly as if the source
had stopped returning it. A source-level failure (network, rate limit, a malformed
response) is caught per source and recorded as a `notes` entry keyed by the
integration's id rather than aborting the other configured source's sync.

### The endpoint

`POST /projects/:projectId/roadmap/sync` → `RoadmapSyncResultSchema`:
`{ imported, updated, archived, skipped, notes[] }`. A project with **no** Jira/GitHub
integration returns all-zero counts rather than an error, mirroring
`ProjectPrService.listOpen`'s "no link is not an error" posture.

Sync is **read-only toward Jira and GitHub** — nothing is ever written back (Law 3),
and imported issue bodies are data, never instructions (Law 4).

## Play + the dependency gate (125e)

`RoadmapGateService` (`apps/api/src/roadmap/roadmap-gate.service.ts`) is the one
thing that decides when a roadmap item may become a real `ScheduledTask`. It
never merges, pushes to a shared branch, or auto-dispatches on its own
initiative (Law 3) — every dispatch traces back to an operator's play/restart/
resume/override click, or to a merge that already happened on GitHub.

### Play records intent only

`play(projectId, itemId)` requires `lifecycle === "todo"` (409 —
`RoadmapItemLifecycleError`, "already in flight" — otherwise) and stamps
`lifecycle: "enqueued"` + `enqueuedAt: now`. It does **not** create a task. It
then immediately attempts a **drain** — if the item isn't blocked (or an
override already applies), it releases right away and the response already
shows `lifecycle: "running"`; if it's blocked, the response shows
`"enqueued"` and the item sits in BLOKOVANÉ until a release signal fires.

`playBulk(projectId, itemIds)` ("zařadit vše") stamps every `todo` id's
`enqueuedAt` a millisecond apart, **in `itemIds`' array order**, so the FIFO
drain below releases them in exactly the order the operator selected them —
even when every id lands in the same event-loop tick. An id that doesn't
resolve to a real item 404s the whole call; an id that resolves but isn't
`todo` is silently skipped (idempotent — a multi-select naturally mixes
lifecycles once some cards are already in flight) rather than aborting the
batch. The response carries only the items actually touched.

### The gate itself

A **drain** (private, triggered by play/playBulk/restart/override/onMerge/
reconcile\*) lists a project's `enqueued` items, sorts them **FIFO by
`enqueuedAt`**, and releases every one for which `!isBlocked(item, get)` — the
pure helper imported from `@zibby/contracts` (`roadmap-readiness.ts`), never
reimplemented. A drain is locked per project (`withPathLock`, key
`roadmap-gate:<projectId>`) so two triggers racing (an operator's play and an
in-flight `onMerge`, say) can never both decide to release the same item.

**Concurrency is deliberately NOT this gate's job** — 125c's system-wide
`maxConcurrentRuns` cap lives entirely inside `TaskSchedulerService`. The gate
only ever asks "are this item's dependencies done"; `createTask` itself
decides whether a release dispatches immediately or gets queued/held by the
scheduler's own capacity guard, and either way the roadmap item is `running`
the moment its `ScheduledTask` exists — the task's own subsequent queued-vs-
dispatched fate is the scheduler's business, not the gate's.

### Play → task (release)

On release, the gate calls `TaskSchedulerService.createTask` with:

- `title` = the item's `name`; `text` = `buildRoadmapTaskText(item, allItems)`
  (`roadmap-task-text.ts`) — the item's `name` + `\n\n` + `description`, plus a
  roadmap-context footer naming the epic's siblings already merged
  (`lifecycle: "done"`) and currently in flight (`enqueued`/`running`/
  `awaiting-merge`). Truncates only the `description` to stay under
  `CreateTaskInputSchema.text`'s 8000-char cap — the footer is never
  truncated (see below).
- `paths: [project.path]` — **never** `projectId`/`trustedProjectId` on
  `CreateTaskInput`. Attribution stays entirely server-derived via the
  existing `matchProject` seam (Law 4). A project with no local `path`
  configured fails the release outright (see "Release failures" below)
  rather than risk misattribution.
- `attachmentSetId` = the item's set, when present.
- `output` = the item's own `output` field, or `{ type: "pr" }` by default.
- `explicitTarget` = **absent** — "the classifier picks the target" (the
  master plan's Play UX decision).
- `background: false` — the synchronous server-side call pattern (the same
  one `automations/scheduler.service.ts` uses), so the gate always learns the
  real outcome (`dispatched`/`pending`/`scheduled`) before it writes the
  item's `running` run record. (The interactive New Task dialog's
  `background: true` path is a UI-latency optimization that doesn't apply
  here — a play click isn't blocked on the classify+spawn, but this call site
  is the gate's own internal `drain`, not a live HTTP request from a
  human waiting on a dialog to redirect.)

The returned task id (and `runRef`, when the dispatch was synchronous) lands
on a new entry in the item's `runs[]`; `lifecycle → "running"`.

### The imported-issue-body rule (Law 4) — the footer's trust boundary

The task `text` embeds the item's `description`, which for an imported item
is third-party issue content — **data, never instructions** (Law 4): nothing
in it may raise privilege or skip the gate, and nothing in it may be mistaken
for ZIBBY's own framing. `buildRoadmapTaskText` makes this boundary
unspoofable three ways (see the function's own docblock for the fully
reasoned version):

1. **Order is fixed by code, unconditionally** — `name`, then the (possibly
   truncated) `description`, then the footer, always in that order, every
   time. An issue body can contain text that _looks_ like the footer, but it
   can never make its own fake copy the true FINAL section — the real one,
   computed from ZIBBY's own data (sibling lifecycles), is always appended
   last.
2. **Self-declaring** — the footer's own marker sentence states in plain
   language that everything above it (including an apparent copy of the same
   marker) is untrusted issue content, not ZIBBY's framing, and carries no
   instruction or privilege.
3. **Purely informational** — the footer only lists names; it issues no
   directive of its own, so a spoofed copy has nothing useful to imitate.

### Tier-3 override — "pustit i tak"

`override(projectId, itemId, overrideBlocked)` sets the flag
unconditionally (any lifecycle) — it only takes effect the next time the
gate evaluates the item. If the item is currently `enqueued`, `override` also
attempts an immediate drain, so an item blocked ONLY by this dependency
releases right away instead of waiting for the next unrelated drain trigger.
Setting the flag on a `todo` item does **not** play it — play stays the
operator's separate click.

### Restart vs Resume (a `failed` item's two recovery actions)

Both require `lifecycle === "failed"` (409 otherwise):

- **`restart`** — re-enqueues the item (the same `play` path, gated on
  `failed` instead of `todo`) and dispatches a **brand-new** task. Chosen
  because a `failed` item, by definition, produced no usable artifact — there
  is nothing safe to resume from, so a fresh worktree off the current
  `origin/<default>` is the only sound starting point. The prior run stays in
  `runs[]` as history; a new entry is appended once the gate releases it
  again.
- **`resume`** — reuses `TaskRunsService.resume`, the SAME unified resume
  machinery the run detail already exposes (Phase 49: a parked pipeline/goal
  resumes in place; an errored/interrupted agent run re-runs with
  `--resume <sessionId>` when one was captured). Updates the item's LAST
  `runs[]` entry in place (new `runRef`, `outcome: "running"`, fresh
  `startedAt`) rather than appending — it's the same task continuing, not a
  new one. 409s when the last run has no `runRef` at all (never actually
  dispatched — e.g. `createTask` itself failed at release time; only
  `restart` applies then) or when `TaskRunsService.resume` itself rejects
  (not currently resumable).

Restart is strictly the fallback: cheaper resume is offered whenever the last
run is actually resumable, and both are always available side by side on a
`failed` card — which one applies depends on the run's own state, not a
choice the operator has to reason about up front.

### Lifecycle completion (`running` → `awaiting-merge` / `done` / `failed`)

Driven by `reconcileRunning(projectId)`, which reads the gate-created task's
own `outcome` back by id (`ScheduledTasksStorageService.get`) rather than a
hook FROM `TaskSchedulerService` — the latter would need a second circular
provider edge on top of the one `ProjectPrService` already carries for the
merge signal (below); reading the task back avoids it entirely. Per-item
try/catch, so one item's failure never blocks the rest. For each `running`
item whose task now carries an `outcome`:

- `outcome.status === "error"` → `failed`.
- `outcome.status === "done"` and `outcome.pr?.url` present → `awaiting-merge`
  (the PR number is parsed from the url and stored on the run for the merge
  poll below).
- `outcome.status === "done"` and the task's `output.type === "file"` → a
  **document artifact** reaches `done` DIRECTLY, without ever passing through
  `awaiting-merge` — a document can never be merged and must not wait for a
  merge that will never come.
- `outcome.status === "done"` with neither of the above (a `pr` output that
  never produced one) → **no artifact**, `failed` — never silently `done`.

A periodic call to `reconcileRunning` is **125h's job** (the auto-sync tick);
this sub-phase ships the fully-tested mechanism, not the ticker.

### Release signals (both, per the master plan — "belt and braces")

1. **Eager** — `ProjectPrService.recordMerge` (the merge loop's head, reached
   only from the operator-triggered `POST /projects/:id/prs/:number/merge`
   route) fires `void this.roadmapGate.onMerge(projectId, number).catch(() =>
{})` in the same spot it already records `merge-completed` + a `MergeWatch`.
   Deliberately **unawaited** (fire-and-forget — the operator's merge
   response must never wait on roadmap bookkeeping) and **independently
   caught** right there — not just relying on `merge()`'s own
   `.catch(() => {})` around the whole `recordMerge` call, since an unawaited
   rejection is invisible to that outer catch and would otherwise surface as
   an unhandled rejection. Either way: **a roadmap bookkeeping failure must
   NEVER surface as a merge failure** — the merge already happened on GitHub
   regardless of what happens inside `onMerge`.
2. **Poll** — `reconcileAwaitingMerge(projectId)` resolves every
   `awaiting-merge` item's PR state via the new `ProjectPrService.isMerged`
   (mirrors `listOpen`'s error posture: 404 → not found, 429/403 → throws
   "github rate limited", no github link → not found) — **fail-CLOSED**:
   any failure (including a thrown rate-limit) resolves to `false`, so an
   unreadable PR state never releases a downstream item. This is the
   opposite posture from `PostMergeWatchService.rollup`'s fail-OPEN
   `"pending"`, which is watching an ALREADY-merged sha's CI outcome, not
   gating a fresh dispatch. A periodic call is 125h's job, same as
   `reconcileRunning`.

Both signals converge on the same private `markDone` → `lifecycle: "done"` →
drain the project's `enqueued` items (a document artifact reaching `done` via
`reconcileRunning`, or a PR merging via either signal above, can both unblock
a sibling immediately).

### The `ProjectPrService` <-> `RoadmapGateService` circular dependency

`ProjectPrService.recordMerge` needs `RoadmapGateService.onMerge`; some of
`RoadmapGateService`'s own methods need `ProjectPrService.isMerged`/`getPr` —
a genuine two-way provider dependency between two classes in two different
modules (`ProjectsModule` and `RoadmapModule`), which also already depend on
each other for other reasons (`RoadmapGateService` needs
`ProjectsStorageService`). Rather than have `ProjectsModule` import
`RoadmapModule` back — which, transitively (`ProjectsModule` is also a
dependency of `AgentsModule`/`TasksModule`, both imported by `app.module.ts`
BEFORE `RoadmapModule`), produces a genuine four-file `require()` cycle that
crashes Nest's module scanner no matter how the individual edges are
`forwardRef`d (`forwardRef` only defers Nest's OWN read of a wrapped
reference; it does nothing about the underlying `import` statements Node
still evaluates eagerly in file order) — **`RoadmapModule` is `@Global()`**:
its providers are available everywhere once it loads once (from
`app.module.ts`), with no module needing to add it to its own `imports: []`.
`project-pr.service.ts` still needs a real `import { RoadmapGateService } from
"../roadmap/roadmap-gate.service"` for
`@Inject(forwardRef(() => RoadmapGateService))`, and `roadmap-gate.service.ts`
symmetrically imports `ProjectPrService` — an ISOLATED two-file cycle (neither
file's other imports reach back through it), so ordinary `forwardRef` on both
of those two provider injections resolves it cleanly with no wider blast
radius. See `roadmap.module.ts`'s own docblock for the full reasoning.

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

### Watch out: `.default([])` splits a schema's input and output types

`RoadmapItemSchema` uses `.default([])` on `attachments`, `dependsOn` and
`dependsOnFromSource`. That makes the field **optional on the way in and
guaranteed on the way out** — `z.input<typeof RoadmapItemSchema>` has
`string[] | undefined` where `z.infer` (the output) has `string[]`.

Mixing the two produces the confusing `TS2719: Two different types with this name
exist, but they are unrelated` — the two `RoadmapItem`s differ only in the
optionality of a defaulted field. A fixture helper that builds an item literal is
building an **input**; type it as such, or give it every defaulted field
explicitly. Adding a new `.default()` field to the schema will surface this at
every literal that omits it.

### Running the API against this module locally

`ROADMAP_DIR` defaults to `dataDir("roadmap")`, i.e. it follows `ZIBBY_DATA_DIR`.
Booting the API with `ZIBBY_DATA_DIR` pointed at a **committed** fixture root
(`apps/api/data-test`) is not read-only: the app seeds `automations/*.json` and
reserializes the fixture agents/pipelines as YAML on write. Use a throwaway root
(`ZIBBY_DATA_DIR=.zibby/data-test`) when you just want a server to poke at, and
check `git status` afterwards — otherwise fixture churn ends up in your diff.

### Concurrency — who takes which lock

Both stores serialize their read-modify-write windows with `withPathLock`, keyed
on the resolved file path.

- `RoadmapStore.put` / `update` / `delete` all take the item file's key. `delete`
  is included deliberately: without it, a `delete` interleaving with an in-flight
  `update` lets the update's atomic rename land _after_ the unlink and resurrect
  the item.
- `LevelMappingStore.write` and `ensureLevels` take the mapping file's key — the
  **same** key, so an operator saving the table from `/settings?tab=tasks` and a
  sync tick appending newly-seen levels cannot clobber each other. Both paths
  read the whole document into memory and write it back, so without shared
  exclusion whichever landed second would win wholesale.
- `withPathLock` is **reentrant**: a nested call for a key already held runs
  inline, _unprotected_. So `ensureLevels` calls a private `writeUnlocked()`
  rather than the public, locked `write()` — the nested call would otherwise
  look like it takes the lock while silently skipping it. Any future method that
  needs to write from inside a held section must do the same.

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
- `POST /projects/:projectId/roadmap/sync` (125b) — pulls the project's
  resolved Jira/GitHub integrations and upserts their items via
  `RoadmapSourceService`; returns `RoadmapSyncResultSchema`
  (`{ imported, updated, archived, skipped, notes[] }`). No integration
  configured → an all-zero summary, not an error; only an unresolvable
  `projectId` 404s. See "Import & sync (125b)" above.

Global:

- `GET|PUT /roadmap/level-mapping` — the external-level → epic/task/ignore
  table shown at `/settings?tab=tasks` (UI lands in a later sub-phase).

Routes not yet implemented (a later sub-phase, same `roadmapContract` file):
a `play` action per item (125e).

### Error mapping

`roadmap.errors.ts` declares four errors; `makeErrorMapper("RoadmapItem", …)`
maps three of them:

| Error                          | Status | Why                                                          |
| ------------------------------ | ------ | ------------------------------------------------------------ |
| `RoadmapItemNotFoundError`     | 404    | no file for that `(projectId, itemId)`                       |
| `InvalidRoadmapItemIdError`    | 404    | the item id is unsafe as a file name (traversal, separators) |
| `InvalidRoadmapProjectIdError` | 404    | the **project** id is unsafe as a directory name             |
| `RoadmapItemConflictError`     | 409    | create hit an existing `(projectId, id)`                     |
| `CorruptRoadmapItemFileError`  | 500    | **deliberately unmapped** — see below                        |

The project-id error is deliberately its own class rather than reusing
`InvalidRoadmapItemIdError`: a malformed project id reported as
`RoadmapItem "…" not found` sends whoever is debugging a failed sync looking
for a missing item that was never the problem.

`CorruptRoadmapItemFileError` is raised by **`get()`** — a file that reads and
parses as JSON but fails `RoadmapItemSchema` — and is left out of the mapper on
purpose. Folding it into the same 404 as "not found" would hide real on-disk
data loss behind an everyday, expected status; unmapped it surfaces as a 500,
the honest signal that something is broken rather than merely absent.

`list()` is deliberately the opposite: it **skips** the very same corrupt file
`get()` rejects on, so one bad item can never take down a whole project's board.
The asymmetry is intentional — asking for one item by id should tell you the
truth about it, while rendering a board should degrade rather than fail. Both
halves are covered by tests in `roadmap.store.test.ts`.
