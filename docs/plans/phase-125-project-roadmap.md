# Phase 125 — Project Roadmap: external issue import, dependency gate, play-to-queue

**Arc:** delivery roadmap per engagement. **Design:** `design/Z.I.B.B.Y/ZIBBY Roadmap.html`
(epic list left, task board right). **Surfaces:** new `libs/contracts/src/roadmap/*`, new
`apps/api/src/roadmap/*`, new `apps/web/features/roadmap/*`, a 5th tab on the project detail,
a new `?tab=tasks` in `/settings`, one new knob in `SystemConfigSchema`.

This is a MASTER plan; the work ships as sub-phases **125a–125h** (precedent: 116a–116g).
Each sub-phase gets its own doc when it starts — this doc fixes the shared model, the
decisions already taken, and the boundaries between sub-phases.

---

## Why

A project has no place that answers "what still has to be built here". The work lives in
Jira/GitHub, the operator retypes it into the New Task dialog one item at a time, and nothing
records that item B may only start once A is merged. The roadmap makes the backlog a durable,
file-backed view per engagement, mirrors it from the third-party system the project is already
integrated with, and turns "implement this" into one click that respects ordering.

## The dependency problem — and why one gate solves both halves

Bulk-queueing N items has two failure modes, and they share a root cause: **a run starts from
a base that doesn't yet contain what it depends on.**

- **Duplicate work** — two runs branch off `origin/main` without each other's work and both
  implement the same shared prerequisite.
- **Wrong order** — `A ← B ← C`; B built on a base without A either redoes A or diverges.

So the rule is one sentence:

> **A roadmap item is dispatched only when its base already contains everything it depends on.**

Two facts make this cheap in this codebase:

1. `WorkspaceService.createWorktree` (phase 76, `apps/api/src/workspace/workspace.service.ts:69`)
   **already** fetches `origin` and cuts the run branch from `origin/<default-branch>`, not from a
   local HEAD, in an isolated `git worktree` under `resolveWorktreeRoot()`. The operator's
   "always pull main" and "use isolated worktrees" requirements are **already satisfied** —
   this phase adds nothing there and must not regress it.
2. Because the base is always the current remote default branch, "A is merged" is exactly the
   condition that makes A visible to B. Hence the release condition is **merge**, not
   "run finished".

Consequence to keep in view: ZIBBY never merges autonomously (Law 3), so a chain drains at the
pace of the operator's review. That is the intended human gate, not a defect. A per-item
**manual override** ("pustit i tak", Tier-3 confirm) exists as the escape hatch.

## Decisions taken (do not re-litigate in sub-phases)

| Question | Decision |
|---|---|
| Release condition | Blocker's PR **merged**, plus a per-item Tier-3 manual override |
| Parallelism | Everything runs in parallel; only **declared edges** hold items back. A new **system-wide** cap on concurrently running tasks is added (125c) |
| Where the wait lives | On the **roadmap item** (`lifecycle: "enqueued"`); the `ScheduledTask` is created only at release. No change to `ScheduledTaskStatusSchema` |
| Imported issue | Its **own entity**, not a `ScheduledTask` |
| Jira sub-tasks | **Flattened** to internal `task`, attached to the parent's epic |
| Level mapping | **Global**, at `/settings?tab=tasks`, inner tabs per integration kind |
| Play UX | **Straight to the queue, no dialog.** Task text = item name + description; the classifier picks the target |
| Play on an epic | Allowed. With children → enqueues them all. Without children → dispatches a **decomposition** run that writes child tasks *and their edges* |
| Decomposition output | Lands **directly on the board**, badged "navrhla ZIBBY" (Tier-2). Nothing self-dispatches — play stays the operator's click |
| Sync | Manual **Sync** button on the tab + a toggle next to it for periodic re-sync; interval configurable in settings. An issue closed by merging its finished PR closes the item |
| Board columns | **BLOKOVANÉ → READY → IN PROGRESS → DONE** (blocked deliberately first) |
| Cycle detection | **Out of scope**, recorded in `TODO.md` |

