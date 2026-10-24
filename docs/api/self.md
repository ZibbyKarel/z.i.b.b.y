# Self (Phase 79 — is ZIBBY up to date?)

The **self** module answers "is the ZIBBY install itself up to date," backing the
top-bar freshness indicator. Unlike every other resource, this is about the ZIBBY
**install repo** the operator checked out (`installRoot()`, the parent of `.zibby`)
— not a delivered project.

## Pieces

| Piece      | File                                       | Role                                                                                                                                                                |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/self/self.schema.ts`   | `SelfPrSchema`, `SelfStatusSchema` (incl. `projectId`, `projectUsesInstallTree`), `SelfUpdateResultSchema`, `EnsureSelfProjectResultSchema`                         |
| Contract   | `libs/contracts/src/self/self.contract.ts` | `selfContract` — `getSelfStatus` (`GET /api/self/status`), `updateSelf` (`POST /api/self/update`, 200/409), `ensureSelfProject` (`POST /api/self/project`, 200/409) |
| Service    | `apps/api/src/self/self.service.ts`        | `SelfService` — git/`gh` reads via bounded `execFile`, all soft-fail                                                                                                |
| Helpers    | `apps/api/src/self/self-remote.ts`         | `normalizeRemote` (match key `host/owner/repo`), `redactRemote` (strip credentials)                                                                                 |
| Controller | `apps/api/src/self/self.controller.ts`     | implements `selfContract`; maps the two refusal errors to 409                                                                                                       |
| Module     | `apps/api/src/self/self.module.ts`         | imports `ProjectsModule` + `MachineConfigModule` (for `ensureSelfProject` only)                                                                                     |

## `getSelfStatus` (polled STATE, like `health`/`limits`)

Reads local git state in `installRoot()`:

- `git rev-parse --git-dir` guard — a non-git install returns a benign all-zero
  payload (`ghAvailable: false`, empty `prs`) rather than an error.
- `git fetch origin` (bounded ~60s) — offline/unreachable degrades gracefully to
  the last-known local refs; `fetchedAt` is only set when the fetch succeeds.
- `defaultBranch` via `git symbolic-ref --short refs/remotes/origin/HEAD`
  (fallback `"main"`); `currentBranch` via `git branch --show-current`.
- `behind`/`ahead` via `git rev-list --count` against `origin/<default>`;
  `upToDate = behind === 0`; `dirty` via `git status --porcelain`, with paths
  under the data dir (`.zibby/data/` by default, derived from `resolveDataRoot()`
  relative to `installRoot()`) filtered out — ZIBBY's own runtime writes never
  block Upgrade. `git pull --ff-only` still refuses to overwrite a modified file.
- `projectId` / `projectUsesInstallTree` — see `ensureSelfProject` below; the
  same matcher recognises the self project (needs `git remote get-url origin`).
- Open PRs via `gh pr list --state open --json number,title,url` when the `gh`
  CLI is available (`gh --version` succeeds) — any `gh` failure (missing, not
  authenticated, API error) soft-fails to `ghAvailable: false, prs: []`, never
  throws.

Every sub-step is defensive — the endpoint never 500s on a normal machine.

## `updateSelf` — the one sanctioned self-update

`git pull --ff-only origin <default>` in `installRoot()`. Operator-triggered
only (the "Aktualizovat" button), never called autonomously, and NEVER falls
back to `--force`/`reset --hard`:

- Dirty tree → 409 (`SelfDirtyError`) — never touches uncommitted work.
- Already up to date (`behind === 0`) → 200, `{ updated: false, behind: 0 }`.
- Non-fast-forward / any pull failure → 409 (`SelfUpdateConflictError`) with a
  readable message.
- Successful pull → 200, `{ updated: true, behind: 0 }`.

## `ensureSelfProject` — register ZIBBY as its own project

`POST /api/self/project` (empty body) registers the install as project `zibby`
so ZIBBY edits itself in a **separate clone** (`<cloneRoot>/zibby`) and lands
changes as **draft PRs** (Builder != Subject, see `docs/ops/self-development.md`).

**Recognising an existing self project.** Before creating anything, every
project in the registry is matched against the install:

- `normalizeRemote(project.gitRemote) === normalizeRemote(origin)` —
  `apps/api/src/self/self-remote.ts` maps `git@host:o/r(.git)`,
  `ssh://git@host/o/r(.git)` and `https://[userinfo@]host/o/r(.git)` to
  `host/o/r` (host lowercased, `.git` and trailing `/` stripped); or
