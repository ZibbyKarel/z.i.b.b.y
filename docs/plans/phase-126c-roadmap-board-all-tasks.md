# Phase 126c — roadmap board shows all tasks until an epic is picked

> TODO.md item 3: _"roadmap v detailu projektu — pokud nevyberu žádný epic, vidím všechny
> tasky v kanban boardu. Kliknutí na epic je filtruje."_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

---

## Problem

There is no "no epic selected" state today. `RoadmapPanel.tsx:156-157` collapses the
selection to a concrete epic unconditionally:

```ts
const selectedEpic =
  epics.find((epic) => epic.id === (selectedEpicId ?? deepLinkedEpicId)) ?? epics[0]!;
```

`RoadmapBoard` therefore always receives a required `epic: RoadmapItem` and always filters
to it via `epicChildren(items, epic.id)` (`RoadmapBoard.tsx:89` → `roadmap-board.ts:14-16`).
The operator lands on the tab and silently sees only the first epic's tasks, with no way to
see the whole project's board.

## Target behaviour

- Initial state: **no epic selected** → the board shows every `level === "task"` item in the
  project, bucketed into the same four columns.
- Clicking an epic in `RoadmapEpicList` filters the board to that epic (today's behaviour).
- Clicking the **already-selected** epic deselects it → back to all tasks. This is the
  deselect affordance; no separate "Vše" row is added (see D1).
- A `?item=` deep link still opens the detail dialog. It no longer forces an epic
  selection — the board simply stays in all-tasks mode, which always contains the
  deep-linked task. (`deepLinkedEpicId` becomes unnecessary; delete it.)
- The board header, which today renders the epic's name + hue dot
  (`RoadmapBoard.tsx:115-126`), renders an "all tasks" heading with a neutral dot when no
  epic is selected.
- Cards in all-tasks mode must stay attributable to their epic — a task card in the
  unfiltered board shows its epic name (see D2).

## Design decisions to record in DECISIONS.md

- **D1 — deselect by re-clicking the selected epic, not a synthetic "Vše" row.** A synthetic
  row would have to fake an epic's progress bar and status chip in `RoadmapEpicList`, which
  renders a real `RoadmapItem` per row. Re-click-to-deselect keeps the list a pure list of
  real epics. The selected row must expose `aria-pressed` so the toggle is discoverable to
  assistive tech, and the row's tooltip/title says what a second click does.
- **D2 — in all-tasks mode each card gets an epic chip.** Without it two identically-named
  tasks from different epics are indistinguishable. Use the existing `epicHue` helper
  (`roadmap-board.ts`) so the chip colour matches the epic's dot in the rail. In
  epic-filtered mode the chip is redundant and is not rendered.

## Implementation

### 1. `roadmap-board.ts` — a helper for the unfiltered set

Add alongside `epicChildren`:

```ts
/** Every task-level item in the project, in board order — the unfiltered board. */
export function allTasks(items: RoadmapItem[]): RoadmapItem[];
```

Keep it pure and keep the ordering identical to `epicChildren`'s (read that function and
mirror its sort exactly — a different order between modes would look like a bug).

### 2. `RoadmapPanel.tsx`

- `selectedEpic` becomes `RoadmapItem | undefined`: resolve strictly from `selectedEpicId`,
  drop the `?? epics[0]!` fallback and drop `deepLinkedEpicId` entirely.
- Pass `epic={selectedEpic}` (now optional) to `RoadmapBoard`.
- `RoadmapEpicList` gets `selectedEpicId={selectedEpicId}` (already) and an `onSelect` that
  toggles: `setSelectedEpicId((current) => (current === id ? undefined : id))`.

### 3. `RoadmapEpicList.tsx`

- Row gets `aria-pressed={epic.id === selectedEpicId}`.
- No visual redesign beyond making the selected state legible when it can now be *un*set.

### 4. `RoadmapBoard.tsx`

- `epic` prop becomes optional: `epic?: RoadmapItem`.
- `const children = epic ? epicChildren(items, epic.id) : allTasks(items);`
- Header: when `epic` is undefined render `t("board.allTasks")` with a neutral dot; when
  defined keep today's name + `epicHue` dot.
- Pass a `showEpic` flag (or the resolved epic item) down to `RoadmapCard` so D2's chip only
  renders in all-tasks mode.

### 5. `RoadmapCard.tsx`

- New optional prop `epic?: RoadmapItem`. When present, render one `Chip` with the epic's
  name, tinted with `epicHue(epic.id)`, under `RoadmapCardTestId.Epic`.
- Do **not** touch the blocker rendering here — that is 126f's file territory. If both
  sub-phases are in flight, 126c lands first and 126f rebases.

### 6. i18n

Add to **both** `apps/web/i18n/messages/cs.json` and `en.json` under `roadmap.board.*`:

| key | cs | en |
| --- | --- | --- |
| `board.allTasks` | `Všechny tasky` | `All tasks` |
| `board.allTasksCount` | `Všechny tasky ({count})` | `All tasks ({count})` |

and under `roadmap.epic.*` a `epic.deselectHint` used as the row's `title`
(cs: `Zrušit filtr kliknutím znovu`).

Key parity between the two catalogs is enforced by the `web` vitest project — run it.

## Tests (`--project web-components`)

Extend the existing suites; do not create new files where one already covers the component.

`roadmap-board.test.ts`
- `allTasks` returns every task-level item and no epics.
- `allTasks` ordering matches `epicChildren`'s for a single-epic fixture.

`RoadmapBoard.test.tsx`
- With `epic` undefined, cards from **two different epics** are both present.
- With `epic` set, only that epic's cards are present (pin today's behaviour).
- Header renders the all-tasks label when `epic` is undefined.

`RoadmapPanel.test.tsx`
- Initial render shows the all-tasks board — assert a card from a **non-first** epic is
  visible. (This is the regression that would otherwise silently return.)
- Clicking an epic row filters; clicking it again restores all tasks.
- A `?item=` deep link opens the dialog **without** filtering the board.

`RoadmapCard.test.tsx`
- Epic chip renders when `epic` is passed, absent when it is not.

## Definition of done

1. Every test above green: `pnpm exec vitest run apps/web/features/roadmap --project web-components`.
2. i18n parity green: `pnpm exec vitest run --project web`.
3. `pnpm exec prettier --write` + `pnpm exec eslint --fix` on each touched file.
4. `tsc -p apps/web/tsconfig.json --noEmit` clean.
5. One commit: `feat(roadmap): board shows all tasks until an epic is selected`.

## Out of scope

- Any change to `readiness()`/`isBlocked()` or the column set.
- Blocker chip presentation (126f).
- Persisting the selection to the URL — `selectedEpicId` stays component state.