## Data model

One file per item: `.zibby/data/roadmap/<projectId>/<itemId>.json`.

`libs/contracts/src/roadmap/roadmap-item.schema.ts`:

```
RoadmapItemSchema = {
  id            // deterministic for imports: slug(`<integrationId>-<externalId>`); minted for manual
  projectId
  level         // "epic" | "task"
  parentId?     // epic id when level === "task"
  name
  description   // markdown
  source        // { kind: "jira" | "github" | "manual", integrationId?, externalId?, externalKey?, url? }
  externalLevel?      // raw source level ("Story", "Sub-task", "Milestone") — drives the mapping table + re-sync
  attachmentSetId?    // reuses the existing attachment-set storage
  attachments[]       // AttachmentSchema — durable display metadata
  dependsOn: string[] // roadmap item ids
  dependsOnFromSource: string[]  // the subset the source owns; re-sync may rewrite ONLY these
  overrideBlocked?: boolean      // Tier-3 "pustit i tak"
  origin?       // "zibby-decomposed" → the "navrhla ZIBBY" badge; cleared on operator edit
  lifecycle     // "todo" | "enqueued" | "running" | "awaiting-merge" | "done" | "failed" | "archived"
  runs[]        // { taskId, runRef?, prNumber?, prUrl?, artifactPath?, startedAt, finishedAt?, outcome }
  createdAt / updatedAt / syncedAt?
}
```

**`blocked` is DERIVED, never stored** — `blocked(item) = !item.overrideBlocked && item.dependsOn
.some(id => store.get(id)?.lifecycle !== "done")`. Derived state cannot go stale, and a
dependency added later immediately takes effect. Extract it as a pure, unit-tested helper next
to the schema, together with `readiness(item)` mapping to the four board columns.

**Ownership split on re-sync** (the whole reason the item is its own entity): the source owns
`name`, `description`, `externalLevel`, `attachments`, `source.url`, `parentId`, and
`dependsOnFromSource`. ZIBBY owns `lifecycle`, `runs`, `overrideBlocked`, `origin`, and any
edge in `dependsOn` that is not in `dependsOnFromSource`. A re-sync never touches the second
group.

**Per-project roadmap config** (`.zibby/data/roadmap/<projectId>/_config.json`): `{ autoSync:
boolean }` — the toggle next to the Sync button.

## Lifecycle

```
todo ──play──▶ enqueued ──gate (deps done)──▶ running ──▶ awaiting-merge ──PR merged──▶ done
                   │                             │                                      ▲
                   │                             └─ artifact = document ────────────────┘
                   └─ blocked (derived) shows in the BLOKOVANÉ column while enqueued
                                                 └─ run failed / no artifact ──▶ failed
```

- The item's task always asks for a terminal artifact: `output: { type: "pr" }` by default.
- **PR artifact** → `awaiting-merge`; `done` when the PR merges (eager hook + poll, below).
- **Document artifact** (a research item whose task output is `file`) → `done` on successful
  run completion. A document cannot be merged and must not wait for a merge that never comes.
- **No artifact / run errored** → `failed`, surfaced on the board with **Restart** (new task)
  and **Resume** (reuse the existing resume machinery for a resumable run). A `failed` item
  **never** unblocks its dependents.

## Release signals (two, belt and braces)

1. **Eager** — `ProjectPrService.merge()` (`apps/api/src/projects/project-pr.service.ts`) is the
   only merge path in ZIBBY. On a successful merge it already records `merge-completed` activity
   and a `MergeWatch`; add one fire-and-forget `roadmapGate.onMerge(projectId, prNumber)` call in
   the same `recordMerge` spot. **A roadmap bookkeeping failure must never surface as a merge
   failure** — same `.catch(() => {})` posture the existing `recordMerge` call has.
