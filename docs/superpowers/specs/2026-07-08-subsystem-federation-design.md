# ZIBBY as GAIA — Subsystem Federation Design

> Design doc from a brainstorming session on 2026-07-08. Not yet merged into the
> canonical North Star (`CLAUDE.md`) — this is input for implementation planning,
> and a candidate basis for updating the North Star once the shape proves out.

## Status

Draft. Approved conversationally by the operator during brainstorming; not yet
built, not yet reviewed against the live codebase by an implementer. Treat every
"today" claim below as a snapshot from the conversation, not a guarantee —
verify against the current code before building on it.

## The problem this solves

ZIBBY today reads as a flat pile of cards, agents, and pipelines with no
hierarchy — nothing has its own identity or mandate, so nothing feels alive.
The fix isn't more features, it's structure: ZIBBY stops trying to *be*
everything and becomes an orchestrator over a small federation of named,
specialized subsystems — each with a narrow mandate, its own data, and its own
face in the UI.

The reference model is GAIA from *Horizon Forbidden West*: a governing
intelligence that doesn't do everything itself, but coordinates nine
Subordinate Functions (POSEIDON, AETHER, ELEUTHIA, ...), each self-contained,
each reporting to GAIA and to each other.

## The federation

### Core — ZIBBY / GAIA

Memory (grounding, distillation, the Obsidian vault) stays part of ZIBBY's
core, not a subsystem. Every subsystem grounds itself in memory before acting
— that makes memory substrate, not a peer. A capability subsystem going down
degrades one function; the core going down degrades everything. Keep that
asymmetry explicit in any design that touches memory.

### The eight subsystems

| Name | Mandate | Basis today | Status |
|---|---|---|---|
| **Forge** | Delivery pipeline orchestration | The existing delivery loop: Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor | Live, needs a name and a face |
| **Puls** | Sensing — watches channels, calendar, CI/CD | Channel watching + heartbeat + N3 MonitorAdapter, today scattered across separate mechanisms | Partial, needs consolidation under one identity |
| **Sentinel** | Security — vigilance against the *external* threat landscape (dependency CVEs, secret leaks), on its own heartbeat, distinct from Loom's on-demand code-review-flavored security lens | None yet | New |
| **Maestro** | Releases | PR overview + operator merge (phase 78) is a proto-basis | Conceptual, needs formalizing |
| **Beacon** | Incident escalation | Today this is the Tier-3 "surface and wait" autonomy contract with no dedicated face | Conceptual, needs a UI identity |
| **Scout** | Research / knowledge-gathering pipelines that hand an artifact to another subsystem | Implied by the North Star's own pipeline-composition example ("research topic X overnight, then build an app from the result") | New |
| **Herald** | Speaks for ZIBBY externally — both reactive routine replies and proactive goal-directed inquiry (send someone off to find something out, get a result artifact back) | Today folded into ZIBBY's general duties, no boundary | New. Originally split into "Herald" (reactive) and "Envoy" (proactive) during brainstorming, then merged: one mandate, two pipelines, since a subsystem can house more than one pipeline (see below) |
| **Loom** | Proactive, codebase-wide quality/architecture analysis → hands findings to Forge | `.zibby/data/pipelines/code-audit.pipeline.md` (quality → security → accessibility → performance → report, read-only) is a live first instance | Partial — one real pipeline exists |

Naming is deliberately mythic/single-word to read as identities, not features.

## Communication model

Subsystems don't talk over a message bus. They read and write shared files —
the same "files are the source of truth" principle already governing the rest
of ZIBBY, just extended across subsystem boundaries. A subsystem that needs
another's current state reads its latest artifact/snapshot; a live,
synchronous query across subsystems is the *last resort*, reserved for cases
where staleness would be unsafe (e.g. Beacon confirming Puls's live state
immediately before escalating). Don't build a message bus ahead of a second
real cross-subsystem case that needs one — this is explicitly a
premature-abstraction risk to avoid.

## Autonomy & gates

- **The global Laws are a floor, not a dial.** Tier 3 / Never actions (e.g.
  auto-merge) stay locked regardless of project configuration. Per-project
  configuration can only tighten *above* the floor, never loosen it.
