# F8d — Delete `/overview` and `/runs`

Part of the HUD → Chat UI migration. Read `docs/hud2chat/DECISIONS.md` — **O3, D17, D19, D20** —
and `docs/hud2chat/ROADMAP.md`.

This is the phase O3 was pointing at all along. It is only small because F8a/F8b/F8c did the
work: the briefing has a home in chat, health reaches the topbar, and `features/overview/` is
now a leaf that only its own route imports (verified — the sole external reference left is
`app/(dashboard)/overview/page.tsx`).

## What gets deleted

- `app/(dashboard)/overview/page.tsx` and `features/overview/` entirely (`Screen.tsx`,
  `SummaryWidget.tsx`, `ApprovalsPanel.tsx`, `QuickLaunchPanel/`, `BriefingCard/`, `index.ts`).
- `app/(dashboard)/runs/page.tsx` and `features/runs/Screen.tsx` — **the list page only.**
  `features/runs/` as a folder **stays**: `RunDetail`, `TaskCard`, `ParkedRunsPanel`,
  `runEvents.tsx`, `run.ts`, `archiveStatus.ts` and friends are used by `/archiv`, the chat
  panels and the subsystem drawer. Delete the Screen, not the domain. Check each file's
  consumers before removing it — F8c's lesson, one phase old.

## `/runs` becomes a redirect, not a 404 (D17)

`apps/api/src/chat/chat-session.service.ts` bakes `href: /runs?run=<ref>` into the tool event
of every `create_task` chat turn, and **those events are already persisted in transcript JSONL
on disk.** No frontend change rewrites history that is already written. So:

1. `app/(dashboard)/runs/page.tsx` becomes a redirect to `/archiv`, **preserving `?run=`** so a
   deep link from an old transcript still lands on the right run. Verify `/archiv` reads the
   same `?run=` param — if it uses a different one, translate it.
2. Stop the API minting new `/runs` links: point `chat-session.service.ts` at `/archiv`.
   This is a contract-adjacent behaviour change in `apps/api`, so re-read how that href is
   built before editing, and keep the shape identical.
3. Leave a comment on the redirect saying why it exists and what would have to be true to
   remove it (old transcripts aged out) — otherwise a future cleanup deletes it as dead code.

## Live code paths that must be repointed (not shimmed)

These are hit constantly and must go straight to `/archiv`:

- `features/tasks/hooks/useTaskSubmit.ts` — pushes `/runs?run=…` after **every** task dispatch,
  app-wide (both `NewTaskDialog` and `TaskCommandLine`). Two call sites in that file.
- `app/page.tsx` — the root redirect currently sends `/` to `/overview`. It must now send the
  operator to **`/chat`**: that is the whole point of the arc (O2 — one world).
- `features/chat/ChatContext.tsx` — `CHAT_HOME_ROUTE = "/overview"` and `close()` pushes it.
  With `/overview` gone, "close chat" has nowhere sensible to go. **Think about this one rather
  than mechanically repointing it:** if `/chat` is now home, a "close" affordance that
  navigates away from home may no longer make sense at all. Report what you find and what you
  chose; if removing the affordance is the right answer, say so rather than doing it silently.
- `features/notifications/notificationRules.ts` — `href: "/runs"` for `approval`/`parked`,
  `href: "/overview"` for `briefing`. Approvals and parked runs → `/archiv`. The briefing
  notification should now point wherever the briefing actually lives (`/chat`).
- `components/layout/BrandLogo/BrandLogo.tsx` → `/overview`. Repoint to `/chat`.
- `features/chat/components/ChatTopBar.tsx` — the "HUD switch" icon links to `/overview`.
  With the HUD gone this element is meaningless; removing it takes the topbar to four elements.
  **Flag this, do not decide it alone** — the five-element topbar was a deliberate contract
  from an earlier arc. Report it and leave it in place if unsure.
- `state/config.ts` — `NAV_ITEMS` entries for `overview` and `runs`, and the
  `FULLSCREEN_ROUTES` table. The old HUD sidebar still reads `NAV_ITEMS` until F10.
- Any remaining `/runs?...` deep links: `ChatRunCard`, `ChatTaskDetailColumn`,
  `ProjectCard`, `ProjectRunSummary`, `ArtefaktyTab`, `AktivitaTab`, `ParkedRunsPanel`.
  Grep for them; the F8 grounding listed these but **re-grep rather than trusting the list.**

## Tests and stories that assume these routes exist
`vitest.setup.tsx` mocks `usePathname: () => "/overview"` as the **global default for the whole
component suite**. Changing it touches every test — pick the new default deliberately and say
what you chose. Also: `AppShell.test.tsx` (its "still HUD chrome" cases use `/overview` and
`/runs`), `Sidebar.stories.tsx`, `MainLayout.stories.tsx`, and the e2e specs
`approval.spec.ts`, `briefing.spec.ts`, `channels.spec.ts` all `page.goto("/overview")`.

## Out of scope
Deleting `MainLayout`/`Sidebar`/`RightRail`/`TopBar` or simplifying `AppShell` (F10).
The chat reachability sweep (F9). **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix`; `pnpm check:lint`.
- **Typechecks raw with exit codes** (D20 — the filtered form lies):
  `for p in apps/web apps/api libs/contracts libs/design-system; do rtk proxy npx tsc -p $p --noEmit; echo "$p -> $?"; done`
  All four must be 0.
- `pnpm check:cycles`.
- Full `web-components` vitest project, plus the api project. Deleting routes tends to break
  tests far from the change — run the whole project, not a scoped subset.
- **Grep for surviving references** to `/overview` and `/runs` and report anything left with a
  reason it is allowed to stay.
- **Live browser at 1680px:** `/` redirects to `/chat`; dispatch a task and confirm it lands on
  `/archiv`; visit `/runs?run=<real id>` and confirm it redirects to that run in `/archiv`;
  confirm `/overview` 404s. Report what you saw.