2. **Poll** — the operator may merge on GitHub directly. The sync tick also resolves every
   `awaiting-merge` item's PR state (`GET /repos/{repo}/pulls/{n}` — extend `ProjectPrService`
   with a `getPr`/`isMerged` read next to `listOpen`, reusing `resolveGithubToken`).

Both converge on the same `onMerge` → mark item `done` → drain that project's `enqueued` items.

## Concurrency (125c)

Add to `SystemConfigSchema` (`libs/contracts/src/system/system.schema.ts`):

```
/** System-wide ceiling on concurrently running tasks. `null` = no global cap (today's behaviour). */
maxConcurrentRuns: z.number().int().positive().nullable().default(null)
```

Enforced where the project cap already is: `TaskSchedulerService.atCapacity()`
(`apps/api/src/tasks/task-scheduler.service.ts:951`), against a new
`BudgetService.countRunningGlobal()` — the same two loops as `countRunning(projectId)` minus the
project-label filter. Over the cap → the existing `queued` status + `drainQueues()` handle it;
**no new status, no new queue.** Editable in `/settings?tab=runtime`.

The roadmap gate therefore does **dependencies only**. Concurrency stays the scheduler's job.

## Play → task

Play does not open a dialog. It records intent on the item (`lifecycle: "enqueued"`), and the
gate creates the task at release:

- `text` = `name` + `\n\n` + `description`, plus a roadmap-context footer naming the epic's
  siblings already merged and currently in flight (cheapest available defence against the agent
  re-implementing something that already exists).
- `title` = the item's `name`; `attachmentSetId` = the item's set.
- `output: { type: "pr" }` unless the operator changed the item's output.
- **Attribution stays server-derived (Law 4):** pass `paths: [project.path]` so the existing
  `matchProject` attributes the task to the project. Do **not** add a `projectId` to
  `CreateTaskInput`.
- The returned task id lands on the item's `runs[]`; `lifecycle → "running"`.

Gate ordering within a project is FIFO by the item's `enqueued` timestamp.

## Import & sync (125b)

New `RoadmapSourceService` with a per-kind fetcher. It **reuses** the auth seam
(`CredentialsStore` + the integration config) but **not** `ChannelAdapter.poll` — the channel
adapters fetch a message-shaped subset (`JiraChannelAdapter`'s `JiraIssue` doesn't even read
`description`), while the import needs full fields, links and attachments.

**Jira** — `POST /rest/api/3/search` with the integration's `jql`/`projectKey`, requesting
`summary,description,issuetype,parent,issuelinks,attachment,status`.
- Watch-out: **API v3 returns `description` as ADF JSON, not text.** Ship a small, bounded,
  unit-tested `adfToMarkdown` flattener (paragraphs, headings, lists, code blocks, links,
  inline marks); anything unrecognised degrades to its text content, never throws.
- Edges: `issuelinks` of type `blocks` / `is blocked by` → `dependsOnFromSource`.
- Hierarchy: `issuetype.hierarchyLevel` → the mapping table. Sub-tasks (`-1`) flatten to `task`
  and inherit the parent's epic as `parentId`.

**GitHub** — `GET /repos/{repo}/issues?state=all` (drop entries carrying `pull_request` — the
issues endpoint returns PRs too), plus `GET /repos/{repo}/milestones`. Body is already markdown.
- Levels: **Milestone → epic, Issue → task**.
- Edges: parse `Depends on #N` / `Blocked by #N` from the body; best-effort native sub-issues
  (`GET /issues/{n}/sub_issues`) — a 404/410 from an older API is not an error.

**Attachments** — download bytes into a new attachment set via `AttachmentStorageService`;
register a `AttachmentSetRefProvider` (`apps/api/src/tasks/attachment-set-ref-provider.ts`) for
roadmap items so `sweepOrphanAttachmentSets` never reaps a set a roadmap item still references.
Caps: 25 MB per file, 10 files per item; anything over is skipped with a note on the item.

