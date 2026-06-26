# Phase 45 — Qualify: the review's verdict drives the loop

> ✅ **DELIVERED** (branch `feat/phase-45-qualify`). All six steps implemented and
> committed; full vitest workspace green except the documented pre-existing
> under-load e2e flakes (confirmed identical on `main` via worktree — Phase 45 adds
> zero new failures and fixes one pre-existing pipelines.e2e timeout). PR not opened
> — the PR is the gate (Law 3); awaiting the operator.

> Priority axis (LOOP.md): **#1 DELIVERY** (working code, not generated code). Borrows
> PAUL's _Execute → Qualify_ split. **Two layers, deliberately distinct:**
>
> - **Objective E/Q (deterministic, ~free):** the production delivery pipeline gets the
>   already-built `verify` phase — re-runs the project's checks _fresh_, exit-code drives
>   the back-edge. This is the real PAUL Qualify (don't trust the executor's self-report).
> - **Subjective gate (new):** the `review` agent's verdict (`pass`/`gap`/`drift`) drives
>   the same back-edge — a review that finds defects loops the work back instead of being
>   ignored. This is a _trust-based_ opinion gate layered on top of the objective one, not
>   a replacement for it. `gap` → Kodér (fix in place), `drift` → Architekt (re-plan).

## Gap (verified against real code, not masked)

The delivery loop's back-edge fires **only on a non-`done` stage**.
`pipeline-runner.service.ts:785` advances the cursor whenever `stageRun.status === "done"`;
the failure/retry block below it is reached only when the stage child **errored or was
interrupted**. So:

1. The production `review` phase (`apps/api/data/pipelines/delivery.pipeline.md`) runs the
   `code-reviewer` agent, which **successfully** writes `review.md` saying "found 3 critical
   bugs" → stage exits `done` → the pipeline marches on to `n-9` (tests) and `dokumentator`
   **with the known defects**. The `loop.to: koder` back-edge fires only if the reviewer
   process itself _crashes_. **The review's opinion is 100% invisible to the state machine.**
2. The production pipeline has **no `verify` phase** at all. Its doc body literally says
   _"Kvalitu si hlídá sám Kodér … není pro to zvláštní fáze"_ — the executor grades its own
   homework. The deterministic `verify` phase type already exists and already loops back
   correctly (exit-code driven, `verify-command.ts` + `drive()`), and the **test-data**
   pipeline (`.zibby/data-test/pipelines/delivery.pipeline.md`) uses it — production just
   never adopted it.

This phase closes both: production gets the objective `verify` gate, and agent phases gain
an opt-in **verdict** gate so a successful-but-failing review loops back.

## Why this is grounded (real state)

- Back-edge / escalate / park machinery: `drive()` at `pipeline-runner.service.ts:666–870`.
  Retries `Map<phaseId,number>`, `loop.maxRetries`, `escalate`, `then: "park"|"fail"|<id>`.
  **Reused untouched** — we only add a new _reason_ to take an existing edge, and one new
  target for it.
- Verify phase already deterministic & loop-driving: `verify-command.ts:18`,
  `DEFAULT_VERIFY_CHECKS` (`pipeline.schema.ts:45`). `runStage` returns the verify command
  regardless of `AGENT_RUNNER_MODE`, so a verify phase needs no agent/tokens.
- Phase/loop schema: `PipelinePhaseSchema` / `PhaseLoopSchema` (`pipeline.schema.ts:58–73`),
  validated by `refinePipeline` superRefine (`pipeline.schema.ts:118–183`).
- Stage record: `StageRunSchema` (`pipeline-run.schema.ts:44–52`) — binary
  `StageRunStatusSchema`. We add an **optional** `verdict` field here, NOT a new run status,
  so there is **zero blast radius** into `RunStatus` / `TaskRunStatus` / web `FeedStatus`
  (this satisfies the spirit of PAUL's richer outcome vocabulary at the correct layer — the
  stage, not the run).
