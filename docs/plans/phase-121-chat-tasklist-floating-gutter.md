# Phase 121 — Chat tasklist: floating-card gutter

**Arc:** Chat UI ⇄ Velín-D design alignment (`.superpowers/chat-design/roadmap.md`).
**Surface:** `apps/web/features/chat/components/ChatTasksPanel.tsx` (+ `ChatTaskRow.tsx` touch-ups).
**Design ref:** `design/Z.I.B.B.Y/zibby/velin-c-tasks.jsx` — `VcTaskRail` + `VcTaskCard`.

## Why
The left tasks gutter today wraps every task row inside ONE boxed `HudPanel` with a
`"Tasky"` header. The design (`VcTaskRail`) has **no wrapping box** — it's a transparent
left rail where each task is an **individually floating glass card**, gently levitating over
the orb map, scrolling as a column. `ChatTaskRow` already renders a design-close `Card`
(edge tone, living glow, avatar, meta strip, progress meter) — the gap is the **container
framing**, not the card.

## Scope (do)
1. **Drop the `HudPanel` box** in `ChatTasksPanel`. The gutter becomes a transparent vertical
   `Stack` of floating `ChatTaskRow` cards over the scene (the cards already carry their own
   glass/shadow via DS `Card`).
2. **Minimal header** matching the design's restraint: a small live-dot + count, no boxed
   panel chrome, no large title. Keep it as a quiet label row above the scroll area (the
   design shows just floating cards; a slim "N úloh" affordance is acceptable and keeps the
   count testid). Keep `ChatTasksPanelTestId.Title`/`Empty`/`List`/`Root` enum values so
   existing tests keep their selectors (migrate selectors, not assertions).
3. **Scroll + spacing:** vertical scroll for overflow, comfortable gap between cards
   (design gap ~12px → DS `gap="100"`), right padding so shadows aren't clipped. Preserve the
   existing `taskRank` live-first ordering.
4. **Empty state:** keep the quiet mono hint (`chat.tasks.empty`), unboxed.
5. **Optional levitation:** a *subtle* float is design-signature but NOT required for
   correctness. If added, it must be a DS-level affordance or a documented sanctioned escape
   hatch — do NOT scatter raw `@keyframes`/inline animation across `apps/web`. **Default:
   SKIP the float animation this phase** (log to polish backlog) unless it can be expressed
   cleanly; prioritize the un-boxed floating-card layout + selection/scroll correctness.

## Out of scope
- `ChatTaskRow` visual redesign (already design-aligned — only touch if the un-box requires it).
- Task detail (phase 122), archive (phase 125).
- The right ChatToolDock, bottom bar, live-log (unchanged).

## Constraints
- **DS-composed only.** No raw inline `style`/Tailwind in `apps/web` beyond what already
  exists. Use `Container`/`Stack` layout props; `GlassSurface` only if a genuine glass pane is
  needed (the cards already are glass — likely not needed here).
- Reuse `useRunsQuery` (no second fetch). Keep the `RUN_STATUS_GROUPS`/`taskRank` ordering.
- Keep the `pointer-events` contract: the gutter wrapper in `ChatScreen` is
  `pointer-events-none` with a `pointer-events-auto` inner — `ChatTasksPanel` must not
  re-introduce a full-height opaque catch area that blocks orb clicks behind empty space.
  A boxless gutter helps here — ensure only the cards (and header) capture pointer events,
  not the whole column's empty track.
- Keep `<Name>TestId` enum + `data-testid`. Update `ChatTasksPanel.test.tsx` selectors if the
  DOM shape changes; assertions (role/count/empty) stay.
- i18n: reuse existing `chat.tasks.*` keys; if the header copy changes, update cs+en catalogs
  and keep parity.

## Acceptance
- `/chat` left gutter shows floating individual task cards (no wrapping box), live-first order,
  scrollable, with a quiet count + empty hint.
- Orb map remains clickable in the empty space of the gutter track.
- `pnpm check:lint && tsc -p apps/web && pnpm test` green (esp. `ChatTasksPanel.test.tsx`,
  `ChatTaskRow.test.tsx`).

## Files
- Edit: `apps/web/features/chat/components/ChatTasksPanel.tsx`
- Maybe touch: `apps/web/features/chat/components/ChatTaskRow.tsx` (only if un-boxing needs it)
- Tests: `apps/web/features/chat/components/ChatTasksPanel.test.tsx` (selector migration)
- Possibly: `apps/web/features/chat/components/ChatScreen.tsx` gutter wrapper padding (only if
  the removed box changes the pointer-events/scroll math) — keep the `lg:` hidden-below-lg rule.
- i18n: `apps/web/i18n/messages/{cs,en}.json` only if header copy changes.
