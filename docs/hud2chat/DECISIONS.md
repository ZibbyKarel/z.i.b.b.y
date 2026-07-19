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
