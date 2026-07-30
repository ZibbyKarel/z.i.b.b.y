# NS2 F9 — Subsystem-only dispatch, and a complexity ladder per subsystem

> Operator ruling, 2026-07-30: _"globální switchboard by měl přiřazovat jen
> subsystémy. Každý agent a pipeline by měl být přiřazen do některého ze
> subsystémů. Nesmíme mít volné agenty a pipeliny."_ Plus: each dispatchable
> subsystem should carry agents **and** two-to-three pipelines ordered cheapest
> and shortest → most expensive and most complex, so a task can be graded by
> complexity onto a single agent, a simple pipeline, or a deep one.

## Why

Three defects, all visible in `apps/api/src/tasks/task-classifier.service.ts`.

**1. Stage 1 ranks two different levels of abstraction against each other.**
`buildCandidates()` returns agents **+** pipelines **+** subsystems in one flat
list, and one scorer (or one LLM call) ranks them together. The router is asked
to compare `code-reviewer` (an agent) against `Forge` (the subsystem that owns
that very agent). They are not peers — one contains the other. Whichever wins is
arbitrary, and the two winners lead to materially different runs: a direct agent
pick skips the subsystem's own sizing policy, while a subsystem pick pays a
second LLM round-trip that often lands on the same agent anyway.

**2. `EFFORT_RULE` applies only by accident.** The size policy ("narrow change →
agent, multi-surface → pipeline") lives in `buildSubsystemPreamble()`, which is
reached **only** on the scoped stage-2 call. Top-level `classify()` calls
`route(input, candidates)` with no preamble at all. So when the switchboard picks
`delivery` directly, nothing ever asks whether a five-phase pipeline is the right
hammer for a one-line fix.

**3. Ownership is asserted at one door and unenforced everywhere else.**
`agents.controller.ts:31` returns 422 without an `ownerSubsystem`, but the field
is `.optional()` in both `AgentSchema` and `PipelineObject`, the pipelines
controller has no equivalent check, and the stored fleet predates the rule.
Measured on the live, git-tracked fleet in `.zibby/data/`:

| | total | owned | unowned |
| --- | --- | --- | --- |
| agents | 61 | **5** (all forge) | **56** |
| pipelines | 8 | 7 | 1 (`demo-pipe`) |

Only **3 of 11** subsystems are seated (forge, scout, loom), because
`stage1SubsystemCandidates` filters to subsystems owning ≥1 unit. Flipping stage
1 to subsystem-only against today's data would collapse the routable surface from
69 units to 3. **So the fleet is the precondition, not the classifier.**

The right shape already exists and is already documented: `classifySubsystem()`
is described in its own docblock as _"the switchboard reduced to the one question
the North-Star-2 Subsystem Charter says it should ask: 'whose domain is this?'"_.
Today only `RoadmapGateService` uses it. F9 makes it the only stage 1.

## The taxonomy problem

The federation is organised by **ZIBBY's operational domains** (delivery,
monitoring, security, releases, research, outward voice, quality, memory,
budget, personal life). The stored fleet is organised by **software-industry job
titles** (`mobile-developer`, `seo-specialist`, `legal-advisor`,
`payment-integration`). These do not map onto each other, and forcing them to
produces a forge roster of ~35 units — which just moves the stage-1 problem down
one level and adds a round-trip.

So F9 **prunes** rather than widens. Most of the 61 are seeded demo agents from
`VoltAgent/awesome-claude-code-subagents` that ZIBBY never dispatches. The
surviving fleet is the set of units the federation actually needs, and every one
of them is owned.

## The ladder

Today the pipeline-vs-agent choice is binary and undescribed. F9 makes it an
explicit three-rung ladder, carried as data on the pipeline rather than inferred
from file order:

```ts
complexity: z.enum(["light", "standard", "deep"]).default("standard")
```

| rung | shape | when |
| --- | --- | --- |
| _(no pipeline)_ | one owned agent | single-surface, one file, a rename, a copy fix |
| `light` | 2–3 phases, cheap models | narrow but needs a second pair of eyes or a check |
| `standard` | 3–4 phases | ordinary work with review + verification |
| `deep` | 4–6 phases, loops, escalation | multi-surface, or genuinely needs design + review + tests + docs |