- `realpath(project.path) === realpath(installRoot())` (falls back to
  `path.resolve` when the path doesn't exist).

A match (a `zibby`-id project wins a tie) returns 200
`{ projectId: <match.id>, created: false }` and writes nothing — so a
hand-registered project such as `zibby-self` is reused, never duplicated or
modified. `getSelfStatus` uses the same matcher for its optional `projectId`,
plus `projectUsesInstallTree: boolean` — `true` when the matched project's
`path` resolves to the install root or inside it (runs would then work in the
builder's own tree; the Settings panel warns and asks the operator to change the
project's path — no runtime guard, that stays an operator decision).

**Creating it.** Without a match the new project is
`{ id: "zibby", name: "ZIBBY", desc, gitRemote: <origin>, prOpenMode: "draft" }`
— never a `path`, and no git state is mutated. Origin credentials are stripped
first (`redactRemote`: `https://` drops all userinfo, `ssh://` drops the
password, scp-like has none), so a token never lands in the git-tracked registry
or in an error message.

- 409 (`SelfProjectConflictError`, `{ message }`) when: origin missing or not a
  valid remote; a `zibby` project exists with a different remote (never
  overwritten); `<cloneRoot>/zibby` realpath-resolves to the install root itself.
- Create race: if `projects.create` throws `ProjectConflictError`, the matcher
  re-runs — a match returns `created: false`, anything else is the 409 above.
  `apps/api/src/self/self.controller.e2e.test.ts` pins every refusal → 409.

## Frontend

`apps/web/features/self/` — `useSelfStatusQuery` polls `getSelfStatus` (~2m,
`select: selectApiResponseBody`). `useSelfUpdateMutation` (`updateSelf`) and
`useEnsureSelfProjectMutation` (`ensureSelfProject`) both invalidate the status
key in `onSettled` (any outcome, so a refusal refreshes `dirty`/`projectId` at
once) and set `meta: { inlineError: true }`: ts-rest throws on any non-2xx, so a
409 lands in `onError`, the call site shows the body's `message` inline
(`updateErrorMessage`), and `providers.tsx`'s `MutationCache.onError` skips the
generic toast for such mutations (`isInlineErrorMutation`, `toastBus.ts`).

`apps/web/components/layout/SelfUpgrade/SelfUpgrade.tsx` — the header
"Upgrade ↓N" button next to the limits (hidden for a non-git install, disabled on
a dirty tree). Its accessible name starts with the visible word ("Upgrade —
update ZIBBY (branch …, N behind origin)", WCAG 2.5.3). The result ("Updated" /
"Up to date", 5 s) and any 409 message render beside it in an always-mounted
`role="status"` / `aria-live="polite"` region.

`apps/web/features/settings/components/SelfDevelopmentPanel.tsx` — Settings
panel: branch, ↓/↑ vs origin, dirty, open PRs (DS `TextLink`,
`target="_blank" rel="noreferrer"`), and the "Edit ZIBBY as a project" /
"Open ZIBBY project" action. When `projectUsesInstallTree` is true it shows a
warning that the self project points at the running install and the runbook
(Builder ≠ Subject) wants a separate clone. The inline error sits in a polite
live region too.

<!-- Last reviewed 2026-09-24 (ZibbyCorp rename): module code changed only by the subsystem → department rename; this doc has no subsystem references. -->
