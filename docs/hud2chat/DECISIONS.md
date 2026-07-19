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

**D13 — The `ImmersivePage` header duplicates `EntityHero`'s name and description on entity
detail pages. Deferred deliberately to one pass after F6.** Live-verified on
`/agents/architect`: the thin glass header shows the agent's name, and the hero band
immediately below repeats the name as a heading plus the full description. The two read as
distinct bands (thin bar vs. tall image panel), so it is not a doubled toolbar — but the text
is genuinely duplicated. `EntityHero` is shared by four surfaces (`agents/DetailScreen`,
`pipelines/Screen`, `runs/RunDetail`, `chat/ChatDetailDialog`), and F5/F6 add more consumers,
so changing it now means changing it twice. **Do not patch this per page.** After F6, take it
as one decision with full knowledge of every consumer — the likely shape is suppressing the
immersive header's own title when a hero follows, or giving the hero a "compact" mode.

**D13 — RESOLVED in F6b (`9df0f1e8`).** `EntityHero` gained `showIdentity?: boolean`,
defaulting to `true`. `agents/DetailScreen` and `pipelines/Screen` — the only two whose page
header already carries the identity — pass `false`, leaving the hero a bare image/glyph band.
The two "do not touch" consumers turned out to be **structurally** immune, not just untouched:
`RunDetail` and `ChatDetailDialog` supply their own overlay via `children`, which the prop
does not affect at all. Neither the header-suppression nor the hero-"compact" shape sketched
above was needed.

**D14 — `GateRulesSection` takes the same additive `surface` prop as `HudPanel` (D7).**
Decided in F7 with all three consumers visible, which is why every earlier plan forbade
touching it. It renders its own chrome (two `HudPanel`s plus `SystemFloorPanel`), so the
choice was fork-vs-thread; threading a `surface` defaulting to `"hud"` keeps the third
consumer — `GatesTab` inside the Chat UI's subsystem drawer, which is **not** part of this
migration — pixel-identical, while `/gates` and the Settings tab opt into glass. The prop is
forwarded to `SystemFloorPanel` so the floor and the catalog beneath it can never disagree.

**D15 — `/gates` stays out of the Chat dock.** Every earlier phase added its section to
`ChatToolDock`'s `DOCK_IDS` as a one-liner; `gates` is the exception. It lives in
`ROUTE_ONLY_ITEMS`, not `NAV_ITEMS`, and the dock resolves `DOCK_IDS.map(id =>
NAV_ITEMS.find(...)).filter(...)` — so a `DOCK_IDS` entry alone would silently resolve to
`undefined` and vanish. Promoting it would mean a `NAV_ITEMS` entry, i.e. declaring gates a
primary destination, which it is not: it is reachable from Settings, from ⌘K, and from every
subsystem drawer. Re-verify this in F9 rather than assuming the sweep will flag it.

## F8 operator calls (2026-07-19)

**O5 — Limits are already done; budget stays with projects.** O3(b) said "limits and budget
into the topbar/dock", but grounding showed `LimitsRings` is _already_ mounted in
`ChatTopBar`, and "budget" on `/overview` does not exist — it is per-project data
(`useBudgetQuery`) living beside project and run cards. The operator's call: treat O3(b) as
substantially already satisfied, leave budget where it is meaningful, and add **no** new
global spend aggregation. F8 therefore has no limits/budget workstream.

**O6 — The briefing becomes its own message variant, contract-first.** `ChatRoleSchema` is
`z.enum(["user","assistant"])` — there is no third role, and the briefing is structured
(headline, "needs you" rows with links, subsystem lines, engagements, counters). Serialising
it to plain assistant markdown would have been free but would have flattened those rows into
prose. The operator chose the contract change: extend `ChatMessage` with a briefing payload
and render it as a distinguishable card in the transcript, preserving the links. This makes
F8 the first phase in the arc to touch `libs/contracts` and `apps/api`.

**D16 — `features/overview/` cannot be deleted wholesale; its activity module must be
relocated first.** `activityLog.ts`, `useActivityFeedInfiniteQuery`, `useActivityQuery` and
`ActivityFeed/` sit under `features/overview/` but are **not imported by the overview screen
at all**. Their real consumers are `RightRail`, `features/chat/ChatLiveLog` and
`ProjectIntegrationActivityPanel` — one of which is Chat UI itself. Deleting the folder with
the page would break the live log in the destination design. Relocate to `features/activity/`
as the first step of F8.

