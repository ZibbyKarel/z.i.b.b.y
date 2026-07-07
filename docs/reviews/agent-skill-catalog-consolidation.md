# Agent & Skill Catalog Consolidation Review

Status: **review / recommendation only** — no `.claude/agents` or `.claude/skills` files were
moved or deleted as part of this pass, per the review's own constraints.

Scope note: this is about the **Claude Code subagent/skill catalog** the assistant can invoke
(`.claude/agents/*`, `.claude/skills/*`). It does not touch ZIBBY's own Architekt → Kodér ⇄
Code-Review → Tester → Dokumentátor pipeline-role concept — that is a separate, already-settled
design.

---

## 0. Headline findings

- **184 agent files, 174 unique agents.** 16 files are byte-identical (whitespace-only) copies
  of another file in the same directory — pure accidental duplication, not intentional variants:
  `api-designer`, `architect`, `backend-developer`, `code-reviewer`, `debugger`,
  `frontend-developer`, `fullstack-developer`, `nextjs-developer`, `node-specialist`,
  `performance-engineer`, `postgres-pro`, `react-specialist`, `refactoring-specialist`,
  `test-automator`, `typescript-pro`, `ui-designer` (each has a `<name>.md` and a
  `<name> copy.md`). Deleting the 16 `" copy.md"` files is a free, zero-risk ARG_MAX win before
  any semantic consolidation — flagged here, left for a human/implementation pass to action.
- **Two literally-broken entries:** `gated-agent.md` has no `description` or `tools` frontmatter
  (just `requires_approval: true` / `risk: high` and a one-line body — looks like a test fixture,
  not a usable agent) and `codebase-orchestrator.md` declares tools that don't exist anywhere
  else in this catalog (`airis-mcp-gateway`, `pied-piper`, `subagent-catalog:search`,
  `subagent-catalog:fetch`) — looks imported from a different scaffold. Both need a human call
  (§7), not a mechanical merge.
- **Name collisions between agents and skills already in this repo:** there is both an agent
  `api-designer` and a project skill `api-designer`; both an agent `code-reviewer` and a
  top-level skill `code-review`. These aren't functionally identical (agent can read/write/edit
  code, skill is reference guidance loaded by a generalist), but the naming makes dispatch
  ambiguous for a classifier. Flagged in §7.
- **Every generic-tooling agent uses the same tool grant**: `["Read","Write","Edit","Bash","Glob","Grep"]`
  (or a read-only subset). Of 174 unique agents, only 6 carry a tool grant that differs from this
  generic set: `codebase-orchestrator` (extra MCP-ish tools, likely broken), `ui-ux-tester`
  (`chrome-mcp`, `computer-use`), `visual-asset-generator` (`mcp__prompt-to-asset`),
  `scientific-literature-researcher` (`mcp__bgpt__search_papers`), `security-auditor` /
  `compliance-auditor` (read-only, no `Write`/`Edit`/`Bash`), `penetration-tester` /
  `qa-expert` / `accessibility-tester` (read-only + `Bash`, no `Write`/`Edit`). This is the load-bearing
  fact behind the whole review: **the overwhelming majority of the 174 agents are not
  distinguished by tool access at all — only by which paragraph of domain knowledge is in their
  system prompt.** That is exactly the shape of a skill, not an agent (see the test in §3).

---

## 1. Inventory

Full per-file inventory (name, tools, one-line description) was extracted mechanically from
frontmatter and is preserved at
`/tmp/claude-0/.../scratchpad/agents_inventory.txt` for this session — not duplicated verbatim
here to keep this document reviewable. Summarized by domain cluster in §2/§3 below.

**Skills** (all project-scoped, `.claude/skills/`, except `session-start-hook` which is
user-global in `~/.claude/skills/`):

| Skill | Scope | Trigger / purpose |
|---|---|---|
| `api-designer` | project | REST/GraphQL design, OpenAPI, resource modeling |
| `composition-patterns` (`vercel-composition-patterns`) | project | React composition patterns, compound components |
| `design-system` | project | z.i.b.b.y DS conventions (tokens, components, a11y, tests) |
| `frontend-design` | project | Distinctive production-grade UI generation |
| `graphify` | project | Codebase → knowledge graph |
| `react-best-practices` (`vercel-react-best-practices`) | project | React/Next.js perf patterns |
| `scaffold-component` | project | Generates a new DS component + test + story |
| `ui-ux-pro-max` | project | Style/palette/font/chart/stack reference library |
| `web-design-guidelines` | project | Web Interface Guidelines compliance audit |
| `session-start-hook` | **user** | Sets up a repo's SessionStart hook for Claude Code on the web |

