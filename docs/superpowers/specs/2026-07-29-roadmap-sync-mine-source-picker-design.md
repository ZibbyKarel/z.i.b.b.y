# Roadmap sync — "jen moje issues" + source-picker split button

**Date:** 2026-07-29
**Status:** Approved, implementing via Sonnet subagents (orchestrator reviews each phase)

## Goal

Two operator-facing changes to the project roadmap's Jira/GitHub sync, plus one
supporting contract change:

- **A. Default scope = only my issues** — hard-wired (no toggle). Sync pulls only
  issues assigned to the operator.
- **B. Source-picker split button** — the "Synchronizovat" button becomes a
  `DropDownButton`: primary action syncs all configured sources; the chevron menu
  offers each source (Jira, GitHub) individually.
- **C. GitHub `username` required** — needed to scope GitHub to "me".

Laws preserved: sync stays read-only toward Jira/GitHub (Law 3, nothing writes
back), issue bodies remain untrusted data (Law 4).

---

## A. "Mine" scoping (backend — `apps/api/src/roadmap/roadmap-source.service.ts`)

### Jira (`fetchAllJiraIssues`)

- Custom `config.jql` set → **respected verbatim** (custom JQL wins; the operator
  already declared the set they want).
- No custom JQL → build a `currentUser()`-scoped clause:
  - with `projectKey`: `project = <key> AND assignee = currentUser() ORDER BY created ASC`
  - without `projectKey`: `assignee = currentUser() ORDER BY created ASC`
  - (replaces today's `project = <key>` / `order by created ASC` fallback)
- **Epic-grouping preservation:** `assignee = currentUser()` returns my
  tasks/stories but not their parent epics (epics are rarely assigned to me), so
  `resolveEpicParent` would find no parent in the batch → tasks render unparented.
  After the primary fetch, collect the referenced `fields.parent.key` values and
  do ONE supplementary fetch `key in (<parentKeys>)` to bring those ancestor epics
  into the batch, then run the existing level/parent resolution over the union.
  Skipped entirely when a custom JQL is used (operator controls the set). The
  supplementary epics are still only imported if their level resolves to `epic`.

### GitHub (`syncGithub` / issue fetch)

- `username` is now guaranteed present (schema change C). Replace the
  `GET /repos/<repo>/issues?state=all` listing with the **Search API**:
  `GET /search/issues?q=repo:<repo> assignee:<username>` across ALL states
  (open+closed — roadmap tracks done items), paginated via `page`. Response is
  `{ items: GitHubIssue[] }`; items ship in the same shape as the issues endpoint
  (distinguish PRs via `pull_request`, same as today). Reuse the rate-limit
  handling (429/403 → throw).
- **Milestones (epics):** import only milestones that parent at least one imported
  (mine) issue. Fetch my issues first, collect referenced `milestone.number`s,
  then fetch milestones and upsert only the referenced ones; the rest count as
  `summary.skipped`. Keeps the board scoped to my work. `archiveMissing` still
  cleans up milestones that drop out of scope.

---

## B. Source-picker split button

### Contract (`libs/contracts/src/roadmap/`)

- New `SyncRoadmapItemsSchema = z.object({ source: z.enum(["jira", "github"]).optional() }).strict()`.
- `roadmap.contract.ts` `syncRoadmapItems.body`: `EmptyBodySchema` → `SyncRoadmapItemsSchema`.
  Absent `source` = sync all sources.

### Service (`RoadmapSourceService.sync`)

- Signature `sync(projectId, source?: "jira" | "github")`.
  - `undefined` → both (today's behavior).
  - `"jira"` → only Jira; `"github"` → only GitHub.
- Per-source try/catch + independent-failure notes stay exactly as today.

### Controller (`roadmap.controller.ts`)

- `syncRoadmapItems` passes `body.source` through to `this.roadmapSource.sync(projectId, body.source)`.

### Web (`apps/web/features/roadmap/components/RoadmapPanel.tsx`)

- `RoadmapSyncHeader`: replace the `Button` with DS `DropDownButton`
  (`libs/design-system` — already exists, split button primary + chevron menu).
  - `label` = `t("sync.button")` → "Synchronizovat vše"; primary `onClick` → sync
    all (no `source`).
  - `menuItems` = **both** Jira + GitHub always (decision: syncing an unconfigured
    source is already a harmless all-zero no-op; no extra integrations query). Each
    item fires the same mutation with its `source`.
  - `loading`/`disabled` = `syncMutation.isPending`.
  - Keep `RoadmapPanelTestId.Sync` on the primary segment (test-id continuity).
- Mutation `useSyncRoadmapItemsMutation`: `.mutate({ params, body: { source? } })`.
- Toast summary unchanged.
- i18n (`cs.json` + `en.json`): `sync.button` copy → "Synchronizovat vše" / "Sync all";
  new `sync.source.jira` = "Jira", `sync.source.github` = "GitHub" (labels), or a
  `sync.sourceItem` template.

---

## C. GitHub `username` required

- `libs/contracts/src/integrations/integration.schema.ts` `GitHubConfigSchema.username`:
  drop `.optional()` → required `z.string().min(1)`. Update the docblock.
- `apps/web/features/integrations/components/IntegrationFormFields.tsx`:
  - `configReady()` github branch also requires `githubUsername.trim().length > 0`.
  - Built config always includes `username` (drop the conditional spread).
- The channel adapter's `username ? searchMineOrMentioned : listAll` branch: leave
  `listAll` as a defensive fallback (harmless; dead for new integrations).

### Migration (operator data — needs the operator's real GitHub handle)

Two existing stored GitHub integrations:

- `.zibby/data/integrations/shoptet-github-cms4.json` — **no `username`** → will
  fail schema-parse on load once required. Must backfill.
- `.zibby/data/integrations/shoptet-partner-cli-github.json` — `username` is
  `zibbykarel@gmail.com` (an **email**, not a GitHub handle) → the `assignee:`
  filter won't match. Must correct to the real handle.

Both require the operator's GitHub login. Backfill is a data-only step done last;
if the handle is unavailable, flag `cms4` as needing manual attention rather than
shipping a change that 500s on its load.

---

## Testing

- `roadmap-source.service` unit: Jira mine-JQL construction (with/without
  `projectKey`, custom-jql precedence, parent-epic supplementary fetch), GitHub
  Search-API + milestone-parent filtering, source-selective `sync`.
- Contract/controller: `source` param plumbing.
- `IntegrationFormFields` test: github requires username (`configReady` false when
  blank).
- `RoadmapPanel`/`RoadmapSyncHeader` test: `DropDownButton` renders; primary +
  each per-source menu item call the mutation with the right `source`.

## Dependency order for implementation

1. **Contracts** — `SyncRoadmapItemsSchema`, `syncRoadmapItems.body`,
   `GitHubConfigSchema.username` required. (Source of truth; blocks the rest.)
2. **API** (parallel with web) — `RoadmapSourceService` mine-scoping + `source`
   param, controller plumbing, service tests.
3. **Web** (parallel with API) — `DropDownButton` swap + mutation body,
   `IntegrationFormFields` username-required, i18n, component tests.
4. **Validation + data backfill** — typecheck/lint/scoped tests; backfill the two
   GitHub integration JSON files with the operator's handle.