- Activity ledger: `activity-log.service.ts:78` `record()`, closed `ActivityKind`
  (`activity.schema.ts:10–63`) — additive new kind `stage-verdict`.
- Demo lever for e2e: `demo-stage.mjs` first-attempt marker-file pattern (the `limitPhases`
  block) — the right way to make a phase fail once then pass on retry without tokens.

## Design

A `qualify: true` agent phase, after it lands `done`, has its `produces` artifact parsed for
a `<verdict>` tag. The verdict routes the **existing** back-edge:

```
stage done?
  └─ phase.qualify?
        parse <verdict> from produces artifact
          pass            → advance cursor (unchanged)
          gap             → back-edge to loop.to        (Kodér: fix in place)
          drift           → back-edge to loop.driftTo   (Architekt: re-plan)
          missing/garbled → treat as gap   ← FAIL-CLOSED (a marked gate is never silently passed)
  └─ not qualify          → advance cursor (unchanged — every existing pipeline byte-identical)
```

- **Fail-closed only for `qualify` phases.** Absent verdict on a non-qualify phase keeps
  today's behaviour exactly. On a `qualify` phase a missing/unparseable verdict → `gap` →
  loops back (worst case parks on `retries` → surfaced to the operator) rather than shipping
  unreviewed work. LLMs drop tags routinely; the gate must not be walk-through-able.