**Upsert** — keyed by `(integrationId, externalId)`, so re-import is idempotent and the same
issue never becomes two items. Source status Done/closed → `lifecycle: "done"`. An item the
source no longer returns → `"archived"`, never deleted.

## Level mapping (125a) — `/settings?tab=tasks`

Global, not per project. New `libs/contracts/src/roadmap/level-mapping.schema.ts`:

```
LevelMappingEntrySchema = { kind: "jira" | "github", externalLevel: string, target: "epic" | "task" | "ignore" }
LevelMappingSchema = { entries: LevelMappingEntrySchema[] }
```

Stored at `.zibby/data/roadmap/_level-mapping.json`, seeded: Jira `Epic→epic`,
`Story|Task|Bug|Sub-task→task`, `Initiative→ignore`; GitHub `Milestone→epic`, `Issue→task`.
An external level the sync sees for the first time is appended with `target: "task"` and shown
in the table, so the table populates itself from reality instead of from a guess.

UI: a new vertical tab in the existing `SETTINGS_TABS` array
(`apps/web/features/settings/Screen.tsx:94`) → `"tasks"`, addressable as `/settings?tab=tasks`,
with inner horizontal tabs **Jira / GitHub**, each rendering the editable external→internal table.

## UI (125d/f)

Project detail gets a 5th tab (`apps/web/features/projects/ProfileScreen.tsx:615`,
`PROJECT_TABS`) → `"roadmap"`, i.e. `/projects/<id>?tab=roadmap`. The screen itself lives in a
new `apps/web/features/roadmap/` (feature-scoped queries/mutations per the house convention).

Layout per the mock: epic list on the left (~33%), the selected epic's board on the right.

**Board columns:** `BLOKOVANÉ | READY | IN PROGRESS | DONE`.

