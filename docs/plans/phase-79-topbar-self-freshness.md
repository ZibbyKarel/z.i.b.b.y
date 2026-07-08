# Phase 79 — Top-bar "is ZIBBY up to date?" indicator + open-PR hover links

> Completes TODO item 5: _"V top panelu chci vidět že je Zibby aktuální. Pokud je main větev
> pozadu chci vidět o kolik commitů je pozadu a tlačítko „Aktualizovat", které stáhne nejnovější
> změny. Po najetí myší vidět počet otevřených PR čekajících na zamergování a mít je jako odkaz,
> který mě přesměruje abych to mohl mergnout."_

This is about the **ZIBBY install repo itself** (the operator's ZIBBY checkout), not a project.

## Data source

Use local git in the **install root** (`installRoot()` from phase 76's `data-dir.ts` — the repo
root, parent of `.zibby`) plus the `gh` CLI (already a dependency — `WorkspaceService.openPr`
shells `gh pr create`). All bounded timeouts; every call degrades gracefully.

## 1 — Contract — a `self` resource

`libs/contracts/src/self/` (new resource; `health` is the reference for a fresh resource):
- `SelfPrSchema = z.object({ number: z.number().int(), title: z.string(), url: z.string() })`.
- `SelfStatusSchema = z.object({ currentBranch: z.string(), defaultBranch: z.string(), behind: z.number().int().nonnegative(), ahead: z.number().int().nonnegative(), dirty: z.boolean(), upToDate: z.boolean(), openPrCount: z.number().int().nonnegative(), prs: z.array(SelfPrSchema), fetchedAt: IsoDateTimeSchema.optional(), ghAvailable: z.boolean() })`.
- `SelfUpdateResultSchema = z.object({ updated: z.boolean(), behind: z.number().int().nonnegative(), message: z.string().optional() })`.
- Contract `self.contract.ts`:
  - `getSelfStatus: GET /self/status → 200: SelfStatusSchema`
  - `updateSelf: POST /self/update → 200: SelfUpdateResultSchema, 409: ErrorSchema` (409 when the
    pull can't fast-forward — e.g. dirty tree or diverged; never force).
- Barrel + register in the root contract. Round-trip + route tests.

## 2 — API — `SelfModule` / `SelfService` (+ controller)

`apps/api/src/self/`:
- `SelfService.status()`:
  - `cwd = installRoot()`. `git rev-parse --git-dir` guard → if not a repo, return a benign
    `{ currentBranch:"", defaultBranch:"", behind:0, ahead:0, dirty:false, upToDate:true, openPrCount:0, prs:[], ghAvailable:false }`.
  - `git fetch origin` (bounded ~60s; offline → skip, mark not-fresh but still return local view).
  - `defaultBranch` via `git symbolic-ref --short refs/remotes/origin/HEAD` → strip `origin/`
    (fallback `main`). `currentBranch` via `git branch --show-current`.
  - `behind` = `git rev-list --count HEAD..origin/<default>`; `ahead` =
    `git rev-list --count origin/<default>..HEAD`. `dirty` = `git status --porcelain` non-empty.
  - `upToDate = behind === 0`.
  - PRs: if `gh` is available (`gh --version` succeeds), `gh pr list --state open --json number,title,url`
    (bounded); parse JSON → `prs`, `openPrCount = prs.length`, `ghAvailable = true`. On any gh
    failure → `prs: []`, `openPrCount: 0`, `ghAvailable: false` (never throw).
  - All git failures are soft (log + safe defaults); the endpoint must never 500 on a normal
    machine.
- `SelfService.update()`:
  - Refuse (409) if `dirty` (never touch a dirty operator tree) or if `behind === 0` (nothing to
    do → `{ updated:false, behind:0 }`) or if the pull is not a fast-forward.
  - `git pull --ff-only origin <default>` in `cwd`. Success → `{ updated:true, behind:0 }`.
    Non-ff / failure → throw a typed error → 409 with a clear message. NEVER `--force`, never
    `reset --hard`. This is the operator's explicit self-update button — surfaced, reversible-ish
    (ff-only), never autonomous.
- Controller + module; register in `app.module.ts`. Tests mock `execFile` (git/gh): behind count,
  offline fetch fallback, gh-missing path, update ff-only, update refuses dirty/non-ff.

## 3 — Web — TopBar freshness control

- `apps/web/features/self/` (new): `queries/useSelfStatusQuery.ts` (key `["self-status"]`,
  `refetchInterval` ~120s — polled STATE; `select: selectApiResponseBody`), `mutations/useSelfUpdateMutation.ts`
  (`onSuccess` invalidates `["self-status"]`). Barrels.
- New `apps/web/components/layout/TopBar/SelfFreshness.tsx` (+ test), rendered in `TopBar.tsx`
  (e.g. left of the `LanguageSwitcher` / near `walletSlot`, matching the one-interaction grammar):
  - `upToDate` → a calm `StatusDot` (ok tone) + tooltip "ZIBBY je aktuální".
  - `behind > 0` → a warn `StatusDot` + `t("self.behind", { count })` ("o {count} commitů pozadu")
    and an **"Aktualizovat"** `Button` → `useSelfUpdateMutation` (show `.isPending`; on non-ff 409
    surface the returned message via a toast/inline note). 
  - **Hover** (a DS `Tooltip`/`Popover`) shows the open-PR count and lists each PR as a link
    (`<a href={pr.url} target="_blank" rel="noreferrer">#{number} {title}</a>` via a DS link/Pressable —
    no raw styled anchor if a DS link exists) so the operator jumps straight to GitHub to merge.
    When `openPrCount === 0`, the hover just says "žádné otevřené PR".
  - Keep it compact; it lives on every screen (TopBar is global). i18n `topbar.self.*` in cs + en.
- Wire the component into `TopBar` without disturbing the existing slots/layout; add a
  `SelfFreshnessTestId` enum.

## Tests

- `SelfService`: behind/ahead counts from mocked git; offline fetch → still returns; gh-missing →
  ghAvailable:false, empty prs; update ff-only success; update refuses dirty and non-ff (409).
- `SelfFreshness` web: up-to-date state (ok dot, no button); behind state (count + Aktualizovat →
  mutation called); hover lists PR links with correct hrefs; gh-unavailable hides the PR list
  gracefully.
- Contract round-trip/route tests. Extend `TopBar.test.tsx` if it asserts composition.

## Verification (paste real output; plain npx — no rtk)

- `npx tsc -p libs/contracts/tsconfig.json --noEmit` / `apps/api` / `apps/web` — clean.
- `npx eslint <touched>` — clean.
- `npx vitest run libs/contracts apps/api/src/self apps/web/features/self apps/web/components/layout/TopBar`
  — green modulo documented pre-existing reds. Any NEW red is yours.

## Constraints

- Contract-first, new `self` resource wired like `health`. `updateSelf` is ff-only, refuses a
  dirty tree, never force/reset — the ONE sanctioned self-update, operator-triggered only. All git
  soft-fails; the endpoint never 500s on a normal machine. DS-composed web (no raw styled anchors
  if a DS link exists; no inline style); React 19; no `any`. cs primary, en synced.
- SSE-vs-poll: self-status is polled STATE (like `health`/`limits`), not streamed.
