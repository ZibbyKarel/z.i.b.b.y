# Phase 40 — CommandLine command bar on Overview (line 33, part 31b)

> TODO (line 33): _"…Tuto komponentu pak použijeme v NewTaskDialog, na Overview (viz
> design) a v rámci chat UI."_ Last part of line 33 — the Overview use. (31a restyle,
> 31c chat, NewTaskDialog: done.)

## Goal

Put the unified `CommandLine` on `/overview` as a prominent command bar (task launcher),
matching velin-b's `VbCommandBar` placement — near the top, right after the status
header, so the operator can fire a task in natural language straight from the HUD home.

## Design reference

`design/Z.I.B.B.Y/zibby/velin-b.jsx` → `VelinBBody` renders `<VbHero/>` then
`<VbCommandBar accent=.../>` (the command bar sits directly under the status hero). The
CommandLine already implements the VbCommandBar look (Phase 31a: panel chrome + header
"Zadej směr · přirozeným jazykem" + hint, `@` mention, `+`/drag files, run
DropDownButton, suggestions). Also note `VB_SUGGESTIONS` in velin-b — a few example
prompts shown as chips when empty.

## Recon (verified)

- `apps/web/features/overview/Screen.tsx` is the composition file (separate from
  `SummaryWidget.tsx` — do NOT touch SummaryWidget). Render order: `<SummaryWidget/>`
  (~:114), then the two-zone Grid (~:119). Insertion point for the command bar = **right
  after `<SummaryWidget/>`** as the next child of the top-level `<Stack direction="col"
  gap="250">` (opened ~:112). (Phase 39 removed the Overview recent-activity block — build
  on that resulting file.)
- `CommandLine` (`features/tasks/components/CommandLine/CommandLine.tsx`) props: `chrome`
  (default true → the panel + header + hint), `suggestions?: string[]`, `showAck?`,
  task-launch is the DEFAULT mode (no `onSubmit`) → dispatches via `useTaskSubmit`,
  navigates to `/runs?run=` on dispatch. It reads the active project (Phase 24) for path
  folding.

## Approach

- In `Screen.tsx`, render `<CommandLine chrome suggestions={OVERVIEW_SUGGESTIONS}
  showAck />` (task-launch mode — no `onSubmit`) immediately after `<SummaryWidget/>`.
  `chrome` on (the Overview command bar wants the full panel + "Zadej směr" header, like
  velin-b). `showAck` on so the operator sees the classification ack after firing.
- Provide a short `OVERVIEW_SUGGESTIONS` list (a few natural-language example prompts, cs
  default via i18n — mirror velin-b's `VB_SUGGESTIONS` spirit: e.g. "Projdi backlog a
  implementuj highest-impact bug", "Sepiš standup za dnešek", "Prozkoumej téma X přes noc").
  Keep them as i18n keys (cs + en).
- Only the main-return branch needs it (the `isFresh`/loading/error early-returns don't need
  a command bar, though adding to the fresh state is fine if it reads well — keep it simple:
  main branch).
- All edits in `Screen.tsx` (+ i18n). Do NOT touch `SummaryWidget.tsx`.

## Files
- `apps/web/features/overview/Screen.tsx` (add the command bar)
- `apps/web/i18n/messages/{cs,en}.json` (suggestion strings)
- `apps/web/features/overview/Screen.test.tsx` if it asserts the composition (add a check
  the command bar renders)

## Verification
- `pnpm typecheck`, scoped lint (`npx eslint apps/web/features/overview` — never bare),
  `pnpm test` green modulo known pre-existing failures (confirm via `git stash`).
- Manual: `/overview` shows the CommandLine command bar under the status header; typing a
  task + Enter (or the run button) dispatches and navigates to /runs; suggestions show when
  empty; the active project scopes it.

## Constraints
- No forwardRef, no `any`, no inline DOM `style`. Don't touch operator WIP (SummaryWidget,
  machine.*, design/*). After this, TODO line 33 is fully done (mark it).
