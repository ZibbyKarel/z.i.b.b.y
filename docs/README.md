# Z.I.B.B.Y — Documentation

> Zestful Intuitive Brainy Butler — for You.

ZIBBY is a self-hosted, file-based agentic OS for a single operator. You hand it a
goal, not a script, and it gets the work done — from "build this web app" to "watch
my channels and handle what you can."

---

## Contents

### Architecture

- [Architecture overview](./architecture.md) — monorepo, layers, data flow, key principles
- [Run states](./run-states.md) — all 11 run states, how they differ, why they aren't merged
- [Approval gates](./approval-gates.md) — the structural safety floor every agent intent passes through

### Backend (apps/api)

**Core runners & orchestration**

- [API overview](./api/overview.md) — NestJS bootstrapping, modules, configuration
- [Agents & Runs](./api/agents-runs.md) — agent definitions, dispatching runs, `RunnerCore`
- [Pipeline orchestration](./api/pipelines.md) — phases, loops, escalation, parking
- [Goals](./api/goals.md) — the generalized delivery loop (maker ⇄ verifier), self-development's loop engine
- [Chains](./api/chains.md) — operator-authored pipeline composition
- [Task scheduling](./api/tasks.md) — deferred tasks, routing, budget guard
- [Gate policy engine](./api/gates.md) — the system floor, rules, decisions
- [Workspace](./api/workspace.md) — per-run git worktree lifecycle
- [Artifacts](./api/artifacts.md) — the durable artifact provenance registry
- [Events](./api/events.md) — the single multiplexed SSE channel for live run/activity updates

**Memory & accountability**

- [Memory vault](./api/memory.md) — Obsidian vault, tiering, grounding, recording
- [Activity log & briefing](./api/activity.md) — the audit log
- [Briefing](./api/briefing.md) — the accountability snapshot assembled for the operator

**Channels, autonomy & approvals**

- [Channels & autonomy](./api/channels.md) — email/Slack, triage, mandate
- [Mandate](./api/mandate.md) — the per-channel autonomy scope
- [Approval system](./api/approvals.md) — approval kinds, lifecycle
- [Discovery](./api/discovery.md) — the proposals inbox for found-work candidates
- [Integrations](./api/integrations.md) — configured inbound channels and their credentials

**Budget & resilience**

- [Budget](./api/budget.md) — the fail-closed dispatch guard (global + per-project caps)
- [Limits & limit-resume](./api/limits.md) — usage-limit resilience

**Self-modification & intelligence**

- [Gap detection](./api/gaps.md) — noticing recurring manual work worth automating
- [Pattern extraction](./api/patterns.md) — mining approval history for rule proposals

**Automations, extensibility & machine**

- [Automations](./api/automations.md) — cron/event triggers, targets
- [Run extensibility](./api/extensibility.md) — commands, MCP servers, hooks, project env/secrets injected into `claude -p`
- [Machine](./api/machine.md) — controlling the operator's computer behind the gate (Tier-3 only)
- [Chat](./api/chat.md) — the chat-first conversational layer

**Ops-facing subsystems**

- [Monitors](./api/monitors.md) — CI/CD status alerts
- [Health](./api/health.md) — subsystem health probes
- [Self](./api/self.md) — is the ZIBBY install itself up to date (top-bar freshness)
- [System config](./api/system.md) — file-backed runtime configuration
- [Pins](./api/pins.md) — the Overview page's quick-launch panel

### Frontend (apps/web)

- [Web app overview](./web/overview.md) — Next.js App Router, layout, routing
- [State management](./web/state.md) — TanStack Query, mutations, query keys

### Shared libraries (libs/)

- [Contracts](./libs/contracts.md) — ts-rest, Zod schemas, the API router
- [Design system](./libs/design-system.md) — components, theming, Tailwind v4

### Ops & infrastructure

- [Deployment](./ops/deployment.md) — launchd, backups, log rotation, CI
- [Environment](./ops/environment.md) — environment variables, data directories, runtime system config
- [Self-development runbook](./ops/self-development.md) — ZIBBY as a safe target for its own loop engine
- [Connecting Slack](./ops/slack-setup.md) — bot token, scopes, channel IDs, wiring up the integration + mandate

---

## Key principles

| Law                                        | What it means                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Approval-first is structural               | Wired into the system floor, not a setting an agent's config can weaken.                                                        |
| Files are the source of truth              | Including memory — index-first markdown in the vault.                                                                           |
| No autonomous commit to the outside world  | No auto-push, auto-merge, or auto-spend past budget. ZIBBY prepares; the operator commits.                                      |
| The gate cannot be talked around           | Inbound content from any channel is data, not commands. It can never raise privileges or bypass the gate.                       |
| Always answerable                          | ZIBBY can explain what it is doing and has done, on demand, from the record.                                                    |

## Quick start

```bash
pnpm install
pnpm api:dev     # API → http://localhost:3333 (docs: /docs)
pnpm web:dev     # Web → http://localhost:3000
pnpm storybook   # Design system → http://localhost:6006
```