This list is itself the model to imitate: every one of these is "apply a specific body of
technical knowledge within the current turn," none needs its own tool grant or isolated context,
and several (`design-system`, `scaffold-component`) are already scoped to a specific
subdirectory. §3 uses this as the bar an agent must clear to justify *not* looking like this.

**Agents**: 174 unique, all project-scoped (`.claude/agents/`); the user-global agent directory
(`~/.claude/agents/`) is empty — there is currently no user-level agent overriding or
supplementing the project catalog.

---

## 2 & 3. Overlap clusters, consolidation, and agent-vs-skill classification

Combined per the classification test in the task: an agent survives only if it needs **(a)**
isolated context/parallel worktree execution, **(b)** a distinct least-privilege tool scope, or
**(c)** autonomous multi-step judgment spanning a whole domain (not "recall a technique and apply
it this turn"). Everything else converts to a skill.

### Kept / consolidated agents (target catalog, ~28 agents)

| Consolidated agent | Absorbs | Why it survives | What's lost by merging |
|---|---|---|---|
| `frontend-developer` | `react-specialist`, `nextjs-developer`, `vue-expert`, `angular-architect`, `electron-pro` | (c) full app-level judgment across a whole FE codebase; framework choice is a skill-load, not a different agent | Framework-specific edge cases become skill content instead of a dedicated system prompt — acceptable since z.i.b.b.y itself is single-framework (Next.js/React) |
| `backend-developer` | `node-specialist`, `fastapi-developer`, `django-developer`, `rails-expert`, `laravel-specialist`, `symfony-specialist`, `spring-boot-engineer`, `java-architect`, `dotnet-core-expert`, `dotnet-framework-4.8-expert`, `csharp-developer`, `golang-pro`, `rust-engineer`, `cpp-pro`, `elixir-expert`, `php-pro`, `python-pro`, `kotlin-specialist`, `javascript-pro`, `typescript-pro` | (c) server-side architecture judgment; language is a skill-load | Deep per-language idiom (e.g. Rust ownership subtleties, Elixir OTP patterns) moves from a dedicated system prompt to a loaded skill — real loss for the least-common languages, acceptable for the stack ZIBBY actually runs (TS/Node/Nest) |
| `fullstack-developer` | *(retire — no separate agent)* | Its job (DB+API+FE in one feature) is what an orchestrated pipeline already does by calling `backend-developer` then `frontend-developer`; a third agent duplicating both doesn't add judgment | None — it was 100% overlap with the other two |
| `mobile-developer` | `mobile-app-developer`, `expo-react-native-expert`, `flutter-expert`, `swift-expert` (mobile parts) | (c) cross-platform mobile judgment, native module integration | Swift/Kotlin-native-only edge cases become skill-loads |
| `devops-engineer` | `deployment-engineer`, `build-engineer`, `dx-optimizer`, `platform-engineer`, `docker-expert`, `kubernetes-specialist`, `terraform-engineer`, `terragrunt-expert` | (c) CI/CD + infra automation judgment, identical tool grant across all eight | Tool-specific deep dives (Terragrunt DRY patterns, k8s troubleshooting playbooks) become skills |
| `cloud-architect` | *(kept separate)* | (c) strategy/multi-cloud tradeoff judgment is a different altitude than hands-on `devops-engineer` execution — same architect-vs-implementer split the repo already uses (`architect` vs `backend-developer`) | — |
| `sre-engineer` | `chaos-engineer`, `incident-responder`, `devops-incident-responder`, `error-coordinator`, `error-detective`, `performance-monitor` | (c) reliability engineering spans discovery → mitigation → postmortem as one continuous judgment call | Incident-specific runbooks become skills; `error-coordinator`'s "route errors across distributed agents" framing is largely redundant with the native `Workflow` tool anyway |
| `security-auditor` | `compliance-auditor` | (b) genuinely different tool grant (read-only, no `Write`/`Edit`/`Bash`) from every implementing agent — a real least-privilege boundary worth keeping as its own agent | Framework-specific compliance checklists (GDPR/HIPAA/PCI) become skills loaded by this agent |
| `security-engineer` | `dependency-manager` | (c) implements controls (needs `Write`/`Edit`/`Bash`), distinct from the read-only auditor | — |
| `penetration-tester` | *(kept separate)* | (b) narrower tool grant (no `Write`/`Edit`) plus a distinct authorization/legal framing that should not be diluted into a general security agent | — |
| `database-administrator` | `database-optimizer`, `postgres-pro`, `sql-pro`, `data-engineer` (ops half) | (c) HA/DR/perf/indexing is one continuous ops judgment; identical tool grant | Engine-specific tuning knowledge (Postgres vs. MySQL vs. SQL Server) becomes skills |
| `data-scientist` | `data-analyst` | (c) modeling + insight generation | Business-report framing folds into the same agent's output style |
| `research-analyst` | `market-researcher`, `competitive-analyst`, `trend-analyst`, `data-researcher`, `search-specialist` | (a)/(c) multi-source synthesis is genuinely a parallel-fan-out + synthesis task | Domain-specific research techniques (competitive teardown structure, trend-scenario framing) become skills |
| `scientific-literature-researcher` | *(kept separate)* | (b) unique MCP tool (`mcp__bgpt__search_papers`) not available to any other agent | — |
| `ai-engineer` | `ml-engineer`, `machine-learning-engineer` (these two are near-duplicate names/scopes already), `llm-architect`, `nlp-engineer`, `reinforcement-learning-engineer` | (c) end-to-end ML system judgment | Sub-domain framing (RL reward design, NLP pipeline specifics) becomes skills |
| `mlops-engineer` | *(kept separate)* | Same architect/implementer-altitude split as `cloud-architect`/`devops-engineer` — production ML infra is a distinct continuous concern from model design | — |
| `code-reviewer` | `architect-reviewer`, `refactoring-specialist`, `refactor-cleaner`, `legacy-modernizer`, `Cleaner` | (a) isolated-context deep review is the textbook case for a dedicated agent (this repo's own `/code-review` skill is for the in-context working-diff case; the agent is for delegated/parallel/large-scope review — keep both, they serve different call sites) | `refactor-cleaner`'s specific tool invocations (knip/depcheck/ts-prune) become a short runbook inside the merged agent's prompt |
| `architect` | `microservices-architect` | (c) system-design judgment | — |
| `debugger` | *(kept separate, core to the Kodér ⇄ Tester loop)* | (c) root-cause judgment across a whole failure, feeds directly into ZIBBY's bounded retry loop | — |
| `qa-expert` | `test-automator`, `accessibility-tester` | (c) test strategy across the whole delivery cycle | Generic WCAG checklist content becomes a skill; project-specific a11y stays with `accessibility-auditor` below |
| `accessibility-auditor` | *(kept separate — project-specific)* | (c) already scoped to this repo's actual UI (isometric house scene, Web3Forms contact form) — more specific judgment than the generic `accessibility-tester` it subsumes | — |
| `ui-ux-tester` | *(kept separate)* | (b) unique tool grant (`chrome-mcp`, `computer-use`) | — |
| `technical-writer` | `documentation-engineer`, `api-documenter` | (c) documentation-system judgment | — |
| `content-quality-editor` | `ai-writing-auditor` | Near-identical purpose (strip AI-writing patterns pre-publish); `content-quality-editor` is the more concrete one (references the `unslop` tool) | — |
| `legal-advisor` | `license-engineer` | (c) contract/IP/licensing judgment spans a whole engagement | Regulatory-framework specifics (GDPR/CCPA/HIPAA) become skills, shared with `security-auditor` |
| `risk-manager` | *(kept separate)* | Enterprise financial/operational risk register is a distinct judgment domain from security audit | — |
| `product-manager` | `project-idea-validator` | (c) product strategy judgment | — |
| `project-manager` | `scrum-master` | (c) plan/track/coordinate across a whole initiative | Ceremony-facilitation specifics become a skill |
| `business-analyst` | *(kept separate)* | Requirements-gathering from stakeholders is a distinct discipline from product prioritization | — |
| `marketing-strategist` | `brand-strategist` | (c) positioning/GTM judgment | — |
| `content-marketer` | `copywriter`, `email-marketer`, `social-media-manager` | (c) channel execution judgment, shared voice/brand input | SEO-specific technical audit moves to a skill loaded by this agent |
| `sdr` | `lead-researcher` | (c) outbound-motion judgment (ICP → list → sequence) is one continuous task | — |
| `account-executive` | `sales-engineer`, `customer-success-manager` | (c) full closing-through-retention judgment for one named account | Pre-sales PoC-building and post-sale CS metrics tracking become skills loaded by the same agent depending on deal stage |
| `windows-infra-admin` | `it-ops-orchestrator`, `m365-admin`, `azure-infra-engineer`, `ad-security-reviewer` | (c) Windows/AD/M365/Azure identity ops is one continuous infra judgment domain | PowerShell-version-specific syntax, module architecture, and UI-building specifics all become skills (see next row) |
| *(skill, not agent)* | `powershell-5.1-expert`, `powershell-7-expert`, `powershell-module-architect`, `powershell-security-hardening`, `powershell-ui-architect` | These are pure "apply this PowerShell-version idiom" knowledge with the same generic tool grant as everything else — no isolated context or distinct privilege needed | Loaded on demand by `windows-infra-admin` |
| `mcp-developer` | *(kept separate)* | (c) protocol-level judgment, plus it directly governs how ZIBBY itself grows new tool integrations — self-referential enough to keep dedicated | — |
| `prompt-engineer` | *(kept separate)* | (c) tuning the very prompts that drive this agentic system is a distinct, recurring discipline worth a dedicated agent rather than folding into a generalist | — |
| `agent-installer` | *(kept separate)* | (b)/(c) it is the mechanism for the "create a new agent on demand" extensibility path this review is required to preserve — see §4 | — |
| `payment-integration` | *(kept separate)* | (c) PCI-compliant transaction code is high-stakes enough, and different enough from generic backend work, to warrant its own judgment scope | `fintech-engineer`'s general strategy content folds in as a skill |
| `visual-asset-generator` | *(kept separate)* | (b) unique MCP tool (`mcp__prompt-to-asset`) | — |
| `statusline-setup` | *(kept separate, out of scope for this review)* | Tiny, CLI-feature-specific, already minimal | — |

### Converted to skills

| New/target skill | Absorbed agent(s) | Rationale |
|---|---|---|
| `ab-test-analysis`, `cohort-analysis`, `growth-loops`, `assumption-mapping`, `first-principles-thinking`, `backlog-grooming` | *(agents of the same name)* | Pure "apply one analytical framework this turn," identical generic tool grant, no multi-step domain-spanning judgment — textbook skill shape, same as this repo's existing `assumption-mapping`-style entries already being agents today is itself the anomaly to fix |
| `gdpr-ccpa-compliance`, `hipaa-compliance` | *(agents of the same name)* | Read-only reference-framework knowledge, loaded by `security-auditor` or `legal-advisor` depending on context |
| `git-workflow-manager` | agent of the same name | Branching-strategy knowledge applied within a session, no distinct tool scope |
| `design-bridge` | agent of the same name | Translating a DESIGN.md into build instructions is one-turn technique application; loaded by `frontend-developer` |
| `ui-designer` | agent of the same name | Fully superseded in this repo by the existing `design-system` / `frontend-design` / `ui-ux-pro-max` skills; no new agent needed for this domain here |
| `wordpress-master`, `blockchain-developer`, `game-developer`, `embedded-systems`, `iot-engineer`, `cli-developer`, `tooling-engineer`, `websocket-engineer`, `slack-expert`, `graphql-architect`, `api-designer` (agent), `api-documenter` | *(agents of the same name)* | Off-stack or narrow verticals with the standard generic tool grant — domain knowledge loaded by `backend-developer`/`frontend-developer`/`technical-writer` as needed; z.i.b.b.y itself doesn't run WordPress, blockchain, embedded, or IoT, so there's no case for a standing agent |
| `quant-analyst`, `healthcare-admin`, `fintech-engineer` | *(agents of the same name)* | Regulated-domain reference knowledge, loaded by `legal-advisor`/`payment-integration`/`business-analyst` |
| `powershell-*` (5 agents, listed above) | — | See Windows cluster row above |
| SEO checklist | `seo-specialist` | Folded into `content-marketer` as a loadable skill rather than a standing agent |

---

## 4. Extensibility for on-demand agent creation

**(a) Minimal template for a new agent.** Required frontmatter:

```yaml
---
name: kebab-case-name
description: >
  One sentence starting "Use this agent when...", naming concrete trigger phrases/situations.
  This is the only signal the classifier sees before dispatch.
tools: ["Read", "Grep", "Glob"]   # start read-only; add Write/Edit/Bash only if the
                                   # agent must produce artifacts, and only add an
                                   # MCP-scoped tool if no existing agent already has it
---
```

Required body sections: **When invoked** (numbered steps), **Checklist** or **Deliverable**
(what "done" looks like), and — new convention this review recommends — a **Skills** line
listing which existing skills this agent should load rather than re-explain
(`Skills: design-system, frontend-design`). This mirrors the `design-system` /
`frontend-design` / `react-best-practices` pattern already in this repo's `Skill` tool
description ("designed to be loaded on demand by a generalist agent").

**(b) Decision rule — new agent vs. reuse+skill.** Before creating a new agent, answer:

1. Does this need to run with a **different tool grant** than any existing agent (least
   privilege), or in an **isolated context/worktree** in parallel with other work? → new agent.
2. Does it require **autonomous judgment spanning many steps across a whole domain**
   (architecture tradeoffs, incident response, a multi-week engagement) rather than "apply a
   known technique to the current file/turn"? → new agent.
3. If neither: it's a skill. Write it under `.claude/skills/<name>/SKILL.md`, give it a precise
   trigger-phrase description, and attach it conceptually to whichever generalist agent
   (`backend-developer`, `frontend-developer`, `devops-engineer`, `security-auditor`, etc.) is
   the natural home — no code change needed for that "attachment," since any agent with
   filesystem access can invoke the `Skill` tool the same way the main loop does. Only spin up a
   *new* generalist agent if none of the existing ~28 is a plausible home.

**(c) Skill discovery for a newly created agent.** New agents should not re-embed domain
knowledge that already exists as a skill. Two options, prefer the first:
- Reference existing skills by name in the agent's own **Skills** frontmatter line (see
  template above) so it's an explicit, auditable dependency instead of the agent silently
  guessing.
- Where the model itself must decide at runtime (agent wasn't authored with foreknowledge of
  which skill applies), it can call `ToolSearch`/the `Skill` tool's own listing mechanism the
  same way the main assistant does — the skill catalog is not gated behind agent identity.

---

## 5. Deliverable summary

**Decision rule for future additions (one-liner version):**
- Different tool grant or isolation need → agent.
- Domain-spanning multi-step judgment (not one technique applied once) → agent.
- Otherwise → skill, attached to the nearest existing generalist agent.
- Before writing either: check the "kept" list in §2/§3 first — the target catalog is
  deliberately ~28 agents, not 174.

**Ambiguous cases needing a human call:**
1. `gated-agent.md` and `codebase-orchestrator.md` — malformed/foreign frontmatter, unclear if
   they're live features or leftover fixtures; don't merge or convert until their origin is
   confirmed.
2. Name collisions: agent `api-designer` vs. skill `api-designer`; agent `code-reviewer` vs.
   skill `code-review`. Needs a decision on which one wins the name, or a rename.
3. Meta-orchestration agents (`agent-organizer`, `workflow-orchestrator`, `multi-agent-coordinator`,
   `task-distributor`, `context-manager`, `knowledge-synthesizer`) heavily overlap with the native
   `Workflow` tool's `agent()`/`parallel()`/`pipeline()` primitives already available in this
   environment. Whether to keep any of them (and if so, which one, for "meta-planning of which
   agents to invoke" rather than execution) is a product call, not a mechanical merge.
4. `slack-expert` — currently a skill-shaped one-off, but ZIBBY's own North Star names Slack as
   a first-class inbound channel; if/when Slack integration becomes load-bearing this may deserve
   promotion back to a dedicated agent with its own tool scope (webhook/API credentials) rather
   than a skill. Revisit once that channel is actually wired up.
5. The 16 literal `" copy.md"` duplicates and the disused `Cleaner`/`refactor-cleaner` overlap —
   safe to delete/merge, but left out of this review's actions per the "propose, don't delete or
   move" constraint; flagged for a follow-up implementation pass.