**D17 — `/runs` gets a redirect shim, not a hard delete.** `apps/api`'s
`chat-session.service.ts` bakes `href: /runs?run=<ref>` into the `ChatToolEvent` of every
`create_task` turn, and those events are **persisted in transcript JSONL**. Deleting the route
would break links inside chat history already on disk, which no frontend change can rewrite.
So `/runs` becomes a redirect to `/archiv` preserving `?run=`, the API stops minting `/runs`
links going forward, and the shim stays until old transcripts age out. The same applies to
`useTaskSubmit`, which pushes `/runs?run=` after **every** task dispatch app-wide — that one
is a live code path and gets repointed properly, not shimmed.

**D18 — `BriefingCard`'s row sub-components must survive F8c's deletion.** F8a's
`BriefingMessageCard` deliberately reuses `NeedsYouRow`, `SubsystemLineRow` and
`BriefingCardTestId` by importing them from
`features/overview/components/BriefingCard/BriefingCard.tsx` rather than re-implementing the
layout. That is the right call for F8a, but it means `features/overview/` now has a **second**
Chat-UI consumer beyond the activity module of D16. F8c must relocate these sub-parts (to
`features/chat/` or a shared home) before deleting the overview folder — a straight `rm` breaks
the briefing card inside the chat transcript, i.e. the very thing F8a just built. Note the two
components share `BriefingCardTestId`; they never co-render today (`/overview` vs `/chat`), but
once `BriefingCard` is gone the enum should move with the rows.

**D19 — `features/overview/` is a shared module with a page on top; F8c dissolves it, it does
not delete it.** D16 and D18 each found one surviving consumer; a full grep found **seven**
files outside the folder importing from it, and only `RightRail` (which dies in F10) is
disposable. The survivors are `chat/ChatLiveLog` (`activityLog`, activity queries),
`chat/StatusPill` (`healthPresentation`, added in F8b), `chat/BriefingMessageCard` (briefing
row sub-components, added in F8a), `projects/ProjectIntegrationActivityPanel` (`ActivityFeed`),
`runs/runEvents` (activity + briefing query keys) and `notifications/useNotifications`
(`useBriefingQuery`). Three of those are Chat UI itself — the destination design.

So the folder is really three shared modules — **activity**, **briefing** and **health** —
with `Screen.tsx` and its panels sitting on top. F8c's order is therefore: relocate the three
modules to their own homes, repoint every import, and only then delete the page and its
panels. A `git rm -r features/overview` at any point breaks Chat UI.

**D20 — Verify with exit codes, not with output text.** The `rtk` filter prints
`TypeScript: No errors found` while passing a non-zero exit status through, so a failing
typecheck reads as a pass. This masked a real pre-existing `libs/design-system` failure
(TS6059) for the entire arc, and in F3 it led me to overrule a subagent who was right —
that log entry is corrected in place. Run tooling raw (`rtk proxy npx tsc -p <proj> --noEmit`)
and check `$?`. Fixed in `b33e8db5`, but the verification habit is the durable part: an
orchestrator who checks subagents with a lying command is worse than one who does not check.

**O7 — Remove both dead chrome affordances; the topbar goes to four elements (2026-07-19).**
F8d left the topbar's "switch to HUD" icon and the chat "close" button both pointing at
`/chat` — the page the operator is already on. The operator's call: delete both. The
five-element topbar was a deliberate contract from an earlier arc, but it was written when
there was a HUD to switch _to_; F10 deletes that world entirely, so the icon is definitionally
meaningless and a control that navigates to the current page is broken rather than minimal.
The topbar becomes: status pill · ⌘K search · limits · language. Executed in F9, alongside the
orphan sweep.

**D21 — F8d's "no UI trigger" findings were two claims, not one, and only one was real.**
Worth recording because the framing nearly cost a capability. The subagent reported that both
on-demand briefing generation _and_ channel-kind approvals lost their UI trigger with
`/overview`. Checking each: `useGenerateBriefingMutation` genuinely had **zero callers** — a
real regression, closed in F8e. Approvals were **fine**: `StatusFlyoutPanel` calls
`useApprovalsQuery()` unfiltered, so every approval kind is still reachable from the status
pill, and the e2e workaround the subagent hit was about the deleted `ApprovalsPanel` being a
convenient test handle, not about operator reachability. Two findings bundled into one sentence
had different truth values — check each separately, especially when one touches the approval
path, which is a stated law of this system.
