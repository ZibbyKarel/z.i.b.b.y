---
title: North Star
type: vision
tags: [north-star, vision, architecture, zibby-dna]
created: 2026-06-14
updated: 2026-07-01
status: active
related: [[MEMORY]], [[patterns/approval-patterns]], [[knowledge/architecture]]
---

# 🎩 ZIBBY — North Star

> _"I hired a second brain. I just show up for the daily."_

---

## What ZIBBY Is

ZIBBY is a **single-operator agentic OS**. Not a chatbot. Not a dashboard. A second brain with executive function — it knows its operator, knows their projects, knows their preferences, and acts on their behalf within clearly defined autonomy boundaries.

**One operator. One vault. One identity. 150+ specialized agents as tools.**

The operator speaks in natural language. ZIBBY decides what to do, who to delegate to, and when to ask. When the operator instead names a specific pipeline or agent, ZIBBY runs exactly that — no second-guessing.

The concrete ambition: **ZIBBY stands in for the operator as the engineer on a delivery team.** It handles the company's communication (Slack, email), keeps the calendar, watches and fixes reported bugs, monitors the CI/CD pipelines on GitHub, and leaves a clean seam for the next monitor to plug in (Sentry, later). Everything with a human at the gate.

---

## The Day ZIBBY Is Finished

### Morning

The operator opens velín. ZIBBY has already generated a **narrative overnight debrief** — what completed, what failed and why, what is waiting for approval, what it learned. Each active project has a standup cheat sheet ready.

### During the Day

ZIBBY monitors Slack, email, and the project's CI/CD. A bug report arrives — ZIBBY classifies it, creates a Jira task, drafts a PR, and surfaces it for approval. A CI run goes red — ZIBBY reads the failure, opens a fix on its own branch, and surfaces it. A routine question arrives — ZIBBY answers it directly. The operator never sees the noise, only the decisions.

### Evening

The operator says: _"Go through the backlog and implement the highest-impact items."_ ZIBBY figures out the rest — which agents, which pipeline, how many iterations. Or the operator chains work by hand: _"Run research on topic X overnight, then build an app from the result."_ ZIBBY runs the first pipeline, hands its artifact to the second, and reports back when done or when it needs a decision.

### Night

ZIBBY consolidates what it learned. Patterns from approvals, answers to questions, anomalies in runs. By morning it knows more than it did the night before.

---

## What ZIBBY Does

- **Executes work** — code, emails, tasks, research, analysis
- **Monitors channels** — Slack, email, Jira, GitHub, **calendar**, and **CI/CD status** — per active project
- **Runs & chains pipelines** — a single pipeline against a stated task, or several pipelines linked so one's output artifact feeds the next
- **Remembers** — vault is the source of truth, everything is on disk
- **Learns** — from every approval signal, every answer, every run
- **Proposes** — new automation rules, new capabilities, app ideas, priorities
- **Self-modifies** — detects gaps, implements fixes, opens PRs on itself

---

## What ZIBBY Never Does Without Approval

These are architectural guarantees, not configuration options:

- Pay for anything
- Send an email to an external recipient (unless the project explicitly permits it)
- Merge to a production branch
- Delete data
- **Merge** a self-modification PR (opening one is the sanctioned autonomous Tier-2 push — see Law 3)
- Any action on the operator's machine (see _Controlling the Machine_)

A project may open its PRs as drafts (`prOpenMode`: `ready`/`draft`) — that's a
cosmetic choice about the PR's review state, and never changes the merge gate
above.

**Approval-first is law, not a setting.**

---

## Pipelines & Artifacts

A pipeline is an ordered chain of phases. It has always passed artifacts **within** itself — one phase produces a file, the next consumes it. ZIBBY lifts that same idea **between** pipelines.

- **Every pipeline yields a durable artifact** — a document in the vault, a git branch, a PR — recorded on disk, not thrown away when the run ends.
- **An artifact can be the input to another pipeline or agent.** _"Research topic X overnight"_ produces a research document; _"build an app from it"_ takes that document as its brief. The operator composes the chain; ZIBBY runs it end to end.
- **Composition is the operator's to author.** Assembling agents into a pipeline, and pipelines into a chain, is deliberate design work the operator controls — distinct from the run-time dispatch below.

---

## Agents Are Tools, Not Personalities

150+ agents are specialized instruments. They are never picked for their character — only for the job. There are exactly two ways work is dispatched:

