# Phase 126 — decisions log

Append-only. Each entry: the call, the alternatives, why. A later session must read this
before reopening any of these questions.

---

## D0 — one branch, one commit per sub-phase

**Call:** the whole TODO arc lands on `feat/phase-126-todo-arc`, one commit per sub-phase,
never batched. Implementing subagents do **not** commit; the orchestrator reviews, then
stages that sub-phase's own paths.

**Why:** matches the phase-125 arc convention; keeps `git log` a readable record of which
operator-reported item each change answers, which is what makes recovery cheap. Agents run
concurrently in one worktree on disjoint file sets, so per-path staging is what keeps the
commits separable.

---

## 126a — GitHub ingest scope

### D6 — "ZIBBY opened it" comes from ZIBBY's own record, not `author:{username}`

ZIBBY opens PRs with the operator's credentials, so `author:` cannot distinguish a ZIBBY PR
from one the operator opened by hand. `ZibbyPrLocator.numbersFor(projectId)` already answers
this exactly (artifact registry ∪ directed tasks' `outcome.pr.url`) and is already used for
the same purpose by `ReviewCommentFetcher`. Reuse it; do not invent a second answer.

### D7 — no new config knob

The operator asked for a behaviour correction, not an option. `GitHubConfigSchema` is
unchanged. **`RoadmapSourceService` keeps its `assignee:` query deliberately** — roadmap
sync's question genuinely *is* "my work items". Different feature, different question; do
not "fix" it to match.

### D8 — the PR-number set is passed into `poll()`; the adapter stays DI-free

`AdapterRegistry` constructs adapters with plain `new`. Making the registry DI-aware would
drag `ArtifactsModule` + `ScheduledTasksStorageModule` into `ChannelsModule` and risk a DI
cycle this codebase has been bitten by before. Instead `ChannelWatcherService` — already
DI-constructed — resolves the numbers and hands them to `poll()` via an optional `ctx`.
Optional so every other adapter compiles untouched. Fail-open: a locator failure degrades
the poll's scope, never fails the poll.

---

## 126b — integration brand logos

### D3 — brand logos are image assets, not new `IconName` glyphs

The DS `Icon` is hard-locked to monochrome `stroke="currentColor"` and the design-system
SKILL.md forbids per-icon tests/stories — the registry is generic geometry by design. A brand
mark rides the `IconTile.src` image path that already exists for project logos. **Zero DS
change.**

### D4 — monochrome marks tinted for the dark tile, not official multicolour art

The app runs `theme="dark"`; GitHub's official `#181717` would be invisible, and an
`<img src>` cannot inherit theme tokens. Shape carries the recognition; exact brand colour
does not survive the dark surface anyway.

### D5 — committed static files, not an npm dependency

Fetched once from the Simple Icons CDN, checked in, provenance + refresh recipe in
`tools/brand-logos/README.md`. Avoids a ~15 MB devDependency for four static files.

### D17 — Slack keeps its generic glyph; no Slack mark ships

**Discovered during implementation, not planned for.** Simple Icons removed the Slack mark
from its registry after a trademark-permission request from Slack
([simple-icons#14140](https://github.com/simple-icons/simple-icons/issues/14140), labelled
"permission required"); `cdn.simpleicons.org/slack` 404s and there is no upstream CC0 asset
left. The implementing agent correctly **refused to hand-author** the path data rather than
producing a plausible-looking wrong mark.

`slack` therefore has no `KIND_LOGO` entry and renders its existing `plug` glyph through the
fallback that already exists for exactly this case. This is a real gap in the operator's ask
("Jira → Jira icon, GitHub → GitHub icon, atp."), left open deliberately: shipping an
approximated Slack logo would be worse than shipping none. Re-check the upstream issue before
adding one back.

---

## 126c — roadmap board default

### D1 — deselect by re-clicking the selected epic, not a synthetic "Vše" row

A synthetic row would have to fake a progress bar and status chip in `RoadmapEpicList`, which
renders a real `RoadmapItem` per row. Re-click-to-deselect keeps the list a list of real
epics. The selected row exposes `aria-pressed` so the toggle is discoverable to assistive
tech.

### D2 — in all-tasks mode each card gets an epic chip

Without it, two identically-named tasks from different epics are indistinguishable. Uses the
existing `epicHue` helper so the chip matches the epic's dot in the rail. Not rendered in
epic-filtered mode, where it would be redundant.

---

## 126e — `/archiv`

### D9 — fix by ordering, not by constraining the param

Moving the literal `archive` routes above `getTaskRun` is a pure reorder. A path-param
constraint excluding `"archive"` would encode the collision into the pattern and break again
the next time a literal sibling is added. The rule that generalises: **literal paths before
parameterised siblings.** Written into `docs/api/tasks.md` beside the route table, because
the doc already listed them in the correct order while the contract had silently diverged.

### D10 — the regression guard is an API-level test, not a contract key-order assertion

Asserting on object key order is brittle and tests the wrong thing. What must hold is that a
real `GET /api/tasks/runs/archive` resolves to the archive handler. Required red-before-green
evidence.

---

## 126f — blocked presentation

### D11 — "čeká" for one blocker, "blokován (N)" for several

The operator offered both words; making them mean singular vs plural spends the distinction
on information rather than picking one arbitrarily.

### D12 — tooltip content is composed from `blockers`, not a translated blob

Titles are data. Only the wrapper strings are i18n keys.

### D13 — no `Badge` component is introduced

`Chip` **is** this system's "colour = state" badge (its own docblock says so) and the roadmap
UI already uses it everywhere. A near-duplicate primitive for one label would be a DS change
smuggled in under a UI fix.

---

## 126g — subsystem orb attribution

### D14 — no new animation is added

The operator's wording is "as it is in the Velín-D design", and `ConnectorLayer`'s `imDash`
marching-ants stroke plus `HandoffFlare`'s comet are direct ports of
`design/Z.I.B.B.Y/zibby/velin-d-map.jsx`. Inventing a third continuous particle would diverge
from the named reference. The comms line is fixed by making `node.live` true for agent work —
a data fix.

### D15 — client and server must land in the same commit

`activeCount` (the dots) is computed client-side; `live` (the connector dash) comes from the
server's subsystem `state`. Fixing only one half produces a visibly inconsistent orb — dots
on a dark connector, or the reverse. Not splittable.

### D16 — goal-kind runs stay unattributed

No `ownerSubsystem` exists on any goal schema, and goal runs are explicit-target-only and
rare. Adding one is a contract change with its own blast radius. Recorded so the omission is
deliberate rather than forgotten.

---

## Superseded plans encountered

`docs/plans/phase-94-*`, `-101-*`, `-107-*`, `-117-*` all target the **retired WebGL scene**
(`apps/web/features/chat/scene/*`, `sceneController.ts`, `CosmicScene`, octagon geometry),
which no longer exists — it was replaced by a plain DOM/CSS scene under
`libs/design-system/src/immersive/**`. Do not resume them. `SystemConfigSchema.powerSaver`
survives from that era and is still editable in Settings, but **nothing in the current scene
reads it** — it is a dead knob.
