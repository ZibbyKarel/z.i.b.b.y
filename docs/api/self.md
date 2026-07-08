# Self (Phase 79 — is ZIBBY up to date?)

The **self** module answers "is the ZIBBY install itself up to date," backing the
top-bar freshness indicator. Unlike every other resource, this is about the ZIBBY
**install repo** the operator checked out (`installRoot()`, the parent of `.zibby`)
— not a delivered project.

## Pieces

| Piece      | File                                       | Role                                                                 |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Contract   | `libs/contracts/src/self/self.schema.ts`   | `SelfPrSchema`, `SelfStatusSchema`, `SelfUpdateResultSchema`         |
| Contract   | `libs/contracts/src/self/self.contract.ts` | `selfContract` — `getSelfStatus` (`GET /api/self/status`), `updateSelf` (`POST /api/self/update`, 200/409) |
| Service    | `apps/api/src/self/self.service.ts`        | `SelfService` — git/`gh` reads via bounded `execFile`, all soft-fail |
| Controller | `apps/api/src/self/self.controller.ts`     | implements `selfContract`; maps the two refusal errors to 409        |
| Module     | `apps/api/src/self/self.module.ts`         | standalone — no dependency on any other module                       |

## `getSelfStatus` (polled STATE, like `health`/`limits`)

Reads local git state in `installRoot()`:

- `git rev-parse --git-dir` guard — a non-git install returns a benign all-zero
  payload (`ghAvailable: false`, empty `prs`) rather than an error.
- `git fetch origin` (bounded ~60s) — offline/unreachable degrades gracefully to
  the last-known local refs; `fetchedAt` is only set when the fetch succeeds.
- `defaultBranch` via `git symbolic-ref --short refs/remotes/origin/HEAD`
  (fallback `"main"`); `currentBranch` via `git branch --show-current`.
- `behind`/`ahead` via `git rev-list --count` against `origin/<default>`;
  `upToDate = behind === 0`; `dirty` via `git status --porcelain`.
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

## Frontend

`apps/web/features/self/` — `useSelfStatusQuery` polls `getSelfStatus` (~2m,
`select: selectApiResponseBody`); `useSelfUpdateMutation` wraps `updateSelf` via
`makeInvalidatingMutation`, invalidating the status key on any response.

`apps/web/components/layout/TopBar/SelfFreshness.tsx` — mounted directly in
`TopBar.tsx` (like `LanguageSwitcher`): a calm ok `StatusDot` when up to date; a
warn dot + behind-count + "Aktualizovat" button otherwise. Hovering/focusing the
control reveals a popover listing the open PRs as external links
(`target="_blank" rel="noreferrer"`) straight to GitHub. A 409 from the update
mutation (ts-rest routes any declared non-2xx status to `onError`, not
`onSuccess`) surfaces its message as an inline note next to the button.
