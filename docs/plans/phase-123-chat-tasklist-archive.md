# Phase 123 — Chat tasklist: archive of completed tasks

**Arc:** Chat UI ⇄ Velín-D design alignment. **Surface:**
`apps/web/features/chat/components/ChatTasksPanel.tsx` (+ i18n + test).

## Why
The left gutter header reads **"Běžící úlohy"** (running tasks) but currently lists ALL tasks —
including every finished `HOTOVO` (done) one (live-verified: 21 tasks, most done). The operator
wants an **archive of completed tasks**: keep the gutter focused on active work, and move
finished tasks behind a collapsible **"Archiv"** section reachable from the gutter. This also
makes the existing "Běžící úlohy" title honest.

## The split (decided)
Partition the `useRunsQuery` feed by status:
- **ACTIVE (shown in the gutter):** `running`, `queued`, `scheduled`, `pending`, `held`,
  `awaiting-approval`, `paused-limit` (mid-run — auto-resumes, so it is NOT archived).
- **ARCHIVED (behind the "Archiv" toggle):** `done`, `error`, `interrupted`, `parked`
  (settled / finished — will not progress on their own).

Derive these from `RUN_STATUS_GROUPS` keys (`running` + `waiting` = active minus nothing;
`done`/`error`/`parked` = archived) EXCEPT: keep `paused-limit` ACTIVE even though it sits in
the `error` group (it's a mid-run pause that resumes). Encode the active/archived predicate as
a small local helper (a `Set<FeedStatus>` or a `isArchived(status)` fn) with a comment naming
the `paused-limit` exception, so the rule is one obvious place — do NOT scatter status literals.

## Scope (do)
1. **Split** the ordered runs into `active` and `archived` (preserve the existing `taskRank`
   live-first ordering within `active`; `archived` newest-first — the feed's own order).
2. **Gutter = active cards** under the existing header (`chat.tasks.title` "Běžící úlohy" —
   now accurate). Count in the header = `active.length` (not total).
3. **"Archiv" toggle row** below the active list: a DS `Pressable` (its own testid) showing an
   archive/inbox icon + `chat.tasks.archive` label + the archived count + a chevron that
   rotates on expand. **Collapsed by default.** Expanding renders the `archived` cards
   (same `ChatTaskRow`, same `onSelectRun` selection → same inline detail) in a scrollable
   `Stack` below. Only render the toggle when `archived.length > 0`.
4. **Selection parity:** an archived card selects + opens its detail exactly like an active one
   (`selectedRunId`/`onSelectRun` unchanged — a selected archived run keeps its selected ring).
5. **Empty states:**
   - No active AND no archived → the current `chat.tasks.empty` hint (unboxed).
   - No active but some archived → a quiet "no active tasks" hint (new key
     `chat.tasks.activeEmpty`, e.g. cs "Žádné běžící úlohy") PLUS the Archiv toggle.
6. **Scroll:** the active list and the expanded archive share the gutter's scroll budget — keep
   the existing `maxHeight` cap on the scroll region so the whole gutter never exceeds the band;
   the archive expanding just adds rows to the scrollable column.

## Out of scope
- A separate full-page/overlay archive with search/filters (possible follow-up — note it, don't
  build it). v1 is the in-gutter collapsible section.
- Any change to `ChatTaskRow`, task detail, subsystem drawer.
- Server-side filtering — split client-side from the existing feed (no new query).

## Constraints
- **DS-composed only** in `apps/web`; no raw inline `style`/Tailwind on DOM nodes. Compose from
  `Container`/`Stack`/`Pressable`/`Icon`/`Typography`/`Divider`/`StatusDot`. Reuse the existing
  `ChatTaskRow` for both lists.
- Reuse `useRunsQuery` (single feed, no second fetch). Keep `taskRank`/`RUN_STATUS_GROUPS`.
- React 19 (no forwardRef); no `any`.
- Extend the `ChatTasksPanelTestId` enum for the new parts: e.g. `ArchiveToggle`,
  `ArchiveList`. Keep existing `Root`/`List`/`Empty`/`Title`. The active list keeps `List`.
- i18n: add `chat.tasks.archive` (cs "Archiv" / en "Archive") and `chat.tasks.activeEmpty`
  (cs "Žádné běžící úlohy" / en "No active tasks") to BOTH `apps/web/i18n/messages/cs.json` and
  `en.json` with key parity (default locale cs). Reuse `empty` for the nothing-at-all case.
- Update `ChatTasksPanel.test.tsx`: assert active/archived split (a done run is NOT in the
  active `List` but appears under the expanded `ArchiveList`; toggle collapses/expands;
  count reflects active-only). Select by testid; keep role/count assertions.

## Acceptance
- `/chat` gutter shows only active tasks under "Běžící úlohy"; finished tasks live under a
  collapsed "Archiv · N" toggle that expands to reveal them; clicking any archived card opens
  its detail like an active one.
- `pnpm check:lint && tsc -p apps/web && pnpm test` green.

## Files
- Edit: `apps/web/features/chat/components/ChatTasksPanel.tsx`
- Edit: `apps/web/features/chat/components/ChatTasksPanel.test.tsx`
- Edit: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
