# HUD → Chat UI migration — decisions

Append-only. Each decision records the choice, the reason, and who made it.

## Operator decisions (2026-07-19, explicit)

**O1 — Navigation model: hybrid by weight.** Glanceable/live things dissolve into Chat UI
components. Heavy CRUD/config pages are rewritten into a new immersive full-page shell and
Chat links out to them. (Operator's own example: settings becomes a rewritten page that
Chat merely references.)

**O2 — Old HUD shell is replaced, then deleted.** Each migrated section moves to the
immersive shell; phase F10 deletes the non-chat `AppShell` branch, `MainLayout`, `Sidebar`,
`RightRail`. One world, no dualism. Visual breakage of the old HUD along the way is
accepted.

**O3 — Overview dissolves into:** (a) a status line in the topbar — what awaits the
operator; (b) limits + budget as a small chrome element in the topbar/dock; (c) the butler
briefing arriving as a **chat message**, not a page section. Explicitly _not_ chosen:
folding overview into the orb map / subsystems. `/overview` is deleted in F8.

**O4 — Archive is a full page** replacing the `/runs` list: all tasks, filters, sorted by
subsystem. The chat gutter keeps only an "Archiv · N" entry pointing at it.

## Architecture decisions (Opus, revisable at operator review)

**D1 — `ImmersiveShell` is a new DS component**, extracted per the design's sub-page chrome
contract (Archiv úloh): scene backdrop + a thin glass header (round back-to-orb button +
title + subtitle + right-aligned actions slot) + content frame. **No** orb map, dock, rail,
or bottombar — those belong to `/chat` only. It lives in
`libs/design-system/src/immersive/` beside `GlassSurface`, because it is generic chrome.
_Why not reuse `ChatScreen`'s backdrop directly:_ that code is bespoke and hand-assembled
inside a 394-LOC screen; extracting it is the only way to keep one visual language.

**D2 — AppShell gains a third mode, driven by a route table.** Today `isChat` is a single
hardcoded `pathname === "/chat"` check. F0 replaces it with an explicit route→mode table in
`apps/web/state/config.ts`, which each later phase appends to as its section migrates. This
makes the migration incremental and reversible per route, and F10 collapses the table once
the HUD branch is gone.

**D3 — Archive grouping: time buckets, subsystem as filter + a group-by switch.** The
design groups by time (`Dnes/Včera/Tento týden/Starší`) with subsystem as a colored dot plus
a multi-select filter; the operator asked for "sorted by subsystems". Both are satisfied by
a group-by toggle (Čas / Subsystém) defaulting to **subsystem**, keeping the design's
search + subsystem multi-select. Flagged for operator review at F2.

**D4 — Detail panes are reused, not rebuilt.** The design itself reuses the Velín-D task
detail body inside Archiv úloh ("stejný obsah … bez overlaye"). We do the same: `RunDetail`,
`PipelineCanvas`, `GateRulesSection`, `EntityHero` etc. are re-framed by the new shell, not
rewritten. Migration = chrome swap + layout, not a domain-logic rewrite.

**D5 — `PageContainer`/`PageHeader` are retired gradually.** Each migrated page swaps
`PageContainer` + `PageHeader` for `ImmersiveShell`. `HudPanel` bodies stay initially and
are restyled toward `GlassSurface` only where the design calls for it — otherwise a
14-page migration turns into a 14-page redesign and stalls.

**D6 — Two-outlier warning.** `features/projects/ProfileScreen.tsx` (685 LOC, 8 panels) and
`features/pipelines/Screen.tsx` (431 LOC, canvas) dominate effort. They are scheduled late
(F5/F6) on purpose, after the shell has survived a dozen simpler pages.

**D7 — `HudPanel` gains a glass variant instead of being replaced.** Migrated pages need
the `/chat` glass language, but `GlassSurface` is an untitled styled wrapper while
`HudPanel` renders title/padding structure that ~40 call sites rely on. Swapping them
page-by-page would be a rewrite, not a migration. Instead `HudPanel` gets a
`surface: "hud" | "glass"` prop (default `"hud"`, so nothing changes) and migrated pages
pass `surface="glass"`. One DS change unlocks every later phase, and F10 can flip the
default. _Rejected alternative:_ mechanically replacing `HudPanel` with `GlassSurface` —
impossible without reimplementing the title/padding contract at every call site.

**D8 — Subsystem attribution only exists for pipeline and chain runs.** `TaskRun` has no
subsystem field; the join is `run.owner` → `Pipeline.ownerSubsystem` / `Chain.ownerSubsystem`
(this is exactly what `AktivitaTab` does client-side). Agent-kind and goal-kind runs
therefore have **no** subsystem and will fall into a "bez subsystému" group on the archive
page. This is a pre-existing data-model fact, not something F2 introduces. Flagged for the
operator at F2 — the alternative (attributing agent runs to a subsystem) is a contract
change, out of scope for this arc.

**D9 — The archive page inherits `ChatTasksPanel`'s split rule, not a fourth vocabulary.**
Three status groupings already coexist: `RUN_STATUS_GROUPS` (project tiles),
`FILTER_BUCKETS` (runs header segments), and `ARCHIVED_STATES` + `taskRank`
(`ChatTasksPanel` gutter). The archive page is the gutter's "see all" surface, so it uses
the gutter's rule — `ARCHIVED_STATES = {done, error, interrupted, parked}`, with
`paused-limit` deliberately staying _active_ because it auto-resumes. Do not invent a
fourth grouping.

**D10 — `HudPanel` is an app composite, not a DS component.** It lives at
`apps/web/components/HudPanel/HudPanel.tsx`, built from `Card`/`Container`/`Stack`/
`Typography`, and is not exported from `libs/design-system`. The DS SKILL.md line listing it
among DS generic components is **stale** — do not trust it. D7's `surface` prop therefore
landed in `apps/web`, and no new DS component was required.

**D11 — A full-bleed band uses `GlassSurface radius="none"`, not `"panel"`.** Rounded corners
on an edge-to-edge band read as a floating card. `ImmersiveShell`'s header additionally drops
its side and top borders so only the bottom hairline survives, matching the design's Archiv
úloh header (literally a `borderBottom` rule). Caught only by live browser verification —
jsdom cannot see it, and it does not reflect longhand `borderTop` set after the `border`
shorthand either, so that assertion lives in the browser, not the test.

**D12 — Migrated pages must re-supply their own content padding.** `MainLayout`'s `<main>`
used to wrap every page in `padding={["300","350"]}`. `ImmersiveShell`'s body has none by
design (a master/detail page like the archive wants to touch the edges), so each migrated
page adds its own padding wrapper. Miss this and panels butt straight against the header.
