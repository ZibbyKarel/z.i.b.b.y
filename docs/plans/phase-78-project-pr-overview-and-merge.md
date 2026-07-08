# Phase 78 — Project open-PR overview + explicit operator merge

> Completes TODO item 4 point **3**: _"Přehled a merge nesloučených PR na projektu — v
> detailu/na kartě projektu zobrazit počet otevřených PR. Merge musí být vždy explicitní akce
> operátora v UI (tlačítko), nikdy automatický krok ZIBBY."_ Honors CLAUDE.md Tier-3 "surface and
> wait" + Law "Never: Auto-merge".

## Data source

A project links to GitHub via an **integration** (`kind: "github"`, `repo: "owner/name"`, PAT in
the gitignored credentials store). The CI monitor (`apps/api/src/monitors/github-ci.monitor.ts`)
is the reference for authenticated GitHub REST calls (`Bearer <token>`, rate-limit handling).
Reuse that exact shape. Resolve the project's github integration the same way the app already
finds a project's integrations (grep `IntegrationsStorageService` / `ResolvedProjectService` for
"projectId" filtering; a project's effective integrations include the company's — reuse the
resolved set). If the project has no github integration or no token, the PR list is **empty** and
merge is unavailable (never an error page — an empty overview).

## 1 — Contract

`libs/contracts/src/projects/`:
- `ProjectPrSchema = z.object({ number: z.number().int(), title: z.string(), url: z.string(), author: z.string().optional(), branch: z.string().optional(), draft: z.boolean(), createdAt: IsoDateTimeSchema.optional() })`.
- `getProjectPrs: GET /projects/:id/prs → 200: z.array(ProjectPrSchema), 404: ErrorSchema`
  (200 with `[]` when no github link — 404 only for an unknown project id).
- `mergeProjectPr: POST /projects/:id/prs/:number/merge` — body optional
  `{ method: z.enum(["merge","squash","rebase"]).optional() }` → `200: z.object({ merged: z.boolean(), url: z.string().optional() })`, `404`, `409` (not mergeable / already merged), `422` (no github link/token). `number` is a path param (`z.coerce.number()`).
- Export from barrel; round-trip + route tests.

## 2 — API: `ProjectPrService` (+ controller)

`apps/api/src/projects/project-pr.service.ts` (+ test). Inject the integration storage +
credentials store (and the resolver if that's how effective integrations are fetched):
- `async listOpen(projectId): Promise<ProjectPr[]>` — resolve the github integration+token; if
  none → `[]`. `GET https://api.github.com/repos/{repo}/pulls?state=open&per_page=50` with the
  Bearer token; map to `ProjectPrSchema` (`number`, `title`, `html_url`→`url`, `user.login`→
  author, `head.ref`→branch, `draft`, `created_at`). Rate-limit/`!ok` → throw (controller maps
  to a soft empty or 502 — prefer returning `[]` + logging on non-fatal, but a hard error surfaces
  as 502). Inject `fetchImpl = fetch` for tests (mirror the monitor).
- `async merge(projectId, number, method): Promise<{ merged, url? }>` — resolve integration+token
  (none → throw `NoGithubLinkError` → 422). `PUT https://api.github.com/repos/{repo}/pulls/{number}/merge`
  with `{ merge_method }`. 405/409 (not mergeable) → throw `PrNotMergeableError` → 409. Success →
  `{ merged: true, url }`. **This method is the ONLY merge path and is only ever reached from the
  operator-triggered controller route — it is never called from any scheduler/monitor/runner.**
  Add a code comment stating that (Law: never auto-merge).
- Controller handlers `getProjectPrs` / `mergeProjectPr` in `projects.controller.ts`; map the
  typed errors. Wire the service into `ProjectsModule` (imports IntegrationsModule/credentials —
  watch for the known forwardRef cycle the resolved-project seam already handles; reuse it).

## 3 — Web

Queries/mutations (`apps/web/features/projects/`):
- `queries/useProjectPrsQuery.ts` — `getProjectPrs`, key `["project-prs", id]`,
  `select: selectApiResponseBody`, a slow `refetchInterval` (60s — PRs are polled STATE, like CI).
  Export the key helper.
- `mutations/useMergeProjectPrMutation.ts` — `mergeProjectPr`; `onSuccess` invalidates
  `["project-prs", id]`. Return the mutation directly.

UI:
- **Project detail** (`ProfileScreen.tsx`): a new `ProjectPullRequestsPanel` (new component +
  test) listing open PRs — each row: number + title (link to `url`, opens the PR), author/branch,
  and a **"Sloučit"** button that opens a `ConfirmDialog` (reuse `ConfirmDeleteDialog`'s pattern
  or a generic confirm) → `useMergeProjectPrMutation`. Merge is Tier-3: the confirm dialog copy
  must make it explicit ("Sloučí PR #N do hlavní větve. Tuto akci nelze snadno vrátit."). Show
  `.isPending`; on success the row drops (invalidation). Empty state when no PRs / no github link.
- **Project card** (`ProjectCard.tsx`): show the **open-PR count** as a small `Tag`/`Stat` when
  > 0. To avoid N requests on the list, DO NOT add a per-card query — instead thread the count
  from a single source: add `openPrCount` to the card only where the data already exists, OR skip
  the card badge and keep the overview on the detail panel. **Decision**: keep the count badge on
  the detail panel's header (cheap, one query) and add a card badge ONLY if a batch/count source
  already exists; otherwise document skipping it. (A batch PR-count endpoint is out of scope.)
- i18n `projects.prs.{title, empty, mergeButton, mergeConfirmTitle, mergeConfirmBody, noGithub, open, author, count}`
  in cs (primary) + en.

## Tests

- `project-pr.service`: listOpen maps GitHub JSON → ProjectPr[]; no integration → `[]`; merge
  success; merge 409 → PrNotMergeableError; no token → 422 (NoGithubLinkError). Mock `fetchImpl`.
- Controller/e2e for both routes (mirror existing projects controller tests).
- `ProjectPullRequestsPanel`: renders PR rows; merge button → confirm → mutation called with
  `{ params: { id, number } }`; empty state.
- Contract round-trip/route tests.

## Verification (paste real output; plain npx — no rtk)

- `npx tsc -p libs/contracts/tsconfig.json --noEmit` / `apps/api` / `apps/web` — clean (only the
  2 pre-existing machine.service errors on api).
- `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/projects apps/web/features/projects` — green modulo
  documented pre-existing reds. Any NEW red is yours.

## Constraints

- Contract-first. No auto-merge anywhere: `merge()` is reachable ONLY from the operator route;
  add the guard comment; the confirm dialog is mandatory. DS-composed web; React 19; no `any`.
  Reuse the CI monitor's GitHub-REST posture (Bearer, rate-limit handling, injectable fetch).