Data, not file order, because `SUBSYSTEM_FALLBACK`'s `"primary"` policy currently
reads `candidates[0]` and would silently change meaning the first time someone
reorders a directory listing. An enum also gives the stage-2 preamble something
concrete to describe, replacing `EFFORT_RULE`'s binary prose with a real ladder.

**Note the fallback changes what it resolves to.** `SUBSYSTEM_FALLBACK.forge =
"primary"` used to resolve to `delivery` — the *most* expensive unit forge owns —
because pipelines sorted before agents and `delivery` was the only pipeline in
the list. The policy ("unsure ⇒ run a pipeline") is right and stays; only its
resolution changes.

Since the scoped catalog is now ordered cheapest-first, `candidates[0]` is an
**agent**, which is precisely the wrong answer for an unsure verdict — a bare
agent is what produced forge runs with no PR-shaped output, which
`RoadmapGateService.reconcileRunning` then killed as "Run finished without
producing an artifact". So the fallback stops reading `candidates[0]` and names
its unit explicitly via a `cheapestPipeline()` helper: the lowest *pipeline* rung,
keeping review and verification in the path at a fraction of `deep`'s cost. This
also decouples the fallback from list order, which is what made it safe to
reorder the catalog for the router's benefit in the first place.

## Roster

Dispatchability is a property of the mandate, not a courtesy. Two subsystems get
no units at all: **beacon** is the Tier-3 surface-and-wait *contract*, not a
work-doer, and **ledger** is a budget/limits *service*. Both stay unseated, keep
`SUBSYSTEM_FALLBACK: "orchestrator"`, and are therefore absent from the stage-1
catalog — which is correct: no free-text task is "for beacon".

| subsystem | mandate | agents | `light` | `standard` | `deep` |
| --- | --- | --- | --- | --- | --- |
| **forge** | delivery | architect, fullstack-developer, frontend-developer, backend-developer, api-designer, code-reviewer, test-automator, documentation-engineer, debugger, refactoring-specialist, roadmap-decomposer\* | `quick-fix` | `patch` | `delivery` |
| **scout** | research | research-analyst, market-researcher, data-researcher, search-specialist, competitive-analyst, lead-researcher, trend-analyst | `quick-lookup` | `research` | `product-discovery` |
| **herald** | outward voice | copywriter, content-marketer, content-quality-editor, technical-writer, slack-expert, seo-specialist, sdr, account-executive, marketing-strategist | `content-piece` | `sales-outreach` | `content-campaign` |
| **loom** | codebase quality | qa-expert, performance-engineer, accessibility-auditor, ui-ux-tester, architect-reviewer, error-detective | `quality-scan` | — | `code-audit` |
| **sentinel** | external security | security-auditor, security-engineer, penetration-tester, compliance-auditor, dependency-manager | `dep-scan` | — | `security-audit` |
| **maestro** | releases | devops-engineer, deployment-engineer, git-workflow-manager, build-engineer | `release-notes` | — | `release-prep` |
| **puls** | heartbeat / CI | sre-engineer, incident-responder, devops-incident-responder | `ci-triage` | — | `incident-response` |
| **codex** | memory | knowledge-synthesizer, context-manager | `knowledge-capture` | — | — |
| **hearth** | personal | (personal-assistant) | `daily-agenda` | — | — |
| beacon | escalation contract | — | — | — | — |
| ledger | budget service | — | — | — | — |

\* `roadmap-decomposer` is explicit-only (`EXPLICIT_ONLY_AGENT_IDS`) — owned by
forge so it satisfies the ownership invariant, still never classified into.

Three pipelines move **scout → herald** (`content-piece`, `content-campaign`,
`sales-outreach`). Scout's mandate is _"výzkumné pipeline, které předávají
výsledný artefakt dál"_; herald's is _"mluví za ZIBBY navenek"_. Content and
outreach are outward voice, not research — they were only under scout because
scout was one of the three seated subsystems.

## Phases

