# Phase 32 — Overview starter cards actually navigate (dead-affordance fix)

> Priority axis (LOOP.md): **#4 BUG** — a dead interactive element on the first-run
> screen. (The Phase-31 proposal "surface the briefing" was re-checked against real code
> and found to be a **non-gap**: `SummaryWidget` + `BriefingCard` already read the real
> `GET /api/briefing` and `ActivityFeed` shows live activity. Gap analysis against real
> code, not the proposal.)

## The bug

`overview/Screen.tsx` renders, on a **fresh** workspace (`isFresh` — no skills /
integrations / agents / pipelines), four "starter" cards: Skills, Integrations, Agents,
Pipelines. Each was wrapped in:

```tsx
<Pressable onClick={() => { /* navigation handled by links */ }}>
  <Card interactive …>…</Card>
</Pressable>
```

The `onClick` is an empty no-op and there are **no links** — the comment is wrong.
Clicking a starter does nothing. A swept check confirmed this is the only no-op `onClick`
in the web app. It is the first thing a new operator sees, and it's a dead end.

## Fix

`overview/Screen.tsx`: wrap each starter `Card` in a `next/link` `<Link href={`/${s.id}`}>`
— the same pattern `BriefingCard`'s `NeedsYouRow` already uses (`<Link href="/runs"
style={{ display: "block" }}>`; `Link` is a component, so `react/forbid-dom-props` does not
apply). The `STARTERS` ids — `skills`, `integrations`, `agents`, `pipelines` — are exactly
their dashboard route segments (per CLAUDE.md routing), so `/${s.id}` is the correct target.
Remove the now-unused `Pressable` import.

## Tests
`overview/Screen.test.tsx`: add a case with an **empty** workspace (all four catalog
queries return `[]` → `isFresh`), asserting the four starter cards render as links with
`href` `/skills`, `/integrations`, `/agents`, `/pipelines`. (The existing test mocks
integrations with data, so it does not render starters — add a fresh-workspace describe
with its own mocks, or query the rendered links by role/name.)

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).