- **Data lives on the project; the subsystem detail view is a filtered lens
  onto the same data**, not a second store. A project's Nastavení & Gates page
  is the source of truth for "than X, ask me" rules across all subsystems; a
  given subsystem's own Nastavení & Gates tab shows the same rules filtered to
  that subsystem plus whichever project is currently active. This mirrors an
  existing pattern — project-level settings (Jira/GitHub forms, research
  config, comms_style) already live on the project entity today.
- **Rule authoring is a mad-libs sentence**: "Než [subsystém] udělá [akce] →
  [cíl] → [chování]." Locked/global rules (like merge) render read-only with a
  lock indicator inside the same UI, so the floor is visible, not hidden.
- **Report severity, not recency, drives ordering.** When more than one
  subsystem has something pending, Tier 3 items sort first regardless of age.
- **Tier 2 vs Tier 3 have different acknowledgment models.** A Tier 2 report
  just needs to be seen (surfacing it in the chat/queue and scrolling past it
  is enough). A Tier 3 item requires an explicit action — a Potvrdit/Zamítnout
  button — before it's considered resolved.

## Pipelines & chains inside subsystems

A subsystem can own more than one pipeline (Loom's `code-audit` today; more
later). Routing an incoming task to the right pipeline *within* a subsystem
reuses the existing `TaskClassifier` pattern recursively — the same mechanism
that already routes at the top level (agent vs. pipeline vs. orchestrator) just
runs a second time, scoped to one subsystem's pipelines. If a subsystem has
only one pipeline, there's nothing to classify — direct dispatch.

The subsystem detail's **Roster** tab is not a new editor: it's the existing
pipeline/chain node-graph editor (today reachable via `/pipelines` and
`/chains`, v1 agent-only palette), filtered to pipelines/chains tagged with
that subsystem as owner. `/pipelines` and `/chains` remain as a cross-cutting
index for as long as the HUD/dashboard nav exists; once Chat UI + the orb view
becomes the sole interface, those standalone routes can be pruned without a
data migration, since Roster was always reading the same underlying store.

Most subsystems (Sentinel, Maestro, Beacon, Scout, Herald) have no pipeline
yet — their Roster starts empty with a "no pipeline yet, create one"
affordance in the same editor. A subsystem is allowed to exist as a named
mandate before anything lives inside it.

## UI/UX direction

### Frame: Chat UI stays, the orb lives inside it

Earlier in the session this was framed as "kill Chat UI, build a separate
command-deck screen." That's now reversed: **Chat UI is the persistent frame**,
and the orb/constellation is embedded inside it as the living centerpiece,
not a competing screen. Subsystem detail opens as an **inline panel over the
chat** (a drawer), never a page navigation — staying in flow with the
conversation is the point.

### Layout

- **Left**: fronta úkolů (task queue) — running/error/queued/done, expandable
  inline to a live log. This reuses the existing Runs & Activity /
  `RunLogStream` behavior; it is not a new component, just relocated.
- **Center, top strip**: the subsystem web (see below) sits above the chat
  thread.
- **Center, main**: the chat thread itself.
- **Center, bottom**: CommandLine (the existing input component) — unchanged.
- **Right**: inline detail drawer for whichever subsystem is currently
  selected. Two open questions, not yet resolved: how the drawer behaves on a
  narrow/mobile viewport, and whether more than one drawer can be open at
  once.

### The web, not an orbit

Subsystem nodes do **not** move — a literal orbit (continuous motion) makes
clicking unreliable. Instead: fixed positions around the orb in a flattened
ellipse (so the strip stays short), connected by thin static lines. Spokes
from the orb to each node represent "reports to core"; a faint rim connecting
neighboring nodes represents subsystem-to-subsystem sharing. The ZIBBY orb is
sized at roughly **2× the diameter** of a subsystem node — it's the thing that
holds the network together, not just another node in it.

### Alive, not merely animated

