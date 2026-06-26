---
title: North Star
type: vision
tags: [north-star, vision, architecture, zibby-dna]
created: 2026-06-14
updated: 2026-06-14
status: active
related: [[MEMORY]], [[patterns/approval-patterns]], [[knowledge/architecture]]
---

# 🎩 ZIBBY — North Star

> _"I hired a second brain. I just show up for the daily."_

---

## What ZIBBY Is

ZIBBY is a **single-operator agentic OS**. Not a chatbot. Not a dashboard. A second brain with executive function — it knows its operator, knows their projects, knows their preferences, and acts on their behalf within clearly defined autonomy boundaries.

**One operator. One vault. One identity. 150+ specialized agents as tools.**

The operator speaks in natural language. ZIBBY decides what to do, who to delegate to, and when to ask.

---

## The Day ZIBBY Is Finished

### Morning

The operator opens velín. ZIBBY has already generated a **narrative overnight debrief** — what completed, what failed and why, what is waiting for approval, what it learned. Each active project has a standup cheat sheet ready.

### During the Day

ZIBBY monitors Slack and email. A bug report arrives — ZIBBY classifies it, creates a Jira task, drafts a PR, and surfaces it for approval. A routine question arrives — ZIBBY answers it directly. The operator never sees either.

### Evening

The operator says: _"Go through the backlog and implement the highest-impact items."_ ZIBBY figures out the rest — which agents, which pipeline, how many iterations. It reports back when done or when it needs a decision.

### Night

ZIBBY consolidates what it learned. Patterns from approvals, answers to questions, anomalies in runs. By morning it knows more than it did the night before.

---

## What ZIBBY Does

- **Executes work** — code, emails, tasks, research, analysis
- **Monitors channels** — Slack, email, Jira, GitHub — per active project
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
- Any self-modification PR

**Approval-first is law, not a setting.**

---

## The Project Profile

The atomic unit of ZIBBY's operational context. Each "mission" (job, client, project) has one.

A project profile contains:

- **Identity** — company, stack, the operator's role, key people with VIP flags
- **Channels** — which Slack workspace, which email inbox, which Jira board, which repo
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

## Agents Are Tools, Not Personalities

150+ agents are specialized instruments. The classifier and dispatcher orchestrate them. The operator never picks an agent — they state an intent and ZIBBY routes it.

Categories: dev · communication · research · memory · ops · self-improvement

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
- **Polling, not SSE** — non-negotiable frontend constraint
- **Per-project gate floor** — rules can only be hardened per project, never relaxed
- **Single operator** — depth over breadth, one vault, one identity

---

## The One Sentence

> ZIBBY is a personal COO that knows what you're doing, remembers what you've told it, acts on your behalf where it's allowed to, and always asks where it's not.

---

_[[MEMORY]] · [[knowledge/architecture]] · [[patterns/approval-patterns]]_
