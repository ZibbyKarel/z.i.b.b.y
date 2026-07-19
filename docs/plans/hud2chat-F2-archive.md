# F2 — Archive of tasks (`/archiv`)

Part of the HUD → Chat UI migration. Read `docs/hud2chat/ROADMAP.md` and
`docs/hud2chat/DECISIONS.md` first (**D3, D8, D9, D12** are the ones this phase turns on).

**This is the only genuinely new page in the whole arc, and the only one with a literal
design reference.** Everything else is a chrome swap. Build it carefully.

## Design reference
`design/Z.I.B.B.Y/ZIBBY Archiv úloh.html` — read it. Its structure:
- Thin header: round back button → title "Archiv úloh" + subtitle "Vše, co ZIBBY dokončil
  napříč subsystémy". **This is exactly `ImmersivePage`** — use it, do not rebuild.
- Body: a two-pane master/detail split.
  - Left rail, fixed 340px, own border-right: a filter header (search input +
    subsystem multi-select with per-subsystem counts and coloured dots) over a scrollable
    grouped list.
  - Right pane: flexes to fill. Empty state = centred archive icon + placeholder copy.
    Selected = the task detail, rendered **inline, without modal chrome**.
- Row anatomy: subsystem colour dot (with glow) → title (single line, ellipsis) + subline
  `{subsystem} · {project}` in mono → state icon → duration in mono. Active row gets a
  background tint + hue-tinted border.

## What to build

### 1. Route + shell
`apps/web/app/(dashboard)/archiv/page.tsx` → `features/archive/Screen.tsx`.
Register `/archiv` in `FULLSCREEN_ROUTES` (`apps/web/state/config.ts`).
Wrap in `ImmersivePage` (`backHref` defaults to `/chat` — correct here).
**Per D12** the shell body has no padding — but this page is a master/detail that *should*
touch the edges, so do not add page padding; put padding inside each pane instead.

### 2. Data — reuse, do not refetch
- Runs come from `useRunsQuery()` (`apps/web/features/runs/queries/useRunsQuery.ts`).
  **No second fetch, no new endpoint, no contract change.**
- **Archive split (D9):** reuse `ChatTasksPanel`'s rule —
  `ARCHIVED_STATES = {done, error, interrupted, parked}`. `paused-limit` is deliberately
  NOT archived (it is a mid-run pause that auto-resumes). Extract that predicate to a
  shared module both `ChatTasksPanel` and this page import, rather than copying the set —
  two copies will drift.
- **Subsystem attribution (D8):** there is no subsystem field on `TaskRun`. The join is
  `run.owner` → `Pipeline.ownerSubsystem` / `Chain.ownerSubsystem`, exactly as
  `features/subsystems/components/SubsystemDrawer/AktivitaTab.tsx` does it, via
  `usePipelinesQuery()` / `useChainsQuery()`. Agent-kind and goal-kind runs have **no**
  subsystem and must land in an explicit "bez subsystému" group — do not hide them.
  Extract this join into a reusable hook/helper; `AktivitaTab` does the same work and this
  is the second consumer.

### 3. Grouping and filters (D3)
- A group-by switch: **Subsystém** (default) / **Čas**.
  - By subsystem: one group per `SUBSYSTEMS` entry that has rows, plus "bez subsystému"
    last. Use each subsystem's registry `color` for the dot.
  - By time: the design's buckets — `Dnes`, `Včera`, `Tento týden`, `Starší`, in that order.
- Free-text search over task title/project. None exists today — build it from DS primitives.
- Subsystem multi-select filter with counts. **No DS `MultiSelect` exists** — decide
  explicitly (DS-first): either add one to DS, or build a domain composite under
  `features/archive/components/`. Given it needs coloured dots and counts, a domain
  composite is likely right; state the decision in your report either way.
- Deep-link the filter state through query params, following the existing pattern in
  `features/runs/Screen.tsx` (`?project=`, `?filter=`).

### 4. Detail pane
Reuse `RunDetail` (`features/runs/components/RunDetail.tsx`) — the design itself reuses the
Velín-D task detail body here ("stejný obsah … bez overlaye"). Its props are:
`run, glyph, avatar?, now, onStop, stopping, onDelete, deleting, onResume?, resuming?` —
wire them from `useRunActions` exactly as `features/runs/Screen.tsx` does.
Selection deep-links as `?run=<id>`; reuse `findSelectedRun` from `features/runs/run.ts`
(it matches on `runId` **or** `taskId`).

### 5. Chat links
- `ChatTasksPanel`'s in-gutter "Archiv · N" section becomes a **link to `/archiv`**
  (operator decision O4). Keep the count. Do not delete the collapsible section's contents
  in this phase unless the link makes them dead — if it does, say so in your report and
  leave the removal to review.
- Add `/archiv` to `ChatToolDock`'s `DOCK_IDS` if that requires only a `NAV_ITEMS` entry;
  otherwise report what it would take.

## Out of scope
Deleting `/runs` (that is F8). Changing `RunDetail`'s internals. Any contract change.
Attributing agent/goal runs to subsystems. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY.
- Scoped vitest (`web-components`, `@zibby/design-system`), plus tests for: the archive
  split predicate, the subsystem join including the "bez subsystému" fallback, both grouping
  modes, search, and `?run=` selection.