| phase | change |
| --- | --- |
| **F9a** | Contract: `complexity` rung on `PipelineObject`; pipelines-controller create 422 mirroring `agents.controller.ts:31` |
| **F9b** | Prune `.zibby/data/agents/`; stamp an owner on every survivor and every pipeline |
| **F9c** | Pull missing crew from `VoltAgent/awesome-claude-code-subagents`, transforming upstream frontmatter into the stored format |
| **F9d** | Author the ladders — new pipelines + `complexity` on the existing seven + the scout→herald moves |
| **F9e** | `buildCandidates()` drops agent/pipeline candidates; `classify()` and `classifySubsystem()` converge; `EFFORT_RULE` becomes a ladder description; re-derive `SUBSYSTEM_FALLBACK` |
| **F9f** | Repair tests; project-wide lint/types/test |
| **F9g** | This doc + `docs/ns2/PROGRESS.md` rows |

## Invariants this arc establishes

1. **No free units.** Every stored agent and pipeline carries an
   `ownerSubsystem`, and `GET /api/subsystems/unowned` returns `[]`.

   **Correction, made during implementation:** the plan originally called for
   making `ownerSubsystem` non-optional in the schema. That is the wrong
   mechanism. `EntityFileStore`'s listing is deliberately tolerant — a file that
   fails schema validation is *skipped, never fatal* — so a required field would
   turn a hand-edited file that lost its owner into a **silent disappearance**
   from the catalog, and would make `/unowned` report `[]` for the wrong reason.
   Worse, it would break the healing path: `OwnerBackfillService` could no longer
   read the very files it exists to stamp.

   The field therefore stays `.optional()`, and the invariant is enforced by two
   other means that are both stronger and louder: the create paths **422** without
   an owner (agents already did; pipelines now do), and — the structural one —
   **an unowned unit is unroutable by construction**, because stage 1 emits only
   subsystems and a subsystem offers only units it owns. Nothing has to reject an
   unowned agent; there is simply no path that reaches it.
2. **Stage 1 asks exactly one question** — _whose domain is this?_ — and can
   answer only with a subsystem or the orchestrator.
3. **Stage 2 grades by cost.** Every subsystem exposes a ladder from one agent up
   to its deepest pipeline, and the scoped preamble describes that ladder.
4. **The explicit override is untouched.** Naming an agent or pipeline still
   skips the classifier entirely (the standing house rule). F9 removes the
   classifier's licence to *guess* a unit, not the operator's ability to *name*
   one.

## Deliberately not in scope

- **Sub-subsystem routing depth.** Stage 2 stays one hop. If a roster grows past
  ~10 units the answer is a tighter mandate, not a stage 3.
- **`routingHint` as a contract field.** The per-subsystem policy stays prose in
  the preamble (the F2b decision). `complexity` is added as data only because the
  fallback reads ordering and prose cannot carry an ordering.
- **Retiring `demo-pipe`.** It is an e2e fixture created by `e2e/global-setup.ts`
  over the API and is also the canonical "unowned" example in
  `owner-seed.test.ts`. Those tests move to a synthetic id rather than depending
  on a stored file. (The stale copy that had leaked into the live data dir from an
  e2e run IS deleted — e2e recreates it over the API, so nothing depends on it.)

- **`delivery.pipeline.md` declares no `outputs:`.** Found while authoring the new
  forge rungs, verified, and deliberately left alone. Its PR sink is not in
  frontmatter — it arrives per-run as `outputsOverride`, derived from the
  operator's chosen `TaskOutput` (`pipeline-runner.service.ts:310`, `:1180`), and
  `:1155` reads `run.outputsOverride ?? pipeline.outputs ?? []`. So a delivery run
  started WITHOUT a task-chosen output has no sink and produces no PR.

  Not a dispatch concern, so out of scope here — but note the asymmetry it leaves:
  `code-audit` declares its vault sink in frontmatter, and the new `quick-fix` /
  `patch` declare `pr` there too. Since an `outputsOverride` still wins when the
  task chooses one, a frontmatter declaration is a strictly safer default than
  none. Giving `delivery` the same one-line default is the obvious follow-up.
