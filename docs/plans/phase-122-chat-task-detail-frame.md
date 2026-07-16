# Phase 122 — Chat task detail: Velín-D frame alignment

**Arc:** Chat UI ⇄ Velín-D design alignment. **Surface:**
`apps/web/features/chat/components/ChatTaskDetailColumn.tsx`.
**Design ref:** `design/Z.I.B.B.Y/zibby/velin-c-tasks.jsx` — `VcTaskDetail`.

## Context / decision (READ before coding)
`RunDetail` (`apps/web/features/runs/components/RunDetail.tsx`, 858 lines, **SHARED with the
`/runs` page — do NOT restructure it**) ALREADY renders every piece the design's task detail
has: an `EntityHero` header (title, `RunStateBadge`, id·kind·agent, actions kebab / approval,
meta strip), `RunInputSection` (= design's **Vstup**), `RunOutputPanel`/`RunPrGatePanel` (=
PR/output), and — for pipeline runs — `PipelineStageTimeline` (= the design's **Fáze** rail
WITH openable per-phase logs). So the design's *substance* is present; the current chat column
just wraps `RunDetail` and adds an awkward top strip.

**D2 (decided):** keep the Phase-100 inline-column architecture and reuse `RunDetail` as the
body. This phase aligns the COLUMN FRAME to the Velín-D language and removes the clunk. The
full side-by-side two-column FLIP dialog (`VcTaskDetail`) is DESCOPED (RunDetail is shared +
battle-tested; a narrow inline column favors single-column readability; forcing side-by-side
across agent/pipeline/goal/chain kinds is awkward — pipeline logs already live inside the
stage rail). If the operator wants the fuller two-column at review, it becomes a follow-up.

## The clunk to fix
Today `ChatTaskDetailColumn` renders, ABOVE `RunDetail`'s own hero header, a separate strip:
a left "otevřít celý běh" pressable (`expand` icon + `openFull` text) and a right close `x`.
That strip stacks a second header-ish row over RunDetail's `EntityHero`, reading as redundant.

## Scope (do)
1. **Remove the top strip.** Replace with:
   - A **floating close control** pinned top-right OVER the detail surface (same idiom as
     `SubsystemDrawer`'s close button — `absolute top-3 right-3`, a small bordered glass
     button with an `x`). Keep `ChatTaskDetailColumnTestId.Close`.
   - The **"otevřít celý běh →"** affordance moved to a subtle FOOTER link BELOW `RunDetail`
     (a `Pressable` → `router.push(/runs?run=<id>)`), keeping
     `ChatTaskDetailColumnTestId.OpenFull`. Small, mono, tertiary — a quiet "see the full
     page" escape, not a header element.
2. **Surface/consistency:** keep the column visually consistent with `SubsystemDrawer` (both
   are the chat's docked detail surfaces). It currently uses `Panel elevated`; `SubsystemDrawer`
   also uses `Panel elevated` — keep `Panel elevated` so the two detail surfaces match (do NOT
   swap to `GlassSurface` unless the drawer does too; consistency > one-off).
3. **Width/scroll:** keep the existing `left-[316px] right-4` band and `maxHeight:100%`
   internal scroll. Ensure the floating close doesn't scroll away (pin it to the panel, not
   the scrolling content — e.g. the close sits on a `position:relative` panel with the
   scroll region inside).
4. Keep `RunDetail` as the body, unchanged, with all its existing props.

## Out of scope
- `RunDetail` internals (shared — untouched).
- Side-by-side two-column layout / FLIP animation (descoped, see D2).
- Subsystem detail (123/124), archive (125).

## Constraints
- **DS-composed only** in `apps/web`; no raw inline `style`/Tailwind on DOM nodes beyond the
  already-sanctioned patterns. The `SubsystemDrawer` close button uses a raw `<button>` with
  Tailwind classes inside a sanctioned context — mirror the DS-first approach: prefer a DS
  `Pressable`/`IconButton` with `Container position="absolute"` for the pin if it satisfies
  lint; only fall back to the drawer's exact `<button className=...>` idiom if a DS equivalent
  can't pin cleanly (document why).
- React 19 (no forwardRef); no `any`; keep `<Name>TestId` enum + `data-testid`.
- i18n: reuse `chat.tasks.openFull`/`closeDetail`/`detailAriaLabel` keys (already exist).
- Update `ChatTaskDetailColumn.test.tsx` selectors ONLY where the DOM shape moved (Close now
  floats top-right, OpenFull now in a footer) — migrate selectors, keep assertions
  (close fires `onClose`, open-full navigates, RunDetail renders).

## Acceptance
- Selecting a task in the gutter opens its detail with a clean floating top-right close and a
  quiet footer "otevřít celý běh →" link — no redundant top strip above RunDetail's hero.
- Close and open-full still work (tests green).
- `pnpm check:lint && tsc -p apps/web && pnpm test` green.

## Files
- Edit: `apps/web/features/chat/components/ChatTaskDetailColumn.tsx`
- Tests: `apps/web/features/chat/components/ChatTaskDetailColumn.test.tsx` (selector migration)
