# NS2 F10 — Honest routing confidence, and a Tier-3 exit for "nevím kam"

> Operator ruling, 2026-07-30: _"přemýšlím jestli prostě nesmazat fallback
> klasifikátoru a pokud si prostě LLM klasifikátor není jistý kam s taskem tak
> nevyhodit otázku jako Tier 3."_

Answer taken into this plan: **the keyword scorer stays, but is demoted to an
availability net; the Tier-3 question is added on a different signal than the one
that exists today.** The two halves of the ruling are separable, and only the
second one is a real gap — see _Why not delete the scorer_ below.

> **Status: implemented (2026-07-30), all six tasks in one pass.** The living
> reference is now the code plus `docs/api/tasks.md`, `docs/api/roadmap.md` and
> `docs/api/approvals.md`. Four things came out differently from this plan; each is
> recorded here so the plan doesn't contradict the code:
>
> 1. **The parked item stays `enqueued`, guarded by a store scan** — not flipped to
>    `todo` as T5 proposed. The flip does not actually stop the re-park loop:
>    `autoPickup` re-enqueues every unblocked `todo` item on each tick, so an
>    `autoPlay` project would have stacked a fresh approval per tick (caught by the
>    test written for exactly that claim). `drain` now consults
>    `pendingRoutingItemIds` before releasing.
> 2. **No new activity kind.** `orchestrator-fallback` already exists and is recorded
>    by `TaskSchedulerService` — where it feeds the Agent Factory's recurring-gap
>    scan. A second entry from the classifier would double-count into that telemetry,
>    so the terminal fallback got `log.warn` and nothing more.
> 3. **`RoutingProposalService` is its own `ResumableRunner`**, not methods on the
>    gate: `RoadmapGateService.resume(projectId, itemId)` already exists and means
>    something else entirely.
> 4. **The proposals dir is a SIBLING of `roadmap/`**, not a child.
>    `RoadmapStore.projectIds()` treats every subdirectory of its root as a project
>    id, so nesting it there would have produced a phantom project.

## Why

Four defects, all in `apps/api/src/tasks/`.

**1. `confidence` is Haiku's self-assessment, and a missing field silently
becomes 0.5.** `claude-cli-router.ts:147` runs `--model haiku`; the prompt
(`:30`) asks the model for its own _"calibrated 0..1 belief"_; the parser takes it
verbatim (`:176`):

```ts
confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
```

Harmless today because nothing reads it as a gate. The moment a threshold hangs
on it, a **parse gap becomes a routing decision** — a reply that omits the field
lands at exactly 0.5 and gets treated as a real measurement. Separately, a small
model's absolute self-confidence is not calibrated: it mode-collapses on 0.9/0.95
and an absolute threshold either never fires or fires arbitrarily.

**2. There is no threshold on the LLM leg at all.** `task-classifier.service.ts:306-308`:

```ts
const routed = await this.router.route(input, candidates, opts.preamble);
if (routed && this.isCoherent(routed, candidates)) return routed;
```

`isCoherent()` checks _shape_ (parses to `TaskRoutingSchema`, names a target that
is actually in the catalog) — never _strength_. A coherent verdict returns
unconditionally. `ORCHESTRATOR_FALLBACK_THRESHOLD` (`:32`) applies **only** to the
keyword scorer (`:314`), and per its own docblock the scorer reports 0.22 at zero
matches and ≥0.55 from the first, so 0.5 is a binary "did any word hit" test — not
a confidence measure.

**3. "Don't know" is silent, and on the autonomous path resolves to the most
expensive possible guess.** The terminal rule (`:316-320`) logs at `info` and
returns a substitute target with `confidence: 0`. `SUBSYSTEM_FALLBACK` (`:82-113`)
is `"primary"` for all nine seated subsystems, so at stage 2 "unsure" means "run a
pipeline". That was a deliberate, correct fix for forge (the docblock at `:83-95`
explains it: escaping to the orchestrator produced runs with no PR-shaped output,
which `RoadmapGateService.reconcileRunning` then killed). But nowhere on the
autonomous path — `roadmap-gate.service.ts:543` → `classifySubsystem` → `createTask` —
does an unsure verdict reach a human. It dispatches and logs.