- **Verdict values diverge mechanically** (or they'd be schema noise): `gap` and `drift`
  target _different_ phases. `gap` = "incomplete, missing acceptance criteria" → Kodér fixes
  in place via `loop.to`. `drift` = "solution went the wrong way" → Architekt re-plans via
  `loop.driftTo`. This is exactly PAUL's diagnostic failure routing (intent/spec/code) at
  the back-edge.
- **Retries unchanged:** the retry count is keyed on the qualify phase (`review`), same as a
  stage error today; `escalation` ladder still belongs to that phase; exhaustion still parks
  with `parkedReason: "retries"`.
- **Reason carried to the retried phase:** the parsed verdict + the review tail is folded
  into the existing failure-context handoff (`writeFailureContext` / `composeResumeContext`),
  so Kodér/Architekt learn _why_ they were re-dispatched.

---

## Step 1 — Verdict schema + pure parser

**Files:**
- Create: `libs/contracts/src/pipelines/stage-verdict.schema.ts`
- Modify: `libs/contracts/src/pipelines/index.ts` (re-export) — confirm the barrel path first
- Create: `apps/api/src/pipelines/stage-verdict.ts` (parser, beside `verify-command.ts`)
- Test: `apps/api/src/pipelines/stage-verdict.test.ts`

**Schema** (`stage-verdict.schema.ts`):

```ts
import { z } from "zod";

/**
 * A `qualify` phase's machine-readable outcome, emitted by the phase agent as a
 * `<verdict>…</verdict>` tag in its produced artifact and parsed by the runner.
 * - `pass`  — work is accepted; the cursor advances.
 * - `gap`   — incomplete (missing acceptance criteria) → back-edge to `loop.to`.
 * - `drift` — wrong direction → back-edge to `loop.driftTo` (re-plan).
 * Only `pass` advances; `gap`/`drift`/absent all take the back-edge (fail-closed).
 */
export const StageVerdictSchema = z.enum(["pass", "gap", "drift"]);
export type StageVerdict = z.infer<typeof StageVerdictSchema>;
```

**Parser** (`stage-verdict.ts`):

```ts
import { StageVerdict, StageVerdictSchema } from "@zibby/contracts";

/**
 * Extract a `<verdict>pass|gap|drift</verdict>` tag from a qualify phase's produced
 * artifact. Case-insensitive, whitespace-tolerant, uses the LAST tag (an agent may
 * quote the instruction earlier in its write-up). Returns null when no valid tag is
 * present — the caller decides the fail-closed default.
 */
export function parseStageVerdict(text: string): StageVerdict | null {
  const re = /<verdict>\s*(pass|gap|drift)\s*<\/verdict>/gi;
  let last: string | null = null;
  for (const m of text.matchAll(re)) last = m[1]!.toLowerCase();
  const parsed = StageVerdictSchema.safeParse(last);
  return parsed.success ? parsed.data : null;
}
```

- [x] **Unit tests** (`stage-verdict.test.ts`):
  - `<verdict>pass</verdict>` → `"pass"`; `<VERDICT> GAP </VERDICT>` → `"gap"`;
    `<verdict>drift</verdict>` → `"drift"`.
  - Two tags (`…quote `<verdict>pass</verdict>`… <verdict>gap</verdict>`) → **last wins** →
    `"gap"`.
  - No tag / empty string / `<verdict>maybe</verdict>` → `null`.
- [x] Run: `npx vitest run apps/api/src/pipelines/stage-verdict.test.ts` → PASS.

---

## Step 2 — Phase schema: `qualify` + `driftTo`, with validation

**Files:**
- Modify: `libs/contracts/src/pipelines/pipeline.schema.ts`
  (`PhaseLoopSchema` ~`:31`, `PipelinePhaseSchema` ~`:58`, `refinePipeline` ~`:118`)
- Modify: `libs/contracts/src/pipelines/pipeline-run.schema.ts` (`StageRunSchema` ~`:44`)
- Test: `libs/contracts/src/pipelines/pipeline.schema.test.ts` (extend if present, else create)

**Changes:**

`PhaseLoopSchema` — add the re-plan target:

```ts
export const PhaseLoopSchema = z.object({
  to: z.string().min(1),
  maxRetries: z.number().int().min(0),
  escalate: z.boolean(),
  then: z.string().min(1),
  escalation: z.array(PhaseEscalationSchema).optional(),
  /** A qualify phase's `drift` verdict routes here instead of `to` (default: `to`). */
  driftTo: z.string().min(1).optional(),
});
```

`PipelinePhaseSchema` — add the opt-in flag:

```ts
  commands: z.array(z.string().min(1)).optional(),
  /** Agent phase only: parse a <verdict> from `produces`; non-`pass` takes the back-edge. */
  qualify: z.boolean().optional(),
  loop: PhaseLoopSchema.optional(),
```

`refinePipeline` — add inside the `p.phases.forEach` body (after the existing per-type block,
before/after the loop-target check):

```ts
    // A qualify gate is meaningless without a back-edge to take, makes no sense on a
    // deterministic verify phase, and its drift target must resolve like to/then.
    if (ph.qualify) {
      if (ph.type !== "agent")
        ctx.addIssue({ code: z.ZodIssueCode.custom,
          message: "qualify is for agent phases only", path: ["phases", i, "qualify"] });
      if (!ph.loop)
        ctx.addIssue({ code: z.ZodIssueCode.custom,
          message: "a qualify phase requires a loop", path: ["phases", i, "qualify"] });
    }
    if (ph.loop?.driftTo && !idSet.has(ph.loop.driftTo))
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        message: `loop.driftTo "${ph.loop.driftTo}" is not an existing phase id`,
        path: ["phases", i, "loop", "driftTo"] });
```

`StageRunSchema` — surface the verdict (additive, optional → no migration):

```ts
export const StageRunSchema = z.object({
  phaseId: z.string().min(1),
  runId: z.string().min(1),
  attempt: z.number().int().min(1),
  status: StageRunStatusSchema,
  /** A qualify phase's parsed verdict (Phase 45); absent on non-qualify phases. */
  verdict: StageVerdictSchema.optional(),
});
```
(Import `StageVerdictSchema` at the top of `pipeline-run.schema.ts`.)

- [x] **Unit tests** (schema): a pipeline with `review` `qualify:true` + `loop.driftTo:
  "architekt"` (an existing id) **parses**. Each of these **fails** validation with the
  expected message: `qualify:true` on a `verify` phase; `qualify:true` with no `loop`;
  `loop.driftTo: "ghost"` (no such phase). A `StageRun` with `verdict:"gap"` parses; a
  legacy `StageRun` with no `verdict` still parses.
- [x] Run: `npx vitest run libs/contracts` → PASS. `pnpm typecheck` clean (the new optional
  fields must not break `PipelineRun` construction anywhere).

---

## Step 3 — `drive()` qualifies a `done` phase (the heart) + demo lever + e2e

**Files:**
- Modify: `apps/api/src/pipelines/pipeline-runner.service.ts` (`drive()`, the
  `if (stageRun.status === "done")` block at `:785` and the failure block at `:797–823`)
- Modify: `apps/api/src/pipelines/demo-stage.mjs` (add a verdict lever)
- Test (unit): `apps/api/src/pipelines/pipeline-runner.service.test.ts`
- Test (e2e): `apps/api/test/qualify-loop.e2e.test.ts` (new)

**`drive()` change** — replace the top of the `done` handling so a qualify phase is graded
before it advances, and route the back-edge by verdict. Insert right after `run.stageRuns.push(stageRun); await this.writeAggregate(run);` and rework the `done` gate:

```ts
      // Phase 45: a `qualify` agent phase that ran clean is graded on the verdict it
      // wrote into its artifact. pass advances; gap/drift/absent take the back-edge
      // (fail-closed). The verdict is recorded on the stage for surfacing + activity.
      let qualifyFail: { verdict: StageVerdict } | null = null;
      if (stageRun.status === "done" && phase.qualify && phase.produces) {
        const artifact = await fs
          .readFile(path.join(stageCwd, phase.produces), "utf8")
          .catch(() => "");
        const verdict = parseStageVerdict(artifact) ?? "gap"; // fail-closed
        stageRun.verdict = verdict;
        await this.activity.record({
          kind: "stage-verdict",
          summary: `qualify "${phase.id}" → ${verdict}`,
          refs: { pipelineId: run.pipelineId, status: verdict },
        });
        if (verdict !== "pass") qualifyFail = { verdict };
      }

      if (stageRun.status === "done" && !qualifyFail) {
        // …existing advance block unchanged (verify-commands marker, checkpoint, cursor++)…
        continue;
      }

      // Stage failed, was interrupted, OR a qualify phase returned gap/drift.
      const loop = phase.loop;
      // drift re-plans (Architekt); gap / a real error fix in place (Kodér).
      const retryTarget =
        qualifyFail?.verdict === "drift" ? (loop?.driftTo ?? loop?.to) : loop?.to;
      if (loop && (retries.get(phase.id) ?? 0) < loop.maxRetries) {
        retries.set(phase.id, (retries.get(phase.id) ?? 0) + 1);
        this.log.warn("pipeline phase failed; retrying", {
          phase: phase.id,
          status: stageRun.status,
          verdict: qualifyFail?.verdict,
          attempt,
          retryTo: retryTarget,
        });
        handoffSource = await this.writeFailureContext(run, phase, stageRun);
        pendingResumeContext = await this.composeResumeContext(run, phaseIds, {
          failureTail: qualifyFail
            ? `verdict=${qualifyFail.verdict}\n${await this.tailLog(stageRun.runId)}`
            : await this.tailLog(stageRun.runId),
        });
        cursor = retryTarget!;
        await this.writeProgress(run, phaseIds);
        continue;
      }
      // …existing park / escalate / fail tail unchanged…
```

Imports at top of the service: `parseStageVerdict` from `./stage-verdict`, `StageVerdict`
from `@zibby/contracts`. `this.activity` is the already-injected `ActivityLogService`
(confirm the field name when wiring — the service already records pipeline activity).

**`demo-stage.mjs` lever** — add near the `limitPhases` block, and append the tag when the
phase produces its artifact:

```js
// Phase 45: phases that emit a <verdict>gap</verdict> on the FIRST attempt (marker in
// the stable stage cwd), then <verdict>pass</verdict> — exercising the qualify back-edge.
const gapPhases = (process.env.PIPELINE_DEMO_GAP_PHASES || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
```
…and where it writes `producesRel`:
```js
  if (producesRel) {
    const out = path.join(cwd, producesRel);
    await mkdir(path.dirname(out), { recursive: true });
    let verdict = "";
    if (gapPhases.includes(phaseId)) {
      const marker = path.join(cwd, `.verdict-${phaseId}`);
      const already = await readFile(marker, "utf8").catch(() => null);
      verdict = `\n<verdict>${already === null ? "gap" : "pass"}</verdict>\n`;
      if (already === null) await writeFile(marker, "1", "utf8");
    }
    await writeFile(out, `output of ${phaseId} @ ${new Date().toISOString()}\n${verdict}`, "utf8");
    console.log(`Stage ${phaseId} produced ${producesRel}`);
  }
```

- [x] **Unit tests** (`pipeline-runner.service.test.ts`, demo mode):
  - A 3-phase pipeline `a → review[qualify, loop{to:a, driftTo:a, maxRetries:1, then:park}] →
    z`, with `PIPELINE_DEMO_GAP_PHASES=review`: first `review` → verdict `gap` → cursor
    back to `a`; second `review` → `pass` → reaches `z`; final `status:"done"`. Assert the
    `review` stage runs twice and the **first** `StageRun.verdict === "gap"`, the **second**
    `=== "pass"`.
  - Verdict-absent fail-closed: a qualify phase whose artifact has **no** tag (a plain demo
    phase, no `GAP_PHASES`) → graded `gap` → back-edge taken (not advanced).
  - `drift` routing: a qualify phase emitting `drift` with `loop.driftTo` set to a different
    phase → cursor goes to `driftTo`, not `to`. (Drive a `drift`-emitting demo variant, or
    unit-test the target-selection by asserting the next stage's `phaseId`.)
  - Non-qualify regression: an ordinary pipeline with no `qualify` phase behaves exactly as
    before (existing tests stay green — do not edit their expectations).
- [x] **e2e** (`qualify-loop.e2e.test.ts`, `AGENT_RUNNER_MODE` unset → demo): seed a project
  + a qualify pipeline, dispatch a task, poll the run to terminal. Assert: the run reaches
  `done`, the `review` phase has `attempt: 2` with a `gap` then `pass` verdict, and an
  `activity` `stage-verdict` entry was recorded. Mirror the harness of
  `pipelines.e2e.test.ts` (temp `ZIBBY_DATA_DIR`, demo stage).
- [x] Run: `npx vitest run apps/api/src/pipelines/pipeline-runner.service.test.ts` and
  `npx vitest run apps/api/test/qualify-loop.e2e.test.ts` → PASS.

---

## Step 4 — Tell the agent to emit a verdict (instruction injection + anti-rationalization)

**Files:**
- Modify: `apps/api/src/pipelines/pipeline-runner.service.ts` — extract the task-string
  assembly (`:1481–1489`) into an exported pure `buildStageTask(...)` and add the qualify
  rider.
- Test: `apps/api/src/pipelines/build-stage-task.test.ts` (new, pure unit)

**Why injection, not editing the shared agent:** the `code-reviewer` agent
(`apps/api/data/agents/code-reviewer.md`) is used in other contexts; the verdict contract is
a property of the _qualify phase_, not the agent. Injecting via the runner keeps the
anti-rationalization guard scoped to qualify phases (advisor's note — do **not** put it in the
global `OPERATING_CONTRACT`, which prepends to every run).

**Change** — replace the inline `task` array with:

```ts
export function buildStageTask(opts: {
  phaseId: string;
  consumesAbs: string | null;
  producesAbs: string | null;
  qualify?: boolean;
}): string {
  const { phaseId, consumesAbs, producesAbs, qualify } = opts;
  return [
    `Proveď fázi pipeline "${phaseId}".`,
    consumesAbs ? `Vstup (pokud existuje) najdeš v "${consumesAbs}".` : "",
    producesAbs ? `Výstup zapiš do "${producesAbs}".` : "",
    qualify
      ? "Na úplný konec výstupu zapiš svůj verdikt přesně jedním tagem: " +
        "<verdict>pass</verdict> (práce splňuje zadání), " +
        "<verdict>gap</verdict> (chybí část zadání → vrátí se k dopracování), nebo " +
        "<verdict>drift</verdict> (řešení míří jinam → přeplánuje se). " +
        "Nehodnoť shovívavě: „mělo by to fungovat", „už jsem to kontroloval" ani " +
        "„je to skoro hotové" nejsou pass — pokud sis nálezy znovu neověřil přímo " +
        "v souborech, je to gap. Bez tagu se práce automaticky vrací k přepracování."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
```

Call site (claude branch): `const task = buildStageTask({ phaseId: phase.id, consumesAbs,
producesAbs, qualify: phase.qualify });`

- [x] **Unit tests** (`build-stage-task.test.ts`):
  - Non-qualify phase → string contains the consume/produce lines and **no** `<verdict>`
    instruction.
  - `qualify:true` → string contains all three verdict tokens (`pass`/`gap`/`drift`) and the
    anti-rationalization clause ("není pass").
- [x] Run: `npx vitest run apps/api/src/pipelines/build-stage-task.test.ts` → PASS.

---

## Step 5 — Activity kind + web surfacing of the verdict

**Files:**
- Modify: `libs/contracts/src/activity/activity.schema.ts` (`ActivityKind` enum ~`:10–63`)
- Modify: `apps/web/features/runs/components/PipelineStageTimeline.tsx` (already in the
  working tree — read it first; add a verdict chip when `stageRun.verdict` is set)
- Modify: `apps/web/i18n/messages/{cs,en}.json` (verdict labels)
- Test: `libs/contracts/src/activity/activity.schema.test.ts` (extend) +
  `apps/web/features/runs/components/PipelineStageTimeline.test.tsx` (extend if present)

**Changes:**
- Add `"stage-verdict"` to the `ActivityKind` enum (additive; closed enum, so the
  `record()` call in Step 3 type-checks).
- `PipelineStageTimeline`: when a stage has `verdict`, render a small DS chip — `pass`
  (good tone), `gap`/`drift` (warn tone) — selected via `data-testid` per the DS testid
  convention. **Compose from DS primitives; no inline `style`** (project rule).
- i18n keys `pipeline.verdict.{pass,gap,drift}` in `cs.json` + `en.json` (cs default):
  cs `{ pass: "Schváleno", gap: "Chybí část", drift: "Mimo zadání" }`,
  en `{ pass: "Approved", gap: "Incomplete", drift: "Off-track" }`.

- [x] **Unit tests:** `ActivityEntry` with `kind:"stage-verdict"` parses (contracts test).
  `PipelineStageTimeline` renders the verdict chip with the right label/testid when
  `verdict` is set, and renders none when it is absent (web-components test).
- [x] Run: `npx vitest run libs/contracts` and the web-components project → PASS.

---

## Step 6 — Wire the production delivery pipeline (objective verify + subjective qualify)

**Files:**
- Modify: `apps/api/data/pipelines/delivery.pipeline.md` (frontmatter `phases` + body prose)
- Test (e2e): `apps/api/test/delivery-pipeline.e2e.test.ts` (new — a contract/parse assertion,
  **not** a real lint/tsc run)

**Frontmatter changes:**
1. Insert a **`verify`** phase between `koder` and `review` (objective gate; deterministic,
   loops back to Kodér — the real E/Q):
   ```yaml
     - id: verify
       type: verify
       loop:
         to: koder
         maxRetries: 3
         escalate: true
         then: park
   ```
   (No `commands` → resolves to `project.checks ?? DEFAULT_VERIFY_CHECKS`, exactly like the
   test-data pipeline's verify phase.)
2. Mark **`review`** as a qualify gate and give `drift` its re-plan target:
   ```yaml
     - id: review
       …
       qualify: true
       loop:
         to: koder
         driftTo: architekt
         maxRetries: 3
         escalate: true
         then: park
         escalation: [ … unchanged … ]
   ```
   `review.consumes` stays `implementation.md`; with the verify phase inserted, the handoff
   into `review` is still the last _producing_ phase's output (verify produces nothing —
   `drive()` leaves the handoff untouched on a verify phase, confirmed at `:782`).

**Body prose:** replace the _"Kvalitu si hlídá sám Kodér … není pro to zvláštní fáze"_
paragraph — the delivery loop is now **Architekt → Kodér ⇄ Verify ⇄ Review → Dokumentátor**;
document that `verify` re-runs the project's checks deterministically, that `review` emits a
`pass`/`gap`/`drift` verdict, and that `drift` returns to the Architekt while `gap`/verify
failures return to the Kodér.

- [x] **e2e** (`delivery-pipeline.e2e.test.ts`): load the production pipeline through the
  real pipeline store/parser and assert it **validates**, that a `verify` phase exists with
  `loop.to === "koder"`, and that the `review` phase has `qualify === true` and
  `loop.driftTo === "architekt"`. (Behaviour of the verdict loop-back is already proven in
  Step 3's demo e2e; this step guards the **production data file** against drift, without
  running heavyweight checks in CI.)
- [x] Run: `npx vitest run apps/api/test/delivery-pipeline.e2e.test.ts` → PASS.

---

## Definition of done (every step, then the whole phase)

A step is not done until, from the repo root:

```bash
pnpm lint                          # ESLint auto-fix / project formatter — clean
npx tsc -p apps/api/tsconfig.json --noEmit   # api types (rtk typecheck masks errors — call tsc directly)
npx tsc -p apps/web/tsconfig.json --noEmit   # web types (only steps touching web)
pnpm test                          # full vitest workspace — all 6 projects green
```

…all pass with **no new failures** vs. the pre-phase baseline (the known under-load e2e
flakes — see memory — are confirmed on a clean tree before blaming this work; compare via a
`git worktree`, never stash/pop). Then: `graphify update .` (AST-only, no API cost) and a
**checkpoint commit per step** (`feat(pipelines): …`), **no push** — the PR is the gate
(Law 3). Wait for the operator before opening the PR.

## Scope / out of scope

**In:** objective verify gate in production; subjective `pass`/`gap`/`drift` verdict gate
with `gap`→Kodér / `drift`→Architekt routing; verdict surfaced on the stage + activity ledger;
anti-rationalization guard scoped to qualify phases.

**Out (→ future phases, deliberately not bundled):**
- **Richer run-status vocabulary** (`DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED` on
  `RunStatus`) — large contract blast radius (`TaskRunStatus`, web `FeedStatus`); the stage
  `verdict` covers the delivery-loop need without it.
- **Scope-adaptive ceremony** (PAUL quick-fix/standard/complex) — touches the task classifier
  (`features/.../classify`), a separate subsystem.
- **Context-bracket management inside goal iterations** (FRESH/MODERATE/DEEP/CRITICAL) — a
  goal-runner concern, separate from the pipeline loop.
- **Independent re-verification of the review's _claims_** (the reviewer re-reads files but a
  second agent doesn't re-derive the verdict) — the objective `verify` phase is the
  deterministic half; a second adversarial reviewer is a possible later hardening.
```
