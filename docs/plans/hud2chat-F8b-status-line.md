# F8b — The status line: subsystem health into the Chat topbar

Part of the HUD → Chat UI migration. Read `docs/hud2chat/DECISIONS.md` (**O3, O5**) and
`docs/hud2chat/ROADMAP.md` first.

## Why this is smaller than it sounds

O3 dissolved `/overview` three ways. Two of the three are already done:

- **Briefing** → F8a (`74b4f7f2`), now a chat transcript message.
- **Limits/budget** → **nothing to do (O5).** `LimitsRings` already ships in `ChatTopBar`, and
  "budget" was never on `/overview` — it is per-project data (`useBudgetQuery`) beside project
  and run cards, and the operator's call is to leave it there. **Do not build a global spend
  aggregation.** If you find yourself adding an endpoint, you have misread this phase.

That leaves the status line, and even that is partly built. `StatusPill` +
`StatusFlyoutPanel` (`features/chat/components/`) already show running runs (`useRunsQuery`)
and pending approvals (`useApprovalsQuery`) — which is exactly the "running agents" and
"approvals" half of `/overview`'s `SummaryWidget`, plus the whole of its `ApprovalsPanel`.

## The actual gap

Compare `features/overview/SummaryWidget.tsx` against what the pill/flyout show today. What is
**not** yet represented in Chat:

1. **Overall system health** — `useHealthQuery` + `deriveHealthPresentation` produce a status
   dot, a label and a detail line (connected / degraded / …). The pill today derives its state
   from `useSubsystemsQuery` counts only, so a degraded backend is currently invisible in Chat.
   This is the highest-value item in the phase: it is the one thing that can be *wrong* rather
   than merely absent.
2. **Per-subsystem health dots** — `health.subsystems`, rendered by `SummaryWidget` as a row of
   dots with labels.
3. **Catalog counts** — pipelines and skills totals (`usePipelinesQuery`, `useSkillsQuery`).

Item 1 is a genuine gap and must land. Items 2 and 3 are a judgement call, and **the judgement
is yours to make and justify**: the orb map on `/chat` already renders every subsystem with its
live state, so a second row of subsystem dots in the topbar may be pure duplication — and a
static count of how many skills exist is arguably not status at all. If you conclude either is
noise, say so with your reasoning and leave it out. A smaller correct topbar beats a faithful
port of a page we are deleting. Quiet competence is the product goal; do not turn the topbar
into a dashboard.

## Constraints

- **The topbar is a five-element contract.** A previous arc ("status flyout + topbar", commit
  `65af5c08`) deliberately fixed it at exactly five elements, 56px, each in its own
  `GlassSurface`. **Do not add a sixth element.** Health belongs *inside* the existing status
  pill and/or its flyout — that is the whole point of the pill. If you believe a sixth element
  is unavoidable, stop and report rather than adding it.
- That same arc hit a real bug worth not repeating: a portal `mouseleave` race, fixed with
  asymmetric `relatedTarget` guards. If you touch the flyout's open/close logic, re-verify
  hover-in, hover-out, and moving between the pill and the panel.
- `GATE-BUG` law: the flyout's approve/reject actions are real and must keep working. Do not
  regress the approval path while restyling around it.

## Out of scope
Deleting `/overview`, `SummaryWidget` or `/runs` — that is F8c, and they must keep working
until then. Any global budget/spend aggregation (O5). The briefing (done, F8a).
**Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY;
  `rtk pnpm typecheck` reports false success. Both known-clean; any error is yours.
- Scoped vitest (`web-components`, `@zibby/design-system`).
- **Live browser at 1680px on `/chat`:** the pill reflects real health; open the flyout by
  hover AND by keyboard focus; move the pointer between pill and panel without it flickering
  shut; confirm an approve/reject control still works. Report what you saw.
- Live data may be all-idle, which can make a status change unobservable. If so, say so
  explicitly and fall back to a jsdom test for the state you could not trigger — do not claim
  a live pass you did not get.
