---
title: North Star II — The Federation
type: vision
tags: [north-star, vision, federation, subsystems, zibby-dna]
created: 2026-07-17
status: active
related: [[north-star]], [[MEMORY]], [[knowledge/architecture]]
---

# 🎩 ZIBBY — North Star II: The Federation

> _"Not one butler. A bridge crew — and I am the captain who only decides."_

North Star I described **what** ZIBBY does: a single-operator agentic OS that stands
in for the operator on a delivery team. It is largely built — the delivery loop, the
channels, the gate floor, the memory loop all exist and work. North Star II describes
**how the system is organized** so it can carry that load across multiple engagements
without the operator ever having to hold the whole machine in their head.

The organizing idea already has a face: the **Velín** — eight subsystem orbs on the
chat map. Today those orbs are mostly a view. North Star II makes them the real
structure of the system.

---

## The Shift: From Monolith to Federation

Today ZIBBY is one brain with many limbs: a global classifier routes everything, a
global scheduler runs everything, a global briefing reports everything. The subsystems
(Forge, Puls, Sentinel, Maestro, Beacon, Scout, Herald, Loom) exist as an identity
registry and a derived status view — a UI grouping over the monolith.

The finished system inverts this. **Each subsystem is an accountable domain owner.**
The global layer shrinks to a switchboard, a gate floor, and a vault. The operator
talks to the Velín; the Velín talks to its subsystems; subsystems do the work.

A subsystem is real only when **removing it would break behavior, not just a screen.**

---

## The Subsystem Charter

Every subsystem must fulfil six duties. This is the definition of done for the
federation — any orb that cannot check all six is still scenery:

1. **Ownership is data.** Agents, pipelines, chains, channels, and monitors carry an
   `ownerSubsystem` tag in the contract. The roster is stored, never derived at
   render time. Every dispatchable unit has exactly one owner.
2. **A dispatch brain.** When work enters its domain, the subsystem decides which of
   its own pipelines or agents runs — with its own mandate-derived routing prompt and
   its own fallback policy. The global classifier only picks the subsystem; the
   subsystem picks the unit. An explicit operator target still overrides everything.
3. **An autonomy policy.** Each subsystem layers its own gate rules and tier defaults
   above the global floor — harden-only, never weaker. Herald's confidence threshold
   for auto-replies and Beacon's escalation shape are subsystem policy, not global
   constants.
4. **A memory shelf.** Each subsystem has its own MOC in the vault. Runs it owns are
   recorded and distilled onto its shelf; grounding for its runs starts there.
   Index-first, plain markdown, no vectors — unchanged DNA.
5. **Accountability.** "Co dělá Forge?" is answerable at any moment from the record:
   the briefing has a line per subsystem, the activity log is subsystem-tagged, and
   each orb's state on the map is backed by that same data.
6. **A heartbeat duty (watchers only).** Puls ticks channels and monitors. Loom
   periodically audits the codebase. Sentinel periodically scans dependencies and
   secrets. A watcher subsystem that never wakes on its own is not a watcher.

---

## The Chairs

The registry stands and the mandates become jobs — but the table grows. The audit
found two whole domains already running with no chair (memory and budget), and one
domain planned with none (personal life). The federation seats them deliberately:
a new chair is charter work, never an ad-hoc grouping.

- **Forge — Kovárna doručení.** Owns the delivery loop (Architekt → Kodér ⇄ Review →
  Tester → Dokumentátor), worktrees, checkpoints, and PR outputs. _Mostly built._
- **Puls — Tep systému.** Owns every inbound heartbeat: channel polling, calendar,
  CI/CD monitors, and the monitor seam (Sentry next). _Mostly built, needs ownership._
- **Herald — Hlas navenek.** Owns triage of inbound conversation and every outbound
  word: gated replies, comms style per project, the notify-only email posture — and
  its graduation, evidence-first. _Built as plumbing, not yet a voice with a policy._
- **Beacon — Maják v noci.** Owns escalation: the shape and priority of everything
  Tier-3, the approvals queue, the "needs you" section of the briefing. _Exists as a
  global queue; becomes the curator of the operator's attention._
- **Scout — Zvěd na cestách.** Owns research pipelines and artifact handoff chains
  ("research overnight → build from it"). _Machinery built (chains, artifact
  registry); needs its chair and its shelf._
- **Maestro — Dirigent vydání.** Owns release readiness: the merge queue, CI state per
  PR, changelog drafts, post-merge watch. The merge click is forever the operator's.
  _Empty chair today._
- **Sentinel — Strážce hranic.** Owns security posture: dependency CVE audits, secret
  leak scans on outbound artifacts, permission drift. _Empty chair today._
- **Loom — Tkadlec kvality.** Owns proactive code quality: scheduled architecture and
  dead-code audits (graphify, madge, knip), findings filed as proposals to Forge.
  _Empty chair today — but the tooling already exists in the repo._

**New chairs (seated by this vision):**

- **Codex — Paměť rodu.** Owns the second brain: the vault, grounding, run recording,
  nightly distillation, the MOC shelves, and retrieval. Memory stops being an organ
  without an owner — every note filed, every shelf accountable. _The machinery is
  built; the chair is new._
- **Ledger — Správce pokladny.** Owns budget caps, usage windows, token spend,
  limit-pause/resume governance, and the spend-past-cap gate. The federation's
  economist: it knows what every subsystem costs and says so in the briefing.
  _The machinery is built; the chair is new._
- **Hearth — Krb domova** _(seated later, with the personal domain)_. Owns the
  operator's personal life: quick capture, the daily note, personal MOCs, personal
  tasks — isolated from every project the way projects are isolated from each other.

---

## The Operator's Three Verbs

The finished federation narrows the operator's job to exactly three verbs:

- **Direct** — state an intent (or name a target — hard override, as ever).
- **Decide** — Tier-3 approvals, curated by Beacon so every decision is worth making.
- **Review & Merge** — the one irreversible click, prepared by Forge, staged by
  Maestro. Opening a PR is Tier-2 everywhere — one posture, no exceptions per runner;
  whether it opens as a **draft or a ready PR is the project's choice**, configured on
  the project profile.

Everything else — triage, routing, building, testing, watching, remembering,
reporting — happens inside the federation, on the record, under the floor.

---

## Trust Is Earned From the Record

The federation may only widen its autonomy with evidence. Herald does not start
auto-replying because a flag flipped; it starts when its ledger shows its drafted
replies were approved unedited N times in a row. Puls's adapters are trusted because
a live soak harness exercised them against real accounts, not only mocked transports.
Autonomy graduations are themselves Tier-3 decisions, proposed with the data attached.

---

## Second Brain, Whole Life

The vault stops being work-only. A **personal domain** joins the project domains:
quick capture from chat, a calendar-aware daily note, personal MOCs — isolated from
project grounding the same way projects are isolated from each other. One vault, one
graph, two lives, zero re-explaining.

---

## Unchanged Laws

Everything from North Star I still binds: files are the source of truth; the
contract comes first; approval-first is structural; the gate cannot be talked around;
`pr.merge` is a locked deny; index-first memory, no vectors; SSE for streams; explicit
target overrides the classifier; one interaction grammar; single operator.

The federation adds one law of its own:

> **Ownership is explicit.** Every unit of work belongs to exactly one subsystem, and
> every subsystem can account for everything it owns. No orphan agents, no derived
> rosters, no unowned heartbeats.

---

## The One Sentence

> ZIBBY II is a federation of accountable domain owners under one gate floor and
> one vault — and an operator whose whole job is to direct, decide, and merge.

---

_[[north-star]] · [[MEMORY]] · [[knowledge/architecture]]_