**4. The _resolved project_ never feeds the decision.** Raw path strings do reach
both legs — `claude-cli-router.ts:132` emits a `PATHS:` line into the prompt, and
`keyword-scorer.ts:92` folds them into the term haystack. What does **not** reach
the decision is the resolved project identity: `matchProject` runs in `enrich()`,
i.e. after the target is already chosen. Lower value than defects 1–3 (a code
project's path already contributes tokens), so this is scoped as a non-goal below
rather than a task.

## Why not delete the scorer

Two concrete costs, both verified:

- **It is the test-time classifier.** `claude-cli-router.ts:75` —
  `if (process.env.VITEST) return null;`. Under vitest the LLM leg _always_
  returns null, so the scorer is what produces every verdict in
  `task-classifier.service.test.ts` (30 kB) and `task-scheduler.service.test.ts`
  (80 kB). Deleting it collapses those suites into the terminal fallback unless a
  stub `TaskRouter` is injected at every call site first.
- **It is the CLI-outage net.** Missing binary, the 8 s `ROUTER_TIMEOUT_MS`,
  exhausted quota, malformed JSON. Without the scorer each of those becomes an
  operator question. In autonomous mode that means a dead subprocess wakes the
  operator — infra noise wearing Tier-3 clothing, and a direct hit on the North
  Star's "notify only when something is genuinely relevant".

So: **infra failure → deterministic guess (scorer, unchanged). Genuine ambiguity →
Tier-3.** Today both collapse into the same path; splitting them is the core of
this work.

## Design

### The signal: margin between the model's top two, not its absolute confidence

Ask the router for its **two** best picks, each with its own confidence, in one
call. Compute the margin ourselves. Two numbers from a single completion share the
model's calibration bias, so the _difference_ survives even when neither absolute
value means much — and "A vs B" is a judgment models make far better than "how
sure am I on a 0..1 scale". It also gives the operator question actual content:
_"forge, or codex?"_ instead of _"confidence 0.43, pick one of eleven"_.

Ambiguous when **either**:

- `runnerUp !== null && (top.confidence - runnerUp.confidence) < ROUTER_AMBIGUOUS_MARGIN` (start at `0.15`), or
- `top.confidence < ROUTER_CONFIDENCE_FLOOR` (start at `0.35`) — catches the
  explicit "I don't know" reply that names no second choice.

Both constants exported and documented as tunable-from-observation, in the same
spirit as `ORCHESTRATOR_FALLBACK_THRESHOLD`.

### The plumbing: the precedent already exists

`HandoffService` is the exact shape needed, and needs no live run:

- `handoff.service.ts:54` — `this.approvals.register("handoff-proposal", this)`
- `:136-147` — park the payload (`proposals.create`), then
  `requestApproval({ runId: proposal.id, kind: "handoff-proposal", … })` →
  return `{ action: "proposed", approvalId }`
- `:187-204` — `resume(proposalId)` reads the parked payload, dispatches, deletes;
  `cancel(proposalId)` just deletes

The `runId` is the proposal's own id — `ApprovalsService` never requires a live
child (`approvals.service.ts:68-102`), and `"pipeline-output"` / `"task-output"`
already use it that way. `HandoffOutcome` (`libs/contracts/src/handoff/handoff.schema.ts:196-209`)
is even the three-shape `dispatched | proposed | none` union this needs.

**Known limitation, called out on purpose:** `ApprovalsService` is
approve/reject only — there is no "pick one of N" primitive anywhere
(`gates/gate.schema.ts:33` has an `"ask"` _decision_, but that is a policy
evaluator, not a choice surface). So the parked question is **binary**: approve →
release with the top-1 as `explicitTarget`; reject → the item stays parked and the
operator re-releases naming the subsystem, which is already a hard override per
the North Star. The approval's `detail` names **both** candidates and both
reasons, so the operator sees the real choice even though the buttons are two. An
N-way picker is a follow-up (approvals contract + web), explicitly out of scope.

### Who acts on ambiguity — the asymmetry that keeps this small

`route()` starts reporting ambiguity; **each caller owns its own tier decision.**
The verdict is always present, so every existing call site keeps compiling and
keeps working:

| Call site | On ambiguous |
| --- | --- |
| `tasks.controller.ts:145` → `classify()` (interactive) | Nothing new. The preview + manual picker **is** the operator decision; just carry the flag to the wire so the UI can say "torn between X and Y" instead of showing a fake 0.9. |
| `classifyWithinSubsystem()` (stage 2) | **Ignore it — keep guessing.** Already inside a named subsystem; a wrong pick costs one `cheapestPipeline` run. Bounded. |
| `roadmap-gate.service.ts:543` → `classifySubsystem()` (autonomous stage 1) | **Park.** A wrong pick here costs the whole wrong subsystem, and no human sees a preview. |

Ask at stage 1, guess at stage 2. This also means `SUBSYSTEM_FALLBACK` does **not**
need a third `"ask"` value — dropping that from the earlier sketch.

## Tasks

**T1 — Honest confidence (`claude-cli-router.ts`, contracts).**
Drop the `: 0.5` default at `:176`; a missing/non-numeric `confidence` makes the
verdict unparseable → `parseVerdict` returns `null` → the infra path (scorer)
handles it. No contract change, `TaskRouting.confidence` stays non-nullable.
Extend `ROUTER_SYSTEM_PROMPT` (`:17-36`) to also request
`runnerUp: {targetKind,targetId,confidence,reason} | null`, and `RouterVerdict`
(`:38-48`) to tolerate its absence exactly as `loop`/`objective` already do
(`:179-181`). Add `runnerUp: TaskTargetSchema.extend({confidence, reason}).nullable().default(null)`
to `TaskRoutingSchema` (`libs/contracts/src/tasks/task.schema.ts:213`) — additive
and defaulted, so every stored record still parses. `KeywordScorer` returns
`runnerUp: null` (it has `scored[1]` at `keyword-scorer.ts:105` if we ever want it;
not now).

**T2 — The ambiguity predicate (`task-classifier.service.ts`).**
Export `ROUTER_AMBIGUOUS_MARGIN` / `ROUTER_CONFIDENCE_FLOOR` and a pure
`isAmbiguous(routing): boolean` next to the existing `isCoherent`. Pure function,
no I/O — unit-testable without touching the router.

**T3 — Split the two failure modes in `route()`.**
Return an internal discriminated result instead of a bare `TaskRouting`:

```ts
type RouteResult =
  | { kind: "routed"; routing: TaskRouting }
  | { kind: "ambiguous"; routing: TaskRouting }; // top-1 still present, plus runnerUp
```

- LLM throws / `null` / incoherent → **infra** → scorer → threshold → terminal
  fallback. Byte-for-byte today's behaviour, still `kind: "routed"`.
- LLM coherent but `isAmbiguous` → `kind: "ambiguous"`, and the scorer is **not**
  consulted (a keyword guess must never overwrite a judgment call).
- Terminal fallback: `log.info` → `log.warn` plus an activity record, so "unsure"
  is visible in the record rather than only in a log line (Law 5). Cheap, and it
  makes the eventual tuning of T2's constants measurable.

`classify()` and `classifyWithinSubsystem()` unwrap to `.routing` and are otherwise
untouched — stage 2 deliberately discards the flag.

**T4 — Carry ambiguity to the interactive wire.**
Add `ambiguous: z.boolean().default(false)` to `TaskRoutingSchema`; `classify()`
sets it from T3. Web: the classification preview reads `ambiguous` + `runnerUp` and
surfaces both options instead of a single confident-looking row. Manual picker
already exists — this is copy and emphasis, not new interaction.

**T5 — The autonomous park (the actual Tier-3).**
Mirror the handoff trio:

- `libs/contracts/src/approvals/approval.schema.ts:12` — add
  `"routing-proposal"` to `ApprovalRunKindSchema`, documented like its neighbours
  (runId = the proposal id, no live child).
- New `RoutingProposalSchema` (task text, paths, projectId, roadmap itemId, the
  two candidate targets + reasons, `createdAt`) and a `RoutingProposalStore`
  copied from `handoff-proposal.store.ts` — write-once / read-once / delete, no
  `update`.
- New `RoutingProposalService`: registers itself as a `ResumableRunner` for
  `"routing-proposal"`; `park()` writes the payload + `requestApproval` with a
  `detail` naming both candidates; `resume(id)` re-releases the roadmap item with
  the top-1 as `explicitTarget`; `cancel(id)` deletes the payload and leaves the
  item parked.
- `roadmap-gate.service.ts` — on `ambiguous`, park and **return without calling
  `createTask`**. Critical: the item's lifecycle must **not** flip to `running`, or
  `reconcileRunning` kills it as "Run finished without producing an artifact" —
  the exact trap documented at `task-classifier.service.ts:83-95`. Same
  never-throws posture as `classifySubsystem` (`:622-640`): a park failure falls
  back to today's dispatch rather than failing the release.

**T6 — Tests.**
Unit: `isAmbiguous` truth table (margin boundary, floor boundary, `runnerUp: null`);
`parseVerdict` with `confidence` absent → `null`. Router-level: drive
`ClaudeCliRouter` through its `protected runClaude` seam (`:145`, documented as
overridable) — the `VITEST` guard at `:75` means an injected stub or that override
is the only way to exercise the LLM leg. Classifier: assert the two failure modes
diverge (throw → scorer; ambiguous → no scorer call). Gate: assert an ambiguous
release parks **and leaves lifecycle untouched**. Regression: existing
`task-classifier.service.test.ts` must still pass unchanged — the scorer is still
the effective leg under vitest, and that is the point.

## PR slicing

1. **T1 + T2 + T3** — signal + split, no behaviour change for any caller
   (`ambiguous` produced but consumed nowhere). Safe to land alone.
2. **T4** — interactive surface. Independently useful: the operator immediately
   sees which routings were coin-flips, which is the data needed to tune T2's two
   constants before anything auto-parks.
3. **T5** — the autonomous park. Land last, once (2) has shown how often
   `ambiguous` actually fires on real traffic.

Ordering matters: tuning the constants against observed interactive traffic
before wiring the park is what keeps T5 from turning into a notification firehose.

## Non-goals

- **Deleting `KeywordScorer`** — see _Why not delete the scorer_.
- **A multi-choice approval primitive.** The parked question is binary; an N-way
  picker is a separate contract + web change.
- **Asking at stage 2.** Bounded cost inside an already-named subsystem.
- **A third `SUBSYSTEM_FALLBACK` value.** Superseded by the stage-1/stage-2
  asymmetry.
- **Calibrating the model's confidence.** The margin sidesteps it; a real
  calibration effort (logprobs, an eval set) is its own project.
- **Feeding the resolved project into stage 1** (defect 4). Raw paths already
  reach both legs; moving `matchProject` ahead of target selection is a separate,
  lower-value change.