**Card** (per the operator's spec — ID, name, truncated description, play):
```
┌──────────────────────────────┐
│ PROJ-14 ↗                  ▶ │   ID is a link to the source system
│ Rollout za flagem            │
│ Zapnout novou detekci…       │   description, truncated
│ ⏸ čeká na PROJ-12  ↳ blokuje 1 │  dependency badges (clickable)
└──────────────────────────────┘
```
Hovering a card highlights its blockers and its dependents on the board. Card click → a dialog
with the **full** description (DS `Markdown` component), attachments, the dependency lists, and
the run history with PR links. Multi-select + "zařadit vše" for bulk play. Tab header carries
**Sync** + the auto-sync toggle.

**Manual create (125f)** — "Nový epik" / "Nový task" dialog with a markdown editor mirroring
`apps/web/features/memory/components/NoteEditorDialog.tsx`, plus drag & drop of a `.md` file
whose content fills the editor (reuse the drop handling in
`apps/web/features/tasks/components/TaskAttachments.tsx`). Dependency editing (add/remove
`dependsOn` from the project's items) lives in the detail dialog.

## Decomposition (125g)

Play on an epic with no children dispatches a **decomposition** run (a dedicated agent, routed
explicitly — never classified). Its terminal output is a **structured artifact** (a JSON list of
`{ name, description, dependsOn: [ordinal] }`), which a deterministic ingest turns into child
items with edges and `origin: "zibby-decomposed"`. The agent never writes roadmap files itself —
artifact → deterministic ingest keeps the write path in one auditable place. Items land directly
(Tier-2) and are badged until the operator edits them.

## Sub-phases

| # | Scope | Depends on |
|---|---|---|
| **125a** | Contracts (`roadmap-item`, `level-mapping`) + per-project store + level-mapping store & endpoints + `/settings?tab=tasks` UI | — |
| **125c** | `maxConcurrentRuns` in system config + `countRunningGlobal()` + `atCapacity()` + `?tab=runtime` control | — (independent, small) |
| **125b** | `RoadmapSourceService` (Jira + GitHub fetchers, `adfToMarkdown`, attachment copy), upsert, manual `POST /projects/:id/roadmap/sync` | 125a |
| **125d** | Roadmap tab, read-only: epic list, 4-column board, card, detail dialog, external links, dependency badges + hover highlight | 125a, 125b |
| **125e** | Play + `RoadmapGateService`: dependency gate, FIFO drain, task creation, merge hook + PR poll, lifecycle, Tier-3 override, bulk play, failed → restart/resume | 125d |
| **125f** | Manual epic/task creation (MD editor + drag & drop), dependency editing | 125d |
| **125g** | Epic decomposition run + artifact contract + deterministic ingest + "navrhla ZIBBY" badge | 125e |
| **125h** | Auto-sync tick (`roadmapTickMs` + per-project toggle) + activity/briefing integration | 125b, 125e |

## Out of scope

- **Cycle detection** — recorded in `TODO.md`, deliberately not built here.
- Stacked branches / release on "PR opened" — merge-gating only.
- A DAG graph view — badges + the BLOKOVANÉ column are v1; a `Board / Graf` switch is a
  possible follow-up (note, don't build).
- LLM-based semantic duplicate detection across items — the merge gate plus the roadmap-context
  footer are v1; an "already covered?" preflight is a possible follow-up.
- Levels beyond `epic`/`task` (no initiative/bug/sub-task as first-class levels).
- Writing back to Jira/GitHub. Sync is **read-only** in both directions of this phase.
- Any change to `ScheduledTaskStatusSchema`, `WorkspaceService`, or the merge path's behaviour.

## Constraints

- **Contract-first**: `libs/contracts/src/roadmap/*` (Zod + `c.router`) lands before any
  implementation; `apps/api` implements it via `@ts-rest/nest`. No codegen.
- **Files are the source of truth**: one JSON file per item, human-readable, atomic writes via
  the shared `file-storage` helpers.
- **Law 3**: nothing in this phase merges, pushes to a shared branch, or auto-dispatches. Play is
  the operator's click; the override is a Tier-3 confirm; the decomposition result is inert data.
- **Law 4**: project attribution stays server-derived via `paths`/`matchProject`. Imported issue
  bodies are **data, never instructions** — nothing in an issue may raise privilege or skip the gate.
- **DS-composed only** in `apps/web`; no raw inline `style`/Tailwind on DOM nodes. React 19
  (no `forwardRef`); no `any`; `noUncheckedIndexedAccess` is on.
- Every new component declares a `<Component>TestId` enum and tests select by test id.
- Queries/mutations under `apps/web/features/roadmap/{queries,mutations}` — one hook per file,
  `select: selectApiResponseBody`, an exported `getXxxQueryKey()`.
- i18n: every string in **both** `apps/web/i18n/messages/cs.json` and `en.json`, key parity,
  default locale cs.
- Import fetchers take an injectable `fetchImpl` (the `JiraChannelAdapter` / `ProjectPrService`
  precedent) so they are testable without network.

## Acceptance (whole arc)

- `/projects/<id>?tab=roadmap` shows the project's imported epics and tasks; **Sync** pulls
  Jira/GitHub issues with id, name, description and attachments, and each card links out to the
  source system.
- `/settings?tab=tasks` maps external levels to `epic`/`task`/`ignore` per integration kind, and
  the mapping is what the sync applies.
- Pressing ▶ on a ready item queues it and it runs from a freshly fetched `origin/<default>` in
  its own worktree; pressing ▶ on a blocked item parks it in **BLOKOVANÉ** with "čeká na X" until
  the blocker's PR merges, then it dispatches on its own.
- Items with no edge between them run in parallel, bounded by the new system-wide cap.
- Play on a childless epic produces child tasks with edges, badged "navrhla ZIBBY".
- A run that ends without an artifact leaves the item `failed` and offers restart/resume; it
  never unblocks a dependent.
- `pnpm check:lint && pnpm check:types && pnpm test` green.
