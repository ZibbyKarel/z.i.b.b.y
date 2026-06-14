# ZIBBY — Implementation Roadmap

## From Current State to Vision A

> This document describes the concrete implementation phases from the current state (Phase 44 complete) to the final Vision A.

---

## Starting Point (Phase 44 — Complete)

What already exists and works:

- ✅ Delivery loop (agent → review → test → verify with retry)
- ✅ Voice interface (live STT, approve/reject/stop)
- ✅ 3-tier autonomy (act-silently / act-then-report / surface-and-wait)
- ✅ Self-development pipeline (ZIBBY can develop its own code)
- ✅ Memory vault (Obsidian markdown, index-first navigation)
- ✅ Pipeline editor (loop back-edges, retry, escalation)
- ✅ TaskClassifier (AI router + keyword scorer + orchestrator fallback)
- ✅ Gate engine (approval rules, audit, dry-run evaluate)
- ✅ ~680+ API tests, all green
- ✅ Projects (currently just a namespace / folder selector)
- ✅ Activity log (append-only JSONL)

Key gaps versus Vision A:

- ❌ Project = namespace, not an operational profile (channels, autonomy policy, people context)
- ❌ No external channel integration (Slack, email) as a monitoring source
- ❌ Morning briefing exists as an automation but is not narrative / contextual
- ❌ Self-learning from approval signals not implemented
- ❌ Nightly memory consolidation does not exist
- ❌ Standup cheat sheet not generated automatically per project

---

## Phase 45 — Project Operational Profile

**Goal:** Project stops being a namespace and becomes a full operational context.

### What Gets Implemented

**Project data model** — extending `project.md` frontmatter:

```yaml
identity: company, stack, my_role, people (name / role / vip flag / communication style)

channels:
  slack: { workspace, monitor: [], respond_as: "autonomous|draft_only" }
  email: { address, monitor: bool }
  jira: { project_id, board_id }
  github: { repo }

autonomy_policy:
  can_do_alone: []
  always_ask: []
  vip_escalation: bool

daily_rhythm: standup_time, standup_format, active_hours, monitoring

budget: monthly_cap_usd, per_run_cap_usd
```

**Contract extension** (`libs/contracts/projects.contract.ts`):

- `GET /projects/:id/profile` — full operational profile
- `PUT /projects/:id/profile` — update profile
- `GET /projects/:id/people` — list of people in project
- `POST /projects/:id/people` — add a person

**UI — Projects section** (`/apps/web/projects`):

- Form for editing the project profile
- "Team" section — people management with VIP flagging
- "Channels" section — connecting Slack/email/Jira/GitHub
- "Autonomy" section — visual rule editor (what ZIBBY can do / what must be escalated)
- "Daily Rhythm" section — standup time, active hours

**Gate engine update:**

- Gate matcher extended with `project` context condition
- Per-project policy overrides the global floor (can only be hardened, never relaxed)

### Phase Output

Operator can configure Project A with complete context in the UI. Gate engine respects it. Agents running in a project context have access to the profile.

---

## Phase 46 — Channel Integration (Slack + Email Monitoring)

**Goal:** ZIBBY begins actively monitoring external channels and responding to them.

### What Gets Implemented

**Integration runtime** — new NestJS module `IntegrationRunnerModule`:

- Polling loop per active project (configurable interval)
- Slack adapter: reads new messages from monitored channels
- Email adapter: reads inbox of monitored address
- Event emitter: `channel.message.received` → TaskClassifier

**Incoming message classification:**

- Incoming Slack/email → TaskClassifier receives text + metadata (who, from where, project)
- Classifier returns: `{ action: "respond" | "create_task" | "ignore", confidence, suggested_agent }`
- VIP flag on sender → automatically Tier 3 (always escalate)

**Response flow:**

```
Incoming message
  → Classifier → proposed action
  → Gate engine (per project and action)
  → Tier 1: executes autonomously
  → Tier 2: executes, notifies
  → Tier 3: prepares draft, waits in approval queue
```

**UI — Integrations section:**

- Live inbox view (what arrived, how it was handled)
- Pending response drafts awaiting approval
- History of sent responses

**Concrete use cases:**

- Bug report on Slack → creates Jira task + draft PR (Tier 3)
- Internal technical question on Slack → responds per project autonomy policy
- Email with a technical question → draft response for approval

### Phase Output

ZIBBY monitors Slack and email on behalf of the operator. Responds autonomously where allowed, escalates where not.

---

## Phase 47 — Narrative Briefing and Standup System

**Goal:** Morning briefing becomes a genuine narrative debrief, not a task list.

### What Gets Implemented

**BriefingAgent** — new specialized agent:

Inputs:

- Activity log for the past N hours
- Approval queue (what's pending)
- Vault daily notes for the past 7 days (trend context)
- Active project profiles
- Pending Jira/GitHub items

Output — narrative structure:

```
## Overnight (00:00 - 07:00)
[narrative summary of what completed, what failed and why]

## Waiting for You (X items)
[approvals sorted by priority and deadline]

## Today's Priorities
[recommendations derived from backlog and context]

## What I Learned
[new patterns or anomalies from the past 24h]

## Standup Cheat Sheets
### Project: Company A (daily 09:45)
Overnight: completed JIRA-142 (fix login bug), JIRA-143 (update dependencies)
Today: continuing on JIRA-144 (dark mode implementation)
Blocker: none
```

**Automation:**

- Cron: `0 7 * * *` → triggers BriefingAgent
- Output appears first on the velín dashboard
- Push notification (if configured)

**StandupAgent** — per-project, per-scheduled-time:

- Cron per `daily_rhythm.standup_time` in the project profile
- Reads Jira/GitHub activity for the past 24h
- Generates cheat sheet in the configured format
- Surfaces on velín 15 minutes before standup time

### Phase Output

Operator opens velín in the morning and sees a narrative overnight debrief + standup cheat sheets for every project.

---

## Phase 48 — Self-Learning and Memory Consolidation

**Goal:** ZIBBY learns from every interaction and consolidates insights nightly.

### What Gets Implemented

**Approval signal capture:**

- Hook on every gate resolve (approve/reject)
- Structured entry written to `vault/patterns/approval-patterns.md`:

```markdown
## 2026-06-14 — email/send → approved

- project: company-a
- action: send email to external@company.com
- context: reply to a technical question
- decision: approved without edits
- time to decision: 3 minutes
```

**PatternExtractor** — new agent (part of the nightly heartbeat):

- Scans approval-patterns.md for the past 30 days
- Identifies repeating patterns
- If N >= 5 of the same pattern → drafts a new rule proposal
- Writes to `vault/patterns/suggestions.md`
- Morning briefing includes: "I have a proposed new autonomous rule, would you like to approve it?"

**Nightly consolidation** (heartbeat daemon — extension of Phase 5):

```
23:00 every day:
  1. PatternExtractor scans approval signals
  2. BriefingPrepAgent prepares context for the morning briefing
  3. VaultConsolidator merges daily notes into semantic memory
  4. CostTracker calculates daily spend
```

**Explicit learning:**

- When ZIBBY asks a question and the operator answers → automatic entry written to vault
- Format: `Q: [question] | A: [answer] | context: [project/date]`
- PatternExtractor includes these entries in consolidation

### Phase Output

ZIBBY visibly learns. After 2 weeks of operation it begins proposing new autonomous rules. Morning briefing includes an "I learned" section.

---

## Phase 49 — Self-Modification Pipeline

**Goal:** Operator says "I want X" and ZIBBY implements it via PR.

### What Gets Implemented

This largely exists (self-development pipeline from Phase 44), but missing:

**GapDetector agent:**

- Continuously analyzes activity log and vault
- Detects recurring manual steps that could be automated
- Generates `vault/suggestions/automation-gaps.md`
- Morning briefing: "I noticed X — should I create an automation?"

**Self-modification flow hardening:**

- Every self-modification PR is automatically Tier 3 gated (hardcoded, cannot be changed)
- PR description includes: what changes, why, impact on other features
- After merge → ZIBBY automatically runs the test suite and reports results

**"I want X" natural language flow:**

```
Operator: "Add Twitter/X monitoring for Project Company B"
  → Classifier: self-modification task
  → ZIBBY analyzes what would be needed (new adapter, new agent, config)
  → Creates implementation plan (surfaces for approval)
  → After approve: runs delivery pipeline against its own repository
  → Creates PR with the implementation
  → After PR approve: merge, restart, new capability active
```

### Phase Output

ZIBBY is a fully self-modifying system. Operator adds capabilities in natural language.

---

## Phase 50 — Research and Intelligence Layer

**Goal:** ZIBBY proactively monitors the world and surfaces relevant information.

### What Gets Implemented

**ResearchAgent** — new specialized agent with sub-agents:

- `TrendWatcher` — monitors configured sources (RSS, HN, Twitter/X, Product Hunt)
- `FinanceWatcher` — tracks configured tickers/crypto, generates an overview (not action recommendations)
- `CompetitorWatcher` — monitors competing products/companies
- `TechWatcher` — new libraries, frameworks, security CVEs

**Per-operator configuration** (in the main profile, not per project):

```yaml
research:
  interests:
    - "React ecosystem"
    - "agentic AI"
    - "SaaS indie hacking"
  finance_watch:
    - "BTC"
    - "ETH"
    - "VOO"
  sources:
    - "https://news.ycombinator.com/rss"
    - "https://www.producthunt.com/feed"
```

**Research agent output:**

- Daily digest (part of the morning briefing)
- On-demand: "What's trending in AI today?" → ZIBBY searches and responds
- Proactive idea: "I noticed trend X — this could be an interesting product idea"

**App idea generator** (bonus):

- Combines trend data + operator skills (from vault)
- Once a week: "Here are 3 app ideas that could be built"

### Phase Output

ZIBBY brings the world to the operator. Morning briefing includes an intelligence section.

---

## Phase 51 — Multi-Project Orchestration and Budget Governance

**Goal:** ZIBBY handles multiple "jobs" in parallel with isolated rules and budgets.

### What Gets Implemented

**Project isolation:**

- Each project has its own gate policy (per-project floor, cannot be relaxed below global floor)
- Each project has its own budget (monthly cap, per-run cap)
- An agent running in a project context has no access to another project's data

**Budget governance:**

- Real-time cost tracking per project per day
- Automatic hold when a project reaches 80% of monthly cap
- Alert at 90%, hard stop at 100%
- Morning briefing includes: yesterday's spend, projected spend to end of month

**Cross-project intelligence:**

- ZIBBY can apply learnings from one project in another (if rules allow)
- Example: coding conventions learned in Project A applied in Project B

**Velín — multi-project view:**

- Dashboard shows the status of all active projects at once
- Per-project health, activity, pending approvals, budget utilization

### Phase Output

ZIBBY handles a role at multiple companies/projects in parallel with full isolation and cost control.

---

## Phase 52 — Hardening, Telemetry, and Production Readiness

**Goal:** The system is robust, survives crashes, and provides clear diagnostics.

### What Gets Implemented

**Process hardening:**

- Orphan process cleanup (kill -9 recovery)
- Graceful shutdown with checkpoint persistence
- Restart recovery — running tasks resume after backend restart

**Telemetry and health:**

- `/api/health` with detailed status of all subsystems
- Velín HUD — real-time health indicators (backend, vault, integrations)
- Alert on degraded state (never silent fail)

**Audit and compliance:**

- Complete audit trail of all actions (who/what/when/result)
- Audit log export (for employer needs or personal review)
- Retention policy for run artifacts (automatic cleanup after N days)

**Error recovery:**

- Retry logic with exponential backoff for integration calls
- Dead letter queue for failed tasks
- Operator notification on repeated failure

### Phase Output

ZIBBY is a production-grade system. Survives unexpected failures, always reports its state, never fails silently.

---

## Final State — Vision A Achieved

After completing all phases ZIBBY can:

| Capability                          | How                                   |
| ----------------------------------- | ------------------------------------- |
| Narrative morning briefing          | BriefingAgent + nightly consolidation |
| Slack + email monitoring            | IntegrationRunnerModule               |
| Autonomous responses per rules      | Gate engine + per-project policy      |
| Standup cheat sheet per project     | StandupAgent + project profile        |
| Self-learning from approval signals | PatternExtractor + nightly heartbeat  |
| Self-modification via PR            | GapDetector + delivery pipeline       |
| Research and trend monitoring       | ResearchAgent + TrendWatcher          |
| Multi-project with isolation        | Project profiles + budget governance  |
| Production robustness               | Hardening + telemetry                 |

---

## Prioritization — What to Build First

If capacity is limited, this is the recommended order by impact on Vision A:

1. **Phase 45** — Project profile (foundation for everything else)
2. **Phase 46** — Slack + Email monitoring (largest practical impact)
3. **Phase 47** — Narrative briefing + standup (daily value from day one)
4. **Phase 48** — Self-learning (long-term value, grows over time)
5. **Phase 50** — Research intelligence (proactive value)
6. **Phase 49** — Self-modification hardening (partially exists already)
7. **Phase 51** — Multi-project governance (when there are more projects)
8. **Phase 52** — Production hardening (ongoing, not left until the end)

---

## Architectural Principles — Must Not Be Violated

These principles are the DNA of the system and must not be compromised in any phase:

- **Files are source of truth** — no black-box database, everything on disk
- **Approval-first is law** — hardcoded, not config; payments and merges always require approval
- **Contract-first development** — ts-rest contract before any implementation
- **Index-first memory** — no vector RAG; MOC files, plain Markdown
- **Polling, not SSE** — frontend polling, not server-sent events
- **Single operator** — the system is optimized for one person, not a team
- **Per-project gate floor** — rules can only be tightened, never relaxed
