# Chat reachability audit (F9)

Answers the question the whole HUD → Chat UI migration arc exists for: **can the
operator run the whole system from `/chat`, without ever jumping out of the new
design?** Every surviving route (`apps/web/app/(dashboard)/**/page.tsx` plus the
root redirect) is listed below with how the operator actually reaches it, live-
verified at 1680px on 2026-07-19 against the running dev app (`pnpm web:dev` +
`pnpm api:dev`, both already up).

Legend: **dock** = `ChatToolDock`'s 11 icons + Settings · **palette** = ⌘K
(`ChatPalette`) · **drawer** = a subsystem orb's `SubsystemDrawer` tabs
(Roster/Aktivita/Nastavení & Gates/Artefakty) · **link** = a link/button on
another page already reached by one of the above · **dialog** = opened
in-place over `/chat` with no route change at all (the best case — content
without leaving the design).

## Root / home

| Route     | Reached via                                                                                                                                                                                                        | State                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| `/`       | n/a — hard redirect to `/chat`                                                                                                                                                                                     | ✅                        |
| `/chat`   | home; sidebar `BrandLogo`/⌘·Ctrl+J from anywhere                                                                                                                                                                   | ✅                        |
| `/archiv` | `ChatTasksPanel` gutter's own "Archiv · N" link (live: "Archiv · 22"); also `AktivitaTab`'s "all runs" link and `ArtefaktyTab`'s per-artifact provenance link (`/archiv?run=`), both inside every subsystem drawer | ✅                        |
| `/runs`   | redirect shim only (D17) — no UI links here anymore; kept alive for old transcript links (`?run=`)                                                                                                                 | ✅ (deprecated by design) |

## Catalog list + detail pairs (all confirmed: dock icon → list → row click → detail)

| Section     | List route     | Detail route                                                                     | Dock icon         | Extra path                                                                                                                                       |
| ----------- | -------------- | -------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Companies   | `/companies`   | `/companies/[id]`, `/companies/new`                                              | ✅ "Firmy"        | list header's Add action → `/companies/new`                                                                                                      |
| Projects    | `/projects`    | `/projects/[id]`, `/projects/new`, `/projects/[id]/integrations/[integrationId]` | ✅ "Projekty"     | list header's Add action → `/projects/new`; project's own integrations panel → nested integration detail                                         |
| Agents      | `/agents`      | `/agents/[id]`                                                                   | ✅ "Agenti"       | subsystem drawer **RosterTab** card → `/agents/[id]`; ⌘K palette agent pick → **dialog**, no route change                                        |
| Pipelines   | `/pipelines`   | `/pipelines/[id]`                                                                | ✅ "Orchestrace"  | subsystem drawer **RosterTab** renders owned pipelines inline (canvas, no navigation) + "Přidat pipeline"; ⌘K palette pipeline pick → **dialog** |
| Chains      | `/chains`      | `/chains/[id]`                                                                   | ✅ "Řetězce"      | subsystem drawer **RosterTab** card → `/chains/[id]`                                                                                             |
| Skills      | `/skills`      | `/skills/[id]`                                                                   | ✅ "Skilly"       | —                                                                                                                                                |
| Commands    | `/commands`    | `/commands/[id]`                                                                 | ✅ "Příkazy"      | —                                                                                                                                                |
| MCP servers | `/mcp`         | `/mcp/[id]`                                                                      | ✅ "MCP servery"  | —                                                                                                                                                |
| Hooks       | `/hooks`       | `/hooks/[id]`                                                                    | ✅ "Hooky"        | —                                                                                                                                                |
| Automations | `/automations` | `/automations/[id]`                                                              | ✅ "Automatizace" | —                                                                                                                                                |

Live-verified one full hop: dock "Orchestrace" → `/pipelines` (8 pipelines
listed) → clicked the "Content Campaign" row → landed on
`/pipelines/content-campaign`. The other nine pairs were confirmed at the code
level (`router.push(`/<section>/${id}`)` wired to each list's row-select
callback) rather than clicked individually — same recipe, same DS list
pattern, all mechanical F3–F6 conversions per `docs/hud2chat/PROGRESS.md`.