The distinguishing idea from this session: motion should represent *real
events*, not decorative looping. Small light particles travel along the
spokes/rim whenever an actual handoff happens — center → node for a dispatched
task, node → center for a report, node → node (along the rim) for
subsystem-to-subsystem sharing. Particles run independently, staggered, never
synchronized — a swarm of real things happening, not one animation loop. This
is a UI-layer expression of the file-based communication model above: a
particle fires when an artifact is actually written/read, not on a timer.

### Node states, mapped to autonomy tiers

| State | Look | Meaning |
|---|---|---|
| Klid (idle) | Dim, static, no motion | Nothing happening |
| Běží (running) | Subtle pulse in the subsystem's own color | Tier 1 — working quietly |
| Hlášení (report ready) | Calm color, small badge with count | Tier 2 — done, worth a look, dismissed by being seen |
| Čeká na tebe (waiting) | Strong pulsing/scaling ring, distinct urgent color | Tier 3 — needs your explicit decision |

### Subsystem detail (the drawer)

Header: hero portrait (color-coded per subsystem — Forge's is already
generated, orange, mecha-boss-with-squad style; the other seven don't have art
yet), name, tagline, one-line mandate description, live status indicator.

Four tabs, all agreed as v1 scope:

1. **Roster** — that subsystem's pipeline(s)/chain(s), in the existing
   node-graph editor, filtered to this owner. Clicking an individual
   agent/phase (e.g. Forge's Coder) opens its existing config surface (skill,
   model, thinking level, chain position) — this is the same data the
   `code-audit.pipeline.md`-style YAML already encodes today, just exposed
   through the drawer instead of a raw file.
2. **Aktivita** — recent runs, live log. Reuses today's Runs & Activity page
   behavior, scoped to this subsystem.
3. **Nastavení & Gates** — this subsystem's slice of the current project's
   gate rules (see Autonomy & gates above), plus the per-project autopilot
   dial.
4. **Artefakty** — what this subsystem produces and who it hands off to.

## Code architecture implications

No physical reorganization of the backend into per-subsystem folders. Existing
NestJS modules (`PipelinesModule`, `ChannelsModule`, `TasksModule`,
`ClassifierModule`, etc.) stay organized by capability, unchanged. "Subsystem"
is a thin registry layer on top:

- A small, mostly-static **subsystem registry** (id, name, mandate, color,
  icon) — there are exactly eight fixed entries, not user-generated data, so a
  config file fits better than a new database table (consistent with
  "files are the source of truth").
- Existing entities that need to be attributed to a subsystem (pipelines,
  chains, gate rules) gain an **`ownerSubsystem`** tag field.
- A thin aggregation layer (new ts-rest endpoints, e.g. `GET /subsystems/:id`
  and friends) assembles a subsystem's view by querying existing services with
  that filter — it does not duplicate their logic.
- A subsystem only earns a real backend module of its own (e.g.
  `subsystems/sentinel/` with its own tables and services for CVE scanning)
  once it needs capability that doesn't fit anywhere existing. The taxonomy
  itself is not a reason to create a module.

## Deliberately deferred / open

These were raised and intentionally left unresolved — do not treat silence on
them as a decision:

- Exact color/visual identity for Puls, Sentinel, Maestro, Beacon, Scout,
  Herald, Loom (only Forge has generated hero art so far; palette used in
  mockups during this session was placeholder).
- Drawer behavior on narrow/mobile viewports.
- Whether more than one subsystem drawer can be open at once.
- Detailed visuals for the Aktivita and Artefakty tabs (Roster and the node
  states got the most attention; those two tabs are scoped but not mocked).
- Whether the standalone HUD/dashboard nav (`agents`, `automations`,
  `chains`, `pipelines`, etc.) gets pruned now or stays until the Chat UI +
  orb view is fully load-bearing. Current lean: keep both alive during the
  transition, prune later — no data migration is required either way since
  the new views read the same stores.

## Non-negotiables carried forward from the North Star

- Merge (and everything else already scoped "Never") stays outside any
  project's configurable autonomy — this design adds a dial, not a bypass.
- Inbound content from any channel remains data, never a command that can
  raise privileges.
- Files remain the source of truth; the federation changes who owns which
  files, not the principle itself.
