# Phase 39 — Unify the activity logs into one place

> TODO (line 53): _"máme moc logů Overview - Nedávná aktivita, pravý side panel v HUD ui
> a Aktivita panel v Chat UI. chce to sjednotit a nechat na jednom místě."_

## The three duplicate activity logs (recon)

Same activity feed rendered in three places:
1. **Overview "Nedávná aktivita"** — `apps/web/features/overview/Screen.tsx:126-130`
   (`<HudPanel title={t("overview.activity")}><ActivityFeed items={activity} limit={8}/>`),
   fed by `useActivityQuery()` (`Screen.tsx:41`).
2. **HUD right rail** — `apps/web/components/layout/RightRail/RightRail.tsx` (live
   SSE-streamed activity ticker, paginated), fed by `useActivityFeedInfiniteQuery()`.
   Mounted via `AppShell` `railSlot` — present on every HUD page.
3. **Chat activity panel** — `apps/web/features/chat/components/ChatSidePanel.tsx` (reuses
   `ActivityFeed` + `useActivityQuery()`), opened by the "pulse" toggle in `ChatScreen`'s
   top bar (`ChatScreen.tsx:411-421` → `openPanel`, mounted at `:518`).

`/runs` (`features/runs`, "Běhy & aktivita") is the canonical FULL feed — a separate
concern (full page), not one of the redundant ambient logs.

## Decision (single home)

Keep the **HUD right rail** (`RightRail`) as the single ambient activity log (it's
persistent across every HUD screen, right there on Overview too), plus **/runs** as the
full page. Remove the two duplicates:
- the Overview "Nedávná aktivita" block, and
- the chat activity panel.

(Documented so the operator can redirect if they'd rather keep a different one.)

## Changes

### A. Remove Overview recent-activity (does NOT touch SummaryWidget)
- `features/overview/Screen.tsx`: delete the recent-activity `HudPanel` block (`:126-130`),
  the `useActivityQuery` call (`:41`) and its import (`:21`) if now unused, and any
  `activity`/`railHasContent` logic that only existed for it (keep `QuickLaunchPanel` in the
  rail column — re-check `railHasContent` so the rail column still renders when only
  QuickLaunch remains, or fold QuickLaunch appropriately). Do NOT edit `SummaryWidget.tsx`.

### B. Remove the chat activity panel (AFTER Phase 38 lands — both touch ChatScreen)
- `features/chat/components/ChatScreen.tsx`: remove the activity toggle button
  (`:411-421`), the `panelOpen`/`openPanel` state, and the `{panelOpen && <ChatSidePanel/>}`
  mount (`:518`). Keep the ⌘K palette + everything else.
- Delete `ChatSidePanel.tsx` (+ its test) if now unreferenced (knip-clean).

### C. Orphan cleanup
- `useActivityQuery` (`features/overview/queries/useActivityQuery.ts`) and `ActivityFeed`
  (`features/overview/components/ActivityFeed/`) were used ONLY by the Overview block + the
  chat panel. After A+B, if nothing else imports them, delete them (+ tests) — grep/knip to
  confirm no other consumer first. The rail's `useActivityFeedInfiniteQuery` +
  `buildActivityLog` stay.
- Remove now-orphaned i18n keys (`overview.activity`, `panel.*`/`chat.panel.title` if only
  the removed panel used them) — grep before deleting.

## Files
- `apps/web/features/overview/Screen.tsx`
- `apps/web/features/chat/components/ChatScreen.tsx` (+ test)
- delete `apps/web/features/chat/components/ChatSidePanel.tsx` (+ test) if unreferenced
- delete `features/overview/queries/useActivityQuery.ts` + `components/ActivityFeed/*` if unreferenced
- `apps/web/i18n/messages/{cs,en}.json` (orphaned keys only)

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/overview apps/web/features/chat`
  — never bare), `pnpm test` green modulo known pre-existing failures (confirm via
  `git stash`). Run knip/grep to confirm deletions have no remaining importers.
- Manual: Overview shows no separate recent-activity card (the HUD rail still shows live
  activity); chat has no activity panel/toggle; `/runs` unchanged.

## Sequencing
- Do this AFTER Phase 38 (CommandLine-in-chat) commits — both edit `ChatScreen.tsx`.
- Part A (Overview) is independent of chat and could go first, but keep it one coherent
  commit for the "unify" story.

## Constraints
- No forwardRef, no `any`, no inline DOM `style`. Don't touch `SummaryWidget.tsx` or other
  operator WIP (machine.*, design/*).