This closes every gap the original audit (`docs/web/hud-to-chat-migration-gap.md`)
flagged as "no UI trigger at all" — `/automations`, `/automations/[id]`,
`/hooks`, `/hooks/[id]`, `/companies/[id]`, `/companies/new`, `/projects/new`,
the nested integration route, `/commands/[id]`, `/mcp/[id]`, `/skills/[id]` —
all now reachable.

## Single pages

| Route       | Reached via                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings` | dock's "Nastavení systému" icon (below the divider, always last)                                                                                  |
| `/memory`   | dock's "Paměť" icon; `ArtefaktyTab` (every subsystem drawer) links out too; ⌘K palette's memory section navigates here on a non-blank query match |

## `/gates` — the one finding

**`/gates` (the standalone "global policy floor" route) is not reliably reachable
from Chat today, and right now, live, it is reachable by literally nothing.**

D15 recorded three paths: Settings, ⌘K, and every subsystem drawer. Re-verified
live in this phase, precisely, and the picture is narrower than that summary
suggests:

1. **Settings' "gates" tab** (`/settings?tab=gates`) and **every subsystem
   drawer's "Nastavení & Gates" tab** both render the _same_ `GateRulesSection`
   component `/gates` itself renders (D14) — confirmed live on the Maestro
   drawer (locked system floor + rule catalog, identical chrome). But neither
   one **links to the `/gates` URL** — they reproduce its content in place, on
   a different route (`/settings`) or no route at all (the drawer is an
   overlay on `/chat`). The operator never needs the literal page, but they
   also never arrive at it this way.
2. **⌘K's "gates" section** is the only thing that actually calls
   `onNavigate("/gates")` (`ChatPalette.tsx`) — but its items are the
   **pending-approvals list**, not the rules catalog: `gatesSection.items`
   filters `useApprovalsQuery()`'s results, and `SearchMenu` "skips empty
   sections" (its own doc comment). Live-checked against the running API
   (`GET /api/approvals`): 59 approvals on file, **0 with `status: "pending"`**
   right now. With zero pending approvals, ⌘K's gates section has zero items,
   so there is nothing to click — confirmed live by opening the palette and
   searching (empty query shows nothing at all pre-existing behaviour; typing
   a query that matches agents/pipelines/memory shows those sections, but no
   "gates" section ever appeared, because no approval matched and none exist).

So in the **current, idle-demo state of this environment**, there is no click
path from `/chat` to `/gates` at all. The moment a gated action produces a
pending approval, ⌘K's gates section reappears and restores the one working
path — this is a live-data-dependent gap, not a broken link, which is exactly
the kind of thing a static code read would not catch (this is why the brief
asked to re-verify D15 rather than trust it).

**This is not something F9 should silently patch.** Fixing it is an
`ChatPalette`/`ChatToolDock` product decision (add a permanent gates entry
regardless of approval state, or accept the conditional reachability as
D15 intended and document the caveat) — flagging it for the operator, per the
brief's "wire it up or justify why it is deliberately indirect." Left
unpatched in this phase; noted here as the deliverable's one real finding.

## Correction to F9's own brief

The brief listed `overview.*` in `cs.json`/`en.json` as "dead with the page"
(carried over from the F8d handoff). Live grep across `apps/web` shows this is
wrong — the namespace is **very much alive**: `ChatLiveLog`, `BriefingMessageCard`,
`BriefingRows`, and `healthPresentation` all read `overview.*` keys today (the
namespace name is a historical artifact of F8c's relocation — the strings moved
with the code, the JSON key prefix didn't). **Not touched.** This is exactly the
"a previous orphan claim didn't survive the code moving" case F8c/F8d's own
history warned about, and the brief itself flagged it as something to verify
before acting.

## Summary

- Every route the original audit called fully orphaned is now reachable.
- Every catalog list↔detail pair follows one consistent recipe: dock icon →
  list → row click → detail; `/new` and nested routes hang off a list's own
  header action or a detail page's own panel.
- `/gates` is the one deliberately-off-dock route (D15) whose remaining
  reachability path is data-dependent and, right now, empty — flagged above,
  not fixed in this phase.
- `overview.*` i18n is alive and was incorrectly listed as an orphan in this
  phase's own brief — left in place.
