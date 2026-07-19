# F8c — Dissolve `features/overview/` into its real modules

Part of the HUD → Chat UI migration. Read `docs/hud2chat/DECISIONS.md` — **D16, D18, D19, D20**
are this phase — and `docs/hud2chat/ROADMAP.md`.

**This phase deletes nothing.** It is a pure relocation + repoint, and it must end with the app
behaving exactly as it does now, `/overview` included. The deletion is F8d, and it is only safe
once this has landed green.

## Why

`features/overview/` looks like a page folder but is really three shared modules with a page
sitting on top. Seven files outside it import from it, and **three of those are Chat UI
itself** — the design we are migrating *to*. A `git rm -r` would take out the chat live log,
the status pill and the briefing card. See D19 for the full consumer list.

## The move

Relocate these out of `features/overview/`, into homes named for what they are:

| What | Currently | Consumers that must keep working |
| --- | --- | --- |
| `activityLog.ts`, `queries/useActivityQuery.ts`, `queries/useActivityFeedInfiniteQuery.ts`, `components/ActivityFeed/` | `features/overview/` | `chat/ChatLiveLog`, `projects/ProjectIntegrationActivityPanel`, `runs/runEvents`, `layout/RightRail` |
| `healthPresentation.ts` | `features/overview/` | `chat/StatusPill` (F8b), `overview/SummaryWidget` |
| `queries/useBriefingQuery.ts`, `mutations/useGenerateBriefingMutation.ts`, and the row sub-components + `BriefingCardTestId` from `components/BriefingCard/BriefingCard.tsx` | `features/overview/` | `chat/BriefingMessageCard` (F8a), `notifications/useNotifications`, `runs/runEvents`, `overview/BriefingCard` itself |

Suggested homes — `features/activity/`, `features/health/`, `features/briefing/` — but check
first: **`features/health/` may already exist** (`StatusPill` imports `useHealthQuery` from
`../../health`), in which case `healthPresentation.ts` joins it rather than founding a new
folder. Do not create a folder that duplicates an existing domain.

The project convention is one hook per file re-exported from `queries/index.ts` /
`mutations/index.ts` — preserve it in the new homes; do not flatten.

**The briefing row components are the fiddly one.** `BriefingCard.tsx` currently exports both
the page card *and* the rows F8a reuses. Move the shared rows (`NeedsYouRow`,
`SubsystemLineRow`, `STATE_DOT_TONE`, `BriefingCardTestId`) into the new briefing module and
have **both** `BriefingCard` (the page, still alive) and `BriefingMessageCard` (chat) import
them from there. Neither should import from the other.

## Constraints

- **Behaviour-neutral.** No visual change, no logic change, no test rewritten to fit a new
  shape. If a test needs more than a changed import path, you have changed behaviour — stop.
- `vi.mock()` calls hardcode module paths (`ChatLiveLog.test.tsx`, `ChatScreen.test.tsx`,
  `RightRail.test.tsx` all mock `features/overview/queries`). These break silently — a stale
  mock path can make a test pass against the wrong module. Update them and confirm the tests
  still exercise what they claim.
- `apps/web` has a **madge cycle guard in CI**. Moving shared code between feature folders is
  exactly how cycles get introduced. Run the dependency check before you report done.
- Leave `features/overview/Screen.tsx`, `SummaryWidget.tsx`, `ApprovalsPanel.tsx`,
  `QuickLaunchPanel/`, `BriefingCard.tsx` and the `/overview` route in place, importing from
  the new homes. They die in F8d, not here.

## Out of scope
Deleting anything. Touching `/runs`. Repointing `/overview` or `/runs` links. The root redirect.
`MainLayout`/`RightRail` deletion (F10). **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- **Typecheck raw, and check the exit code** (D20 — the filtered form prints
  "No errors found" while exiting non-zero, which is how a real failure hid for this whole arc):
  ```
  for p in apps/web apps/api libs/contracts libs/design-system; do
    rtk proxy npx tsc -p $p --noEmit; echo "$p -> $?"
  done
  ```
  All four must print `-> 0`. `libs/design-system` was repaired in `b33e8db5`; if it regresses,
  that is yours.
- `pnpm check:deps` (the madge cycle guard).
- Scoped vitest across **every** consumer named in the table above, not just the moved files.
- **Live browser at 1680px:** `/chat` (live log renders, status pill shows health),
  `/overview` (still fully working — this phase does not kill it), and a project detail page's
  integration activity panel. Report what you saw.