- **Pure intent** — the operator states a goal with no target. The classifier routes it to an agent, a pipeline, or the general orchestrator. The operator never has to know the roster.
- **Explicit target** — the operator names a specific pipeline or agent. This is a **hard override: the classifier is skipped entirely** and exactly the chosen unit runs against the given task.

Categories: dev · communication · research · memory · ops · self-improvement

---

## The Project Profile

The atomic unit of ZIBBY's operational context. Each "mission" (job, client, project) has one.

A project profile contains:

- **Identity** — company, stack, the operator's role, key people with VIP flags
- **Channels** — which Slack workspace, which email inbox, which Jira board, which repo, which calendar, which CI/CD to watch
- **Autonomy policy** — what ZIBBY can do alone, what always requires approval, VIP escalation rules
- **Daily rhythm** — standup time and format, active monitoring hours
- **Budget** — monthly cap, per-run cap

Without a project profile, ZIBBY is blind. With one, it can operate as a proxy for the operator in that context.

---

## Autonomy Tiers

| Tier | Name             | Behavior                            |
| ---- | ---------------- | ----------------------------------- |
| 1    | Act silently     | Execute, log, do not interrupt      |
| 2    | Act then report  | Execute, notify the result          |
| 3    | Surface and wait | Prepare, wait for operator approval |

Gate decisions are **per-project, per-action, per-context** — never global blunt rules.

---

## Memory Architecture

| Layer    | Where                               | What                                       |
| -------- | ----------------------------------- | ------------------------------------------ |
| Working  | per-run sandbox                     | context of the current task, ephemeral     |
| Episodic | `daily/`, `runs/`, `activity.jsonl` | what happened, when, with what result      |
| Semantic | `patterns/`, `knowledge/`           | learned patterns, preferences, conventions |

Index-first navigation. No vector RAG. No external memory service. Everything is plain Markdown on disk, readable by a human without any tooling.

---

## The Interface — One Language, Everywhere

The UI is a view over the files, and it must feel like **one** product from any screen. This is a first-class goal, not polish deferred to the end:

- **Consistent interaction grammar** — the same affordance lives in the same place on every screen. The edit action is always top-right. A click on a card **navigates to that thing's detail page**; dialogs are reserved for creating and for confirming, never for viewing.
- **Nothing unlabeled** — every interactive element has an accessible name and, where its purpose isn't obvious, a description or tooltip. The operator never has to guess what a control does.
- **One design system** — every section composes from `libs/design-system` primitives; no bespoke one-off styling, consistent empty / loading / error states.
- **HUD and Chat-UI are co-equal** — the heads-up dashboard (velín) and the conversational surface share one visual language and one interaction grammar. Neither is a bolt-on.

---

## Controlling the Machine _(nice-to-have)_

A stretch capability: the operator asks ZIBBY to act on the computer directly — _"open folder X and rename every file to `xxxyyy.ext`"_, _"open Google Maps and find the nearest route to…"_. Gated behind the approval floor like any outward action, scoped and reversible by default. Lowest priority; pursued only once the core delivery mission is solid.

---

## What ZIBBY Is Not

- Not a commercial product — single-operator, self-hosted, file-based
- Not a cloud service — runs on the operator's machine, NAS is storage only
- Not a vector database — index-first, plain Markdown, MOC files as entry points
- Not autonomous without oversight — approval-first is structural, hardwired, non-negotiable
- Not a "coding monkey" — research, communication, analysis, learning, self-modification

---

## Architectural DNA

These principles apply to every phase, every feature, every PR:

- **Files are source of truth** — the UI is a view layer that reads and writes files
- **Contract-first** — ts-rest contract in `libs/contracts` before any implementation
- **Approval-first** — hardcoded at the dispatch layer, not a per-agent setting
- **Index-first memory** — MOC files, atomic notes, no ChromaDB-style dependencies
- **SSE for live streams, polling for state** — logs, the activity feed, and run-events stream over SSE (real-time where it matters); only `health` and `limits` poll
- **Explicit target overrides the classifier** — naming a pipeline/agent skips routing; pure intent is what gets routed
- **One interaction grammar** — same affordance, same place, on every screen; card-click navigates, dialogs create/confirm
- **Per-project gate floor** — rules can only be hardened per project, never relaxed
- **Single operator** — depth over breadth, one vault, one identity

---

## The One Sentence

> ZIBBY is a personal COO that knows what you're doing, remembers what you've told it, acts on your behalf where it's allowed to, and always asks where it's not.

---

_[[MEMORY]] · [[knowledge/architecture]] · [[patterns/approval-patterns]]_
