# Orb status declutter + subsystem error state Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant "V klidu"-style status text from the ambient `/chat` orb map (state is already carried by halo color + orbit dot count) and give subsystems a real `error` state so a failed run reads distinctly (red, "Chyba") from a successful one, instead of both folding into the same green `report` bucket.

**Architecture:** A contract-level `error` `SubsystemState` flows from `SubsystemsService` (which now splits `done`/`error` terminal runs into separate `tier2Count`/`errorCount`) through the existing `SUBSYSTEM_ORB_STATE` → DS `OrbState` table (mapping `error` → the already-built-but-unused `incident` orb chrome) to three consumers: the ambient map (color/motion only, no text), the subsystem drawer (state pill text + count badge), and the briefing (dot tone + a new "N failed" line). Ambient-map text removal is a separate, independent change to `OrbNode`/`OrbMap` in the design system.

**Tech Stack:** NestJS + ts-rest (`apps/api`), Next.js 15 + React 19 (`apps/web`), Zod contracts (`libs/contracts`), DS immersive components (`libs/design-system`), Vitest, next-intl.

## Global Constraints

- No settings/toggle to restore the status text — the removal is permanent (operator confirmed).
- `tier2Count` narrows in meaning to "successful (done) terminal runs since last seen" — it no longer includes errors. Every reader must be updated in the same task that changes the producer, so nothing silently under-counts mid-plan.
- Precedence (single subsystem's headline state): `waiting > error > running > report > idle`.
- List/briefing ordering (severity across subsystems): `waiting > error > report > running > idle`.
- `SUBSYSTEM_ORB_STATE.error` maps to DS `OrbState` `"incident"` — no new DS state, no new DS color/motion, just wiring an existing, previously-unreachable table entry.
- Strict TypeScript, no `any`. Follow existing test patterns per file (Vitest, `renderWithProviders`/`screen`/`within` from `apps/web/test/render`, DS `data-testid` enums).
- After each file edit: `pnpm exec prettier --write <file>` + `pnpm exec eslint --fix <file>`, then run the file's own test (scoped, not repo-wide).

---

### Task 1: Contract — `error` state + split counts

**Files:**

- Modify: `libs/contracts/src/subsystems/subsystem.schema.ts:142,151-156`
- Modify: `libs/contracts/src/briefing/briefing.schema.ts:77-85`

**Interfaces:**

- Produces: `SubsystemState` now includes `"error"`. `SubsystemWithStatus` gains `errorCount: number` (nonnegative int) alongside existing `tier2Count`/`tier3Count`. `BriefingSubsystemLine` gains the same `errorCount: number`.

- [ ] **Step 1: Update `SubsystemStateSchema` and `SubsystemWithStatusSchema`**

In `libs/contracts/src/subsystems/subsystem.schema.ts`, replace:

```ts
export const SubsystemStateSchema = z.enum(["idle", "running", "report", "waiting"]);
export type SubsystemState = z.infer<typeof SubsystemStateSchema>;

/**
 * A subsystem's identity plus its live status: `state` plus how many Tier-2
 * (act-then-report) and Tier-3 (surface-and-wait) items are outstanding. The
 * shape lands in phase 80 so the web query is stable; phase 82 fills in real
 * counts instead of the phase-80 stub `{ state: "idle", tier2Count: 0, tier3Count: 0 }`.
 */
export const SubsystemWithStatusSchema = SubsystemSchema.extend({
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
});
export type SubsystemWithStatus = z.infer<typeof SubsystemWithStatusSchema>;
```

with:

```ts
export const SubsystemStateSchema = z.enum(["idle", "running", "report", "waiting", "error"]);
export type SubsystemState = z.infer<typeof SubsystemStateSchema>;

/**
 * A subsystem's identity plus its live status: `state` plus how many Tier-2
 * (act-then-report) and Tier-3 (surface-and-wait) items are outstanding, plus
 * how many owned runs failed. `tier2Count` counts only SUCCESSFUL (`done`)
 * terminal runs since last seen — a failed run counts toward `errorCount`
 * instead, never both.
 */
export const SubsystemWithStatusSchema = SubsystemSchema.extend({
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
});
export type SubsystemWithStatus = z.infer<typeof SubsystemWithStatusSchema>;
```

- [ ] **Step 2: Update `BriefingSubsystemLineSchema`**

In `libs/contracts/src/briefing/briefing.schema.ts`, replace:

```ts
export const BriefingSubsystemLineSchema = z.object({
  subsystem: SubsystemIdSchema,
  name: z.string().min(1),
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
  note: z.string().optional(),
});
export type BriefingSubsystemLine = z.infer<typeof BriefingSubsystemLineSchema>;
```

with:

```ts
export const BriefingSubsystemLineSchema = z.object({
  subsystem: SubsystemIdSchema,
  name: z.string().min(1),
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(),
  tier3Count: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  note: z.string().optional(),
});
export type BriefingSubsystemLine = z.infer<typeof BriefingSubsystemLineSchema>;
```

- [ ] **Step 3: Typecheck the contracts package**

Run: `pnpm exec tsc -p libs/contracts --noEmit`
Expected: no errors (this package has no other readers of these two schemas — every consumer is fixed in later tasks, which is why the plan proceeds package-by-package rather than typechecking the whole repo yet).

- [ ] **Step 4: Commit**

```bash
git add libs/contracts/src/subsystems/subsystem.schema.ts libs/contracts/src/briefing/briefing.schema.ts
git commit -m "feat(contracts): add subsystem error state + errorCount"
```

---

### Task 2: Backend — `SubsystemsService` splits report/error + precedence

**Files:**

- Modify: `apps/api/src/subsystems/subsystems.service.ts`
- Modify: `apps/api/src/subsystems/subsystems.service.test.ts`

**Interfaces:**

- Consumes: `SubsystemState` (now includes `"error"`), `SubsystemWithStatus.errorCount` from Task 1.
- Produces: `SubsystemsService.list()`/`.get()`/`.markSeen()` now return `errorCount`, and can return `state: "error"`.

- [ ] **Step 1: Update the failing/changing tests first**

In `apps/api/src/subsystems/subsystems.service.test.ts`, replace the existing test (lines 229–244) that currently asserts an errored run counts toward `report`:

```ts
it("an errored owned run after lastSeenAt also counts toward report", async () => {
  const { service } = build({
    pipelines: [pipelineFixture("delivery", "forge")],
    runs: [
      taskRunFixture({
        runId: "delivery_1",
        kind: "pipeline",
        owner: "delivery",
        status: "error",
        startedAt: LATER,
      }),
    ],
  });
  const forge = await service.get("forge");
  expect(forge).toMatchObject({ state: "report", tier2Count: 1 });
});
```

with:

```ts
it("an errored owned run after lastSeenAt reads as error with its own count, not report", async () => {
  const { service } = build({
    pipelines: [pipelineFixture("delivery", "forge")],
    runs: [
      taskRunFixture({
        runId: "delivery_1",
        kind: "pipeline",
        owner: "delivery",
        status: "error",
        startedAt: LATER,
      }),
    ],
  });
  const forge = await service.get("forge");
  expect(forge).toMatchObject({ state: "error", tier2Count: 0, errorCount: 1 });
});

it("a done AND an errored owned run after lastSeenAt both count, error wins the headline state", async () => {
  const { service } = build({
    pipelines: [pipelineFixture("delivery", "forge"), pipelineFixture("release", "forge")],
    runs: [
      taskRunFixture({
        runId: "delivery_1",
        kind: "pipeline",
        owner: "delivery",
        status: "done",
        startedAt: LATER,
      }),
      taskRunFixture({
        runId: "release_1",
        kind: "pipeline",
        owner: "release",
        status: "error",
        startedAt: LATER,
      }),
    ],
  });
  const forge = await service.get("forge");
  expect(forge).toMatchObject({ state: "error", tier2Count: 1, errorCount: 1 });
});

it("precedence: error outranks a still-running owned run", async () => {
  const { service } = build({
    pipelines: [pipelineFixture("delivery", "forge"), pipelineFixture("release", "forge")],
    runs: [
      taskRunFixture({
        runId: "delivery_1",
        kind: "pipeline",
        owner: "delivery",
        status: "running",
      }),
      taskRunFixture({
        runId: "release_1",
        kind: "pipeline",
        owner: "release",
        status: "error",
        startedAt: LATER,
      }),
    ],
  });
  const forge = await service.get("forge");
  expect(forge.state).toBe("error");
});

it("precedence: waiting still outranks error", async () => {
  const { service } = build({
    pipelines: [pipelineFixture("delivery", "forge"), pipelineFixture("release", "forge")],
    runs: [
      taskRunFixture({
        runId: "delivery_1",
        kind: "pipeline",
        owner: "delivery",
        status: "awaiting-approval",
      }),
      taskRunFixture({
        runId: "release_1",
        kind: "pipeline",
        owner: "release",
        status: "error",
        startedAt: LATER,
      }),
    ],
    pendingApprovals: [
      approvalFixture({ id: "appr-1", runId: "delivery_1", kind: "pipeline-output" }),
    ],
  });
  const forge = await service.get("forge");
  expect(forge.state).toBe("waiting");
});
```

Also update every other `toMatchObject`/object literal in this file that asserts `tier2Count`/`errorCount` together needs no change EXCEPT the ones above — the rest of the suite only exercises `done` runs (never `error`), so `errorCount` stays implicitly `0` there and those assertions are unaffected (`toMatchObject` doesn't require every field).

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `pnpm exec vitest run apps/api/src/subsystems/subsystems.service.test.ts`
Expected: FAIL — `state` doesn't include `"error"` yet, `errorCount` doesn't exist on the aggregate.

- [ ] **Step 3: Split the terminal-run bucketing and extend precedence in `subsystems.service.ts`**

Replace the two precedence tables:

```ts
const STATE_PRECEDENCE: Record<SubsystemState, number> = {
  waiting: 0,
  running: 1,
  report: 2,
  idle: 3,
};
```

```ts
const LIST_ORDER_RANK: Record<SubsystemState, number> = {
  waiting: 0,
  report: 1,
  running: 2,
  idle: 3,
};
```

with:

```ts
const STATE_PRECEDENCE: Record<SubsystemState, number> = {
  waiting: 0,
  error: 1,
  running: 2,
  report: 3,
  idle: 4,
};
```

```ts
const LIST_ORDER_RANK: Record<SubsystemState, number> = {
  waiting: 0,
  error: 1,
  report: 2,
  running: 3,
  idle: 4,
};
```

Replace the `Aggregate` interface:

```ts
interface Aggregate {
  state: SubsystemState;
  tier2Count: number;
  tier3Count: number;
}
```

with:

```ts
interface Aggregate {
  state: SubsystemState;
  tier2Count: number;
  tier3Count: number;
  errorCount: number;
}
```

In `aggregateAll()`, replace:

```ts
const running = new Set<SubsystemId>();
const tier2Count = new Map<SubsystemId, number>();
const ownedPipelineRuns: OwnedPipelineRun[] = [];

for (const run of runs) {
  const owner =
    run.kind === "pipeline"
      ? pipelineOwner.get(run.owner)
      : run.kind === "chain"
        ? chainOwner.get(run.owner)
        : undefined;
  if (!owner) continue;
  if (run.kind === "pipeline") ownedPipelineRuns.push({ runId: run.runId, owner });

  if (run.status === "running") running.add(owner);

  if (run.status === "done" || run.status === "error") {
    const completedAt = completionSignal(run);
    const lastSeen = lastSeenById.get(owner);
    if (lastSeen !== undefined && completedAt > lastSeen) {
      tier2Count.set(owner, (tier2Count.get(owner) ?? 0) + 1);
    }
  }
}
```

with:

```ts
const running = new Set<SubsystemId>();
const tier2Count = new Map<SubsystemId, number>();
const errorCount = new Map<SubsystemId, number>();
const ownedPipelineRuns: OwnedPipelineRun[] = [];

for (const run of runs) {
  const owner =
    run.kind === "pipeline"
      ? pipelineOwner.get(run.owner)
      : run.kind === "chain"
        ? chainOwner.get(run.owner)
        : undefined;
  if (!owner) continue;
  if (run.kind === "pipeline") ownedPipelineRuns.push({ runId: run.runId, owner });

  if (run.status === "running") running.add(owner);

  if (run.status === "done" || run.status === "error") {
    const completedAt = completionSignal(run);
    const lastSeen = lastSeenById.get(owner);
    if (lastSeen !== undefined && completedAt > lastSeen) {
      const bucket = run.status === "error" ? errorCount : tier2Count;
      bucket.set(owner, (bucket.get(owner) ?? 0) + 1);
    }
  }
}
```

Replace the candidate-building loop:

```ts
const result = new Map<SubsystemId, Aggregate>();
for (const s of SUBSYSTEMS) {
  const t3 = tier3Count.get(s.id) ?? 0;
  const t2 = tier2Count.get(s.id) ?? 0;
  const candidates: SubsystemState[] = [
    ...(t3 > 0 ? (["waiting"] as const) : []),
    ...(running.has(s.id) ? (["running"] as const) : []),
    ...(t2 > 0 ? (["report"] as const) : []),
    "idle",
  ];
  const state = candidates.reduce((best, candidate) =>
    STATE_PRECEDENCE[candidate] < STATE_PRECEDENCE[best] ? candidate : best,
  );
  result.set(s.id, { state, tier2Count: t2, tier3Count: t3 });
}
return result;
```

with:

```ts
const result = new Map<SubsystemId, Aggregate>();
for (const s of SUBSYSTEMS) {
  const t3 = tier3Count.get(s.id) ?? 0;
  const t2 = tier2Count.get(s.id) ?? 0;
  const errs = errorCount.get(s.id) ?? 0;
  const candidates: SubsystemState[] = [
    ...(t3 > 0 ? (["waiting"] as const) : []),
    ...(errs > 0 ? (["error"] as const) : []),
    ...(running.has(s.id) ? (["running"] as const) : []),
    ...(t2 > 0 ? (["report"] as const) : []),
    "idle",
  ];
  const state = candidates.reduce((best, candidate) =>
    STATE_PRECEDENCE[candidate] < STATE_PRECEDENCE[best] ? candidate : best,
  );
  result.set(s.id, { state, tier2Count: t2, tier3Count: t3, errorCount: errs });
}
return result;
```

Update `withAggregate`'s fallback default:

```ts
function withAggregate(
  subsystem: (typeof SUBSYSTEMS)[number],
  aggregates: Map<SubsystemId, Aggregate>,
): SubsystemWithStatus {
  const aggregate = aggregates.get(subsystem.id) ?? { state: "idle", tier2Count: 0, tier3Count: 0 };
  return { ...subsystem, ...aggregate };
}
```

with:

```ts
function withAggregate(
  subsystem: (typeof SUBSYSTEMS)[number],
  aggregates: Map<SubsystemId, Aggregate>,
): SubsystemWithStatus {
  const aggregate = aggregates.get(subsystem.id) ?? {
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
  };
  return { ...subsystem, ...aggregate };
}
```

Finally, update `list()`'s tie-break sort:

```ts
return [...rows].sort((a, b) => {
  const rankDiff = LIST_ORDER_RANK[a.state] - LIST_ORDER_RANK[b.state];
  if (rankDiff !== 0) return rankDiff;
  if (a.state === "waiting") return b.tier3Count - a.tier3Count;
  if (a.state === "report") return b.tier2Count - a.tier2Count;
  return 0; // Array#sort is stable → registry order survives as the tiebreak.
});
```

with:

```ts
return [...rows].sort((a, b) => {
  const rankDiff = LIST_ORDER_RANK[a.state] - LIST_ORDER_RANK[b.state];
  if (rankDiff !== 0) return rankDiff;
  if (a.state === "waiting") return b.tier3Count - a.tier3Count;
  if (a.state === "error") return b.errorCount - a.errorCount;
  if (a.state === "report") return b.tier2Count - a.tier2Count;
  return 0; // Array#sort is stable → registry order survives as the tiebreak.
});
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `pnpm exec vitest run apps/api/src/subsystems/subsystems.service.test.ts`
Expected: PASS, all tests including the 4 new/changed ones.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/subsystems/subsystems.service.ts apps/api/src/subsystems/subsystems.service.test.ts
git commit -m "feat(api): split subsystem error runs from report, add error precedence"
```

---

### Task 3: Backend — briefing wiring (`errorCount` through the pipeline)

**Files:**

- Modify: `apps/api/src/briefing/briefing.service.ts:50-69`
- Modify: `apps/api/src/briefing/briefing-assembly.ts:413-421`

**Interfaces:**

- Consumes: `SubsystemWithStatus.errorCount` (Task 1/2), `BriefingSubsystemLine.errorCount` (Task 1).
- Produces: `buildSubsystemLines()` now populates `errorCount`; the backend's own text-rendering (`renderBriefingMarkdown` or equivalent, around line 419) narrates failures.

- [ ] **Step 1: Wire `errorCount` into `buildSubsystemLines`**

In `apps/api/src/briefing/briefing.service.ts`, replace:

```ts
return {
  subsystem: s.id,
  name: s.name,
  state: s.state,
  tier2Count: s.tier2Count,
  tier3Count: s.tier3Count,
  ...(note ? { note } : {}),
};
```

with:

```ts
return {
  subsystem: s.id,
  name: s.name,
  state: s.state,
  tier2Count: s.tier2Count,
  tier3Count: s.tier3Count,
  errorCount: s.errorCount,
  ...(note ? { note } : {}),
};
```

- [ ] **Step 2: Narrate failures separately in the markdown text**

In `apps/api/src/briefing/briefing-assembly.ts`, replace:

```ts
const counts: string[] = [];
if (s.tier3Count > 0) counts.push(`${s.tier3Count} waiting on you`);
if (s.tier2Count > 0) counts.push(`${s.tier2Count} reported`);
```

with:

```ts
const counts: string[] = [];
if (s.tier3Count > 0) counts.push(`${s.tier3Count} waiting on you`);
if (s.errorCount > 0) counts.push(`${s.errorCount} failed`);
if (s.tier2Count > 0) counts.push(`${s.tier2Count} reported`);
```

- [ ] **Step 3: Find and fix any existing test fixtures that build `BriefingSubsystemLine`/call `buildSubsystemLines` without `errorCount`**

Run: `pnpm exec tsc -p apps/api --noEmit`
Expected: reports every call site still missing `errorCount` (TS will fail to compile object literals typed as `BriefingSubsystemLine` that omit a newly-required field). Fix each reported line by adding `errorCount: 0` (or a value the test's scenario implies) to the literal.

- [ ] **Step 4: Run the briefing test files**

Run: `pnpm exec vitest run apps/api/src/briefing`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/briefing/briefing.service.ts apps/api/src/briefing/briefing-assembly.ts
git commit -m "feat(api): surface subsystem error counts in the briefing"
```

---

### Task 4: DS — `OrbNode` drops status text, gains `ariaLabel`

**Files:**

- Modify: `libs/design-system/src/immersive/OrbNode/OrbNode.tsx`
- Modify: `libs/design-system/src/immersive/OrbNode/OrbNode.test.tsx`
- Modify: `libs/design-system/src/immersive/OrbNode/OrbNode.stories.tsx`

**Interfaces:**

- Produces: `OrbNodeProps` drops `statusLabel`, gains optional `ariaLabel?: string` (falls back to `label` when omitted — every existing consumer that doesn't pass it keeps its current accessible name).
- `OrbNodeTestId.Status` is removed — no code anywhere may reference it after this task.

- [ ] **Step 1: Update the test file first**

In `libs/design-system/src/immersive/OrbNode/OrbNode.test.tsx`:

Replace the first test:

```tsx
it("renders the label and status text", () => {
  render(
    <OrbNode
      activeCount={2}
      diameter={72}
      hex="#5b8def"
      icon={<span>icon</span>}
      label="Forge"
      nodeId="forge"
      state="working"
      statusLabel="working"
    />,
  );
  expect(screen.getByTestId(OrbNodeTestId.Label)).toHaveTextContent("Forge");
  expect(screen.getByTestId(OrbNodeTestId.Status)).toHaveTextContent("working");
});
```

with:

```tsx
it("renders the label, with no status text node", () => {
  render(
    <OrbNode
      activeCount={2}
      diameter={72}
      hex="#5b8def"
      icon={<span>icon</span>}
      label="Forge"
      nodeId="forge"
      state="working"
    />,
  );
  expect(screen.getByTestId(OrbNodeTestId.Label)).toHaveTextContent("Forge");
  expect(screen.queryByTestId("orb-node-status")).toBeNull();
});

it("defaults the accessible name to the visible label", () => {
  render(
    <OrbNode
      activeCount={0}
      diameter={72}
      hex="#5b8def"
      icon={<span>icon</span>}
      label="Forge"
      nodeId="forge"
      state="working"
    />,
  );
  expect(screen.getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Forge");
});

it("uses ariaLabel over the visible label when supplied", () => {
  render(
    <OrbNode
      activeCount={0}
      ariaLabel="Forge, Working"
      diameter={72}
      hex="#5b8def"
      icon={<span>icon</span>}
      label="Forge"
      nodeId="forge"
      state="working"
    />,
  );
  expect(screen.getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Forge, Working");
});
```

Every remaining test in the file passes `statusLabel="..."` — remove that prop from each of the following render calls (the props stay otherwise identical): `"passes the icon slot..."`, `"always renders the halo"`, both `it.each` blocks (`PING_STATES`/`NON_PING_STATES`), `"fires onClick when activated"`, `"fires onClick on Enter and Space..."`, and `"exposes button role and an accessible name matching the label"` (this last one's assertion — `toHaveAccessibleName("Relay")` — still holds under the new default-to-`label` behavior, no change needed beyond dropping the prop).

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `pnpm exec vitest run libs/design-system/src/immersive/OrbNode/OrbNode.test.tsx`
Expected: FAIL — `statusLabel` is still a required prop, `ariaLabel` doesn't exist yet.

- [ ] **Step 3: Update `OrbNode.tsx`**

Replace the testid enum:

```ts
export enum OrbNodeTestId {
  Root = "orb-node-root",
  Orb = "orb-node-orb",
  Icon = "orb-node-icon",
  Label = "orb-node-label",
  Status = "orb-node-status",
  Halo = "orb-node-halo",
  Ping = "orb-node-ping",
  Shadow = "orb-node-shadow",
}
```

with:

```ts
export enum OrbNodeTestId {
  Root = "orb-node-root",
  Orb = "orb-node-orb",
  Icon = "orb-node-icon",
  Label = "orb-node-label",
  Halo = "orb-node-halo",
  Ping = "orb-node-ping",
  Shadow = "orb-node-shadow",
}
```

Replace the props interface:

```ts
export interface OrbNodeProps {
  /** Target orb diameter in px — every chrome layer (shadow, halo, ping, orbit) derives from it. */
  diameter: number;
  /** Identity color of the orb body. */
  hex: string;
  /** Conversational/subsystem state — selects motion, chrome color, and ping visibility. */
  state: OrbState;
  /** Subsystem name shown under the orb. */
  label: string;
  /** Short state label shown under the name (e.g. "working", "awaiting review"). */
  statusLabel: string;
  /** Icon overlay rendered centered on the orb body. */
  icon: ReactNode;
  /** Number of active tasks — drives the {@link OrbitField} dot count. */
  activeCount: number;
  /** Stable identity used to seed the float animation and the orbit layout. */
  nodeId: string;
  onClick?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}
```

with:

```ts
export interface OrbNodeProps {
  /** Target orb diameter in px — every chrome layer (shadow, halo, ping, orbit) derives from it. */
  diameter: number;
  /** Identity color of the orb body. */
  hex: string;
  /** Conversational/subsystem state — selects motion, chrome color, and ping visibility. */
  state: OrbState;
  /** Subsystem name shown under the orb. */
  label: string;
  /** Accessible name for the root button — defaults to `label` when omitted.
   * Lets a caller announce more than what's visually shown (e.g. name + state)
   * without painting that extra text on the map itself. */
  ariaLabel?: string;
  /** Icon overlay rendered centered on the orb body. */
  icon: ReactNode;
  /** Number of active tasks — drives the {@link OrbitField} dot count. */
  activeCount: number;
  /** Stable identity used to seed the float animation and the orbit layout. */
  nodeId: string;
  onClick?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}
```

Update the function signature:

```ts
export function OrbNode({
  diameter,
  hex,
  state,
  label,
  statusLabel,
  icon,
  activeCount,
  nodeId,
  onClick,
  ref,
}: OrbNodeProps) {
```

with:

```ts
export function OrbNode({
  diameter,
  hex,
  state,
  label,
  ariaLabel,
  icon,
  activeCount,
  nodeId,
  onClick,
  ref,
}: OrbNodeProps) {
```

Update the root's `aria-label`:

```tsx
    <div
      aria-label={label}
      data-testid={OrbNodeTestId.Root}
```

with:

```tsx
    <div
      aria-label={ariaLabel ?? label}
      data-testid={OrbNodeTestId.Root}
```

Delete the entire `Status` block (the second `<span>` inside the "Name + status label" `<div>`, i.e. everything from `<span data-testid={OrbNodeTestId.Status}>` through its closing `</span>`) so the name+status wrapper becomes:

```tsx
      {/* Name label. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
          textShadow: "0 2px 8px rgba(0,0,0,0.6)",
        }}
      >
        <span
          data-testid={OrbNodeTestId.Label}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: Math.max(12, Math.min(15, diameter * 0.19)),
            fontWeight: 600,
            color: "var(--color-foreground)",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
```

(replacing the old comment `{/* Name + status label. */}` and everything through the file's closing `</div></div>);}`).

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `pnpm exec vitest run libs/design-system/src/immersive/OrbNode/OrbNode.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the Storybook file**

In `libs/design-system/src/immersive/OrbNode/OrbNode.stories.tsx`, remove every `statusLabel` field/prop:

- `StateSample` interface: drop `statusLabel: string;`.
- Every entry in `SAMPLES`: drop its `statusLabel: "..."` line.
- `meta.args`: drop `statusLabel: "idle",`.
- `Overview`'s render: drop `statusLabel={sample.statusLabel}`.
- `PlaygroundArgs` interface: drop `statusLabel: string;`.
- `Playground.argTypes`: drop `statusLabel: { control: "text" },`.
- `Playground.args`: drop `statusLabel: "working",`.
- `Playground.render`'s destructured params: drop `statusLabel` from `({ state, diameter, hex, activeCount, label, statusLabel, iconName }) =>`.
- `Playground.render`'s JSX: drop `statusLabel={statusLabel}`.

- [ ] **Step 6: Typecheck the design-system package**

Run: `pnpm exec tsc -p libs/design-system --noEmit`
Expected: no errors from `OrbNode.tsx`/`.test.tsx`/`.stories.tsx` (errors from `OrbMap.tsx`/`.test.tsx`/`.stories.tsx`, which still pass `statusLabel`, are expected here and fixed in Task 5 — don't chase those in this task).

- [ ] **Step 7: Commit**

```bash
git add libs/design-system/src/immersive/OrbNode/OrbNode.tsx libs/design-system/src/immersive/OrbNode/OrbNode.test.tsx libs/design-system/src/immersive/OrbNode/OrbNode.stories.tsx
git commit -m "feat(ds): drop OrbNode status text, add ariaLabel override"
```

---

### Task 5: DS — `OrbMap` forwards `ariaLabel`, drops `statusLabel`

**Files:**

- Modify: `libs/design-system/src/immersive/OrbMap/OrbMap.tsx`
- Modify: `libs/design-system/src/immersive/OrbMap/OrbMap.test.tsx`
- Modify: `libs/design-system/src/immersive/OrbMap/OrbMap.stories.tsx`

**Interfaces:**

- Consumes: `OrbNode`'s new `ariaLabel` prop (Task 4).
- Produces: `OrbMapNode` drops `statusLabel: string`, gains optional `ariaLabel?: string`, forwarded straight to the rendered `OrbNode`.

- [ ] **Step 1: Update `OrbMap.test.tsx` fixture first**

In `libs/design-system/src/immersive/OrbMap/OrbMap.test.tsx`, in `buildNodes()`, replace:

```ts
  return NODE_IDS.map((id, i) => ({
    id,
    hex: "#5b8def",
    state: states[i] ?? "idle",
    label: id,
    statusLabel: states[i] ?? "idle",
    icon: <span>{id}</span>,
    activeCount: i,
  }));
```

with:

```ts
  return NODE_IDS.map((id, i) => ({
    id,
    hex: "#5b8def",
    state: states[i] ?? "idle",
    label: id,
    icon: <span>{id}</span>,
    activeCount: i,
  }));
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `pnpm exec vitest run libs/design-system/src/immersive/OrbMap/OrbMap.test.tsx`
Expected: FAIL — `OrbMapNode` still requires `statusLabel`.

- [ ] **Step 3: Update `OrbMap.tsx`**

Replace the `OrbMapNode` interface:

```ts
export interface OrbMapNode {
  /** Stable key (e.g. the subsystem id in the app). */
  id: string;
  /** Identity color of the orb body. */
  hex: string;
  /** Conversational/subsystem state — drives motion, chrome color, and connector liveness. */
  state: OrbState;
  /** Name shown under the orb. */
  label: string;
  /** Localized status text shown under the name (e.g. "working"). */
  statusLabel: string;
  /** A DS `<Icon/>` instance rendered centered on the orb body. */
  icon: ReactNode;
  /** Number of active tasks — drives the orbit-field dot count. */
  activeCount: number;
}
```

with:

```ts
export interface OrbMapNode {
  /** Stable key (e.g. the subsystem id in the app). */
  id: string;
  /** Identity color of the orb body. */
  hex: string;
  /** Conversational/subsystem state — drives motion, chrome color, and connector liveness. */
  state: OrbState;
  /** Name shown under the orb. */
  label: string;
  /** Accessible name for the node — forwarded straight to `OrbNode`'s `ariaLabel`
   * (defaults to `label` there when omitted). */
  ariaLabel?: string;
  /** A DS `<Icon/>` instance rendered centered on the orb body. */
  icon: ReactNode;
  /** Number of active tasks — drives the orbit-field dot count. */
  activeCount: number;
}
```

Replace the rendered `OrbNode` call:

```tsx
<OrbNode
  activeCount={n.activeCount}
  diameter={layout.nodeD}
  hex={n.hex}
  icon={n.icon}
  label={n.label}
  nodeId={n.id}
  onClick={() => onSelectNode?.(n.id)}
  state={n.state}
  statusLabel={n.statusLabel}
/>
```

with:

```tsx
<OrbNode
  activeCount={n.activeCount}
  ariaLabel={n.ariaLabel}
  diameter={layout.nodeD}
  hex={n.hex}
  icon={n.icon}
  label={n.label}
  nodeId={n.id}
  onClick={() => onSelectNode?.(n.id)}
  state={n.state}
/>
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `pnpm exec vitest run libs/design-system/src/immersive/OrbMap/OrbMap.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `OrbMap.stories.tsx`**

Remove `statusLabel: s.state,` from `buildNodes()`'s mapped object, and remove `statusLabel: nextState(n.state),` from `cycleNode`'s update object (in `PlaygroundStage`).

- [ ] **Step 6: Typecheck the design-system package**

Run: `pnpm exec tsc -p libs/design-system --noEmit`
Expected: no errors anywhere in `libs/design-system`.

- [ ] **Step 7: Commit**

```bash
git add libs/design-system/src/immersive/OrbMap/OrbMap.tsx libs/design-system/src/immersive/OrbMap/OrbMap.test.tsx libs/design-system/src/immersive/OrbMap/OrbMap.stories.tsx
git commit -m "feat(ds): OrbMap forwards ariaLabel instead of statusLabel"
```

---

### Task 6: App — `subsystemVisuals.ts` maps `error` → `incident`

**Files:**

- Modify: `apps/web/features/subsystems/subsystemVisuals.ts`
- Modify: `apps/web/features/subsystems/subsystemVisuals.test.ts`

**Interfaces:**

- Consumes: `SubsystemState` including `"error"` (Task 1).
- Produces: `SUBSYSTEM_ORB_STATE.error === "incident"`.

- [ ] **Step 1: Update the failing test first**

In `apps/web/features/subsystems/subsystemVisuals.test.ts`, replace:

```ts
it("keeps idle the only state whose chrome doesn't animate", () => {
  // The pill's dot glow and the map orb's halo pulse both read `live` off
  // this same table — if a state silently flips, the header and the map flip
  // together, which is the point of routing both through here.
  const live = SubsystemStateSchema.options.filter(
    (state) => ORB_STATE[SUBSYSTEM_ORB_STATE[state]].live,
  );
  expect(live).toEqual(["running", "report", "waiting"]);
});
```

with:

```ts
it("keeps idle the only state whose chrome doesn't animate", () => {
  // The pill's dot glow and the map orb's halo pulse both read `live` off
  // this same table — if a state silently flips, the header and the map flip
  // together, which is the point of routing both through here.
  const live = SubsystemStateSchema.options.filter(
    (state) => ORB_STATE[SUBSYSTEM_ORB_STATE[state]].live,
  );
  expect(live).toEqual(["running", "report", "waiting", "error"]);
});
```

(The existing `"maps every contract state onto a real DS orb state"` test needs no edit — it already iterates `SubsystemStateSchema.options` generically and will automatically cover `"error"` once Step 2 below adds the mapping; until then it correctly fails.)

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `pnpm exec vitest run apps/web/features/subsystems/subsystemVisuals.test.ts`
Expected: FAIL — `SUBSYSTEM_ORB_STATE.error` is `undefined`, `ORB_STATE[undefined]` is `undefined`.

- [ ] **Step 3: Add the mapping**

In `apps/web/features/subsystems/subsystemVisuals.ts`, replace:

```ts
export const SUBSYSTEM_ORB_STATE: Record<SubsystemState, OrbState> = {
  idle: "idle",
  running: "working",
  report: "report",
  waiting: "await",
};
```

with:

```ts
export const SUBSYSTEM_ORB_STATE: Record<SubsystemState, OrbState> = {
  idle: "idle",
  running: "working",
  report: "report",
  waiting: "await",
  error: "incident",
};
```

Also update the doc comment directly above it (currently reads "The contract's four states don't cover the DS `incident`/`thinking` orb states — those belong to the core orb and to a subsystem state ZIBBY doesn't model yet, so nothing maps onto them here.") to:

```ts
/** English `SubsystemState` (contracts) → immersive `OrbState` (DS).
 *
 * `error` maps to the DS `incident` state — a failed owned run, distinct from
 * a successful `report`. `thinking` has no subsystem equivalent; it belongs
 * to the core orb only. */
```

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `pnpm exec vitest run apps/web/features/subsystems/subsystemVisuals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/subsystems/subsystemVisuals.ts apps/web/features/subsystems/subsystemVisuals.test.ts
git commit -m "feat(web): map subsystem error state to the incident orb chrome"
```

---

### Task 7: App — `SubsystemOrbMap` drops status text, wires `ariaLabel`

**Files:**

- Modify: `apps/web/features/chat/components/SubsystemOrbMap.tsx`
- Modify: `apps/web/features/chat/components/SubsystemOrbMap.test.tsx`

**Interfaces:**

- Consumes: `OrbMapNode.ariaLabel` (Task 5), `SUBSYSTEM_ORB_STATE.error` (Task 6), the `subsystems.nodeAria`/`subsystems.state.*` i18n keys (already present for `nodeAria`; `state.error` added in Task 8 — see note in Step 3 below on why this task's `error`-state test doesn't need `state.error` to exist yet).

- [ ] **Step 1: Update the test fixture and remove the 3 status-text tests first**

In `apps/web/features/chat/components/SubsystemOrbMap.test.tsx`, add `errorCount: 0` to the `subsystem()` fixture:

```ts
function subsystem(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  const base = SUBSYSTEMS[0]!;
  return {
    id: base.id,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
    ...overrides,
  };
}
```

Delete these three tests entirely (they assert on the now-removed `OrbNodeTestId.Status`):

- `"maps a running subsystem to the localized working status label"`
- `"maps report/waiting subsystems to their localized status labels"`
- `"falls back to idle for a subsystem missing from the roster"` — **do not delete this one**, only strip its final assertion. Replace:

```ts
  it("falls back to idle for a subsystem missing from the roster", () => {
    // Drop `loom` from the roster entirely — the node still renders (fixed
    // registry order) and falls back to `idle`/0 rather than throwing.
    const subsystems = allSubsystems().filter((s) => s.id !== "loom");
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={subsystems}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-loom`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Status)).toHaveTextContent("V klidu");
  });
```

with:

```ts
  it("falls back to idle for a subsystem missing from the roster", () => {
    // Drop `loom` from the roster entirely — the node still renders (fixed
    // registry order) and falls back to `idle`/0 rather than throwing.
    const subsystems = allSubsystems().filter((s) => s.id !== "loom");
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={subsystems}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-loom`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Loom, V klidu");
  });
```

(`OrbNodeTestId` is still imported/used elsewhere in the file — e.g. `OrbNodeTestId.Root` in the click test and `OrbitFieldTestId` tests — so the import stays.)

Now add two new tests after the deleted pair, exercising the new `error` state end to end (halo color via `ORB_STATE_COLOR.incident` and the `ariaLabel` wiring):

```ts
  it("wires each node's accessible name to name + localized state via subsystems.nodeAria", () => {
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems({ forge: { state: "running" } })}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-forge`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Forge, Běží");
  });

  it("an owned failed run reads as the error state (red incident halo)", () => {
    renderWithProviders(
      <SubsystemOrbMap
        onOpenCore={vi.fn()}
        onSelectSubsystem={vi.fn()}
        pipelines={[]}
        runs={[]}
        subsystems={allSubsystems({ sentinel: { state: "error", errorCount: 1 } })}
        thinking={false}
      />,
    );

    const wrapper = screen.getByTestId(`${OrbMapTestId.Node}-sentinel`);
    expect(within(wrapper).getByTestId(OrbNodeTestId.Root)).toHaveAccessibleName("Sentinel, Chyba");
    expect(within(wrapper).getByTestId(OrbNodeTestId.Halo)).toHaveStyle({
      border: "1.5px solid #ff6b6b",
    });
  });
```

- [ ] **Step 2: Run the test file to confirm it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/SubsystemOrbMap.test.tsx`
Expected: FAIL — `SubsystemOrbMap` doesn't build `ariaLabel` yet, node still passes `statusLabel` (a prop `OrbMapNode` no longer declares — TS/test failure), and `error` isn't in the roster fixture builder's default type until Task 1/6 land (they already have by this point in the plan).

- [ ] **Step 3: Update `SubsystemOrbMap.tsx`**

Replace the node-building block:

```ts
  const nodes: OrbMapNode[] = SUBSYSTEMS.map((sub) => {
    const state = statusById.get(sub.id)?.state ?? "idle";
    return {
      id: sub.id,
      hex: sub.color,
      state: SUBSYSTEM_ORB_STATE[state],
      label: sub.name,
      statusLabel: t(`state.${state}`),
      icon: <Icon name={SUBSYSTEM_GLYPH[sub.id]} size="lg" />,
      activeCount: counts[sub.id] ?? 0,
    };
  });
```

with:

```ts
  const nodes: OrbMapNode[] = SUBSYSTEMS.map((sub) => {
    const state = statusById.get(sub.id)?.state ?? "idle";
    return {
      id: sub.id,
      hex: sub.color,
      state: SUBSYSTEM_ORB_STATE[state],
      label: sub.name,
      ariaLabel: t("nodeAria", { name: sub.name, state: t(`state.${state}`) }),
      icon: <Icon name={SUBSYSTEM_GLYPH[sub.id]} size="lg" />,
      activeCount: counts[sub.id] ?? 0,
    };
  });
```

This is the only functional change needed in this file — `t` (`useTranslations("subsystems")`) is already imported and in scope; `nodeAria` already exists in both `cs.json`/`en.json` (`"{name}, {state}"`) but was previously unused by any component.

- [ ] **Step 4: Run the test file to confirm it passes**

Run: `pnpm exec vitest run apps/web/features/chat/components/SubsystemOrbMap.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/chat/components/SubsystemOrbMap.tsx apps/web/features/chat/components/SubsystemOrbMap.test.tsx
git commit -m "feat(web): SubsystemOrbMap announces state via aria-label, not visible text"
```

---

### Task 8: App — `SubsystemDrawer` gains the error state pill + badge

**Files:**

- Modify: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`
- Modify: `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx`
- Modify: `apps/web/i18n/messages/cs.json`
- Modify: `apps/web/i18n/messages/en.json`

**Interfaces:**

- Consumes: `SubsystemWithStatus.errorCount`/`state: "error"` (Task 1/2), `subsystems.state.error`/`subsystems.errorBadge` i18n keys (added in this task).

- [ ] **Step 1: Add the i18n keys first**

In `apps/web/i18n/messages/cs.json`, inside the `subsystems` object (around line 1806), replace:

```json
    "state": {
      "idle": "V klidu",
      "running": "Běží",
      "report": "Hlášení připraveno",
      "waiting": "Čeká na rozhodnutí"
    },
    "nodeAria": "{name}, {state}",
    "tier2Badge": "{count} hlášení k nahlédnutí",
    "tier3Badge": "{count} čeká na rozhodnutí",
```

with:

```json
    "state": {
      "idle": "V klidu",
      "running": "Běží",
      "report": "Hlášení připraveno",
      "waiting": "Čeká na rozhodnutí",
      "error": "Chyba"
    },
    "nodeAria": "{name}, {state}",
    "tier2Badge": "{count} hlášení k nahlédnutí",
    "tier3Badge": "{count} čeká na rozhodnutí",
    "errorBadge": "{count} chyb",
```

In `apps/web/i18n/messages/en.json`, at the equivalent block, replace:

```json
    "state": {
      "idle": "Idle",
      "running": "Running",
      "report": "Report ready",
      "waiting": "Awaiting decision"
    },
    "nodeAria": "{name}, {state}",
    "tier2Badge": "{count} reports to review",
    "tier3Badge": "{count} awaiting decision",
```

with:

```json
    "state": {
      "idle": "Idle",
      "running": "Running",
      "report": "Report ready",
      "waiting": "Awaiting decision",
      "error": "Error"
    },
    "nodeAria": "{name}, {state}",
    "tier2Badge": "{count} reports to review",
    "tier3Badge": "{count} awaiting decision",
    "errorBadge": "{count} errors",
```

- [ ] **Step 2: Update the test fixture and add new tests first**

In `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx`, add `errorCount: 0` to the `fixture()` default:

```ts
function fixture(overrides: Partial<SubsystemWithStatus> = {}): SubsystemWithStatus {
  const base = SUBSYSTEMS[0]!;
  return {
    id: base.id,
    name: base.name,
    tagline: base.tagline,
    mandate: base.mandate,
    color: base.color,
    state: "idle",
    tier2Count: 0,
    tier3Count: 0,
    errorCount: 0,
    ...overrides,
  };
}
```

Add an `error` row to the header-status `it.each` table:

```ts
  it.each([
    ["idle", {}, "V klidu"],
    ["running", {}, "Běží"],
    ["report", { tier2Count: 3 }, "Hlášení připraveno"],
    ["waiting", { tier3Count: 2 }, "Čeká na rozhodnutí"],
    ["error", { errorCount: 1 }, "Chyba"],
  ] as const)("renders the header status for state %s", (state, extra, label) => {
```

Add a dedicated test for the error badge right after the existing report/waiting badge test:

```ts
  it("shows the error count badge for the error state", () => {
    renderWithProviders(
      <SubsystemDrawer onClose={vi.fn()} subsystem={fixture({ state: "error", errorCount: 2 })} />,
    );
    const count = screen.getByTestId(SubsystemDrawerTestId.Count);
    expect(count).toHaveTextContent("2");
    expect(count).toHaveAccessibleName("2 chyb");
  });
```

- [ ] **Step 3: Run the test file to confirm it fails**

Run: `pnpm exec vitest run apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx`
Expected: FAIL — `STATE_TAG_TONE`/count logic don't have an `error` arm yet.

- [ ] **Step 4: Update `SubsystemDrawer.tsx`**

Replace:

```ts
const STATE_TAG_TONE: Partial<Record<SubsystemState, TagTone>> = {
  report: "ok",
  waiting: "warn",
};
```

with:

```ts
const STATE_TAG_TONE: Partial<Record<SubsystemState, TagTone>> = {
  report: "ok",
  waiting: "warn",
  error: "bad",
};
```

Replace the `countValue`/`countLabel` computation:

```ts
const countValue =
  subsystem.state === "report"
    ? subsystem.tier2Count
    : subsystem.state === "waiting"
      ? subsystem.tier3Count
      : null;
const countLabel =
  subsystem.state === "report"
    ? t("tier2Badge", { count: subsystem.tier2Count })
    : subsystem.state === "waiting"
      ? t("tier3Badge", { count: subsystem.tier3Count })
      : null;
```

with:

```ts
const countValue =
  subsystem.state === "report"
    ? subsystem.tier2Count
    : subsystem.state === "waiting"
      ? subsystem.tier3Count
      : subsystem.state === "error"
        ? subsystem.errorCount
        : null;
const countLabel =
  subsystem.state === "report"
    ? t("tier2Badge", { count: subsystem.tier2Count })
    : subsystem.state === "waiting"
      ? t("tier3Badge", { count: subsystem.tier3Count })
      : subsystem.state === "error"
        ? t("errorBadge", { count: subsystem.errorCount })
        : null;
```

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `pnpm exec vitest run apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
git commit -m "feat(web): subsystem drawer shows a red error pill + count badge"
```

---

### Task 9: App — `BriefingRows` shows failed counts separately

**Files:**

- Modify: `apps/web/features/briefing/components/BriefingRows.tsx`
- Modify: `apps/web/features/chat/components/BriefingMessageCard.test.tsx`
- Modify: `apps/web/i18n/messages/cs.json`
- Modify: `apps/web/i18n/messages/en.json`

**Interfaces:**

- Consumes: `BriefingSubsystemLine.errorCount` (Task 1/3), `overview.briefingSubsystemError` i18n key (added in this task).

- [ ] **Step 1: Add the i18n key first**

In `apps/web/i18n/messages/cs.json`, in the `overview` object (around line 353), replace:

```json
    "briefingSubsystemTier3": "{count} čeká na tebe",
    "briefingSubsystemTier2": "{count} k reportu",
```

with:

```json
    "briefingSubsystemTier3": "{count} čeká na tebe",
    "briefingSubsystemError": "{count} selhalo",
    "briefingSubsystemTier2": "{count} k reportu",
```

In `apps/web/i18n/messages/en.json`, replace:

```json
    "briefingSubsystemTier3": "{count} waiting on you",
    "briefingSubsystemTier2": "{count} to report",
```

with:

```json
    "briefingSubsystemTier3": "{count} waiting on you",
    "briefingSubsystemError": "{count} failed",
    "briefingSubsystemTier2": "{count} to report",
```

- [ ] **Step 2: Update `BriefingMessageCard.test.tsx`'s fixture and add a new test first**

In `apps/web/features/chat/components/BriefingMessageCard.test.tsx`, the existing per-subsystem-line test object needs `errorCount` now that the contract requires it:

```ts
          subsystems: [
            { subsystem: "forge", name: "Forge", state: "waiting", tier2Count: 0, tier3Count: 2 },
          ],
```

becomes:

```ts
          subsystems: [
            {
              subsystem: "forge",
              name: "Forge",
              state: "waiting",
              tier2Count: 0,
              tier3Count: 2,
              errorCount: 0,
            },
          ],
```

Add a new test right after `"renders per-subsystem lines when the briefing carries them (NS2 F3b)"` asserting the failed-count copy renders and is distinct from the reported copy:

```ts
  it("renders a distinct failed-count line for a subsystem's errorCount", () => {
    render(
      <BriefingMessageCard
        briefing={{
          ...calm,
          subsystems: [
            {
              subsystem: "sentinel",
              name: "Sentinel",
              state: "error",
              tier2Count: 0,
              tier3Count: 0,
              errorCount: 1,
            },
          ],
        }}
      />,
    );
    const rows = screen.getAllByTestId(BriefingCardTestId.SubsystemLine);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("1 selhalo");
  });
```

- [ ] **Step 3: Run the test file to confirm it fails**

Run: `pnpm exec vitest run apps/web/features/chat/components/BriefingMessageCard.test.tsx`
Expected: FAIL — TS error on the fixture missing `errorCount` (or, once that's patched locally to unblock the run, the new test fails because `SubsystemLineRow` doesn't render `errorCount` yet).

- [ ] **Step 4: Update `BriefingRows.tsx`**

Replace:

```ts
export const STATE_DOT_TONE: Record<SubsystemState, DotTone> = {
  idle: "idle",
  running: "run",
  report: "ok",
  waiting: "wait",
};
```

with:

```ts
export const STATE_DOT_TONE: Record<SubsystemState, DotTone> = {
  idle: "idle",
  running: "run",
  report: "ok",
  waiting: "wait",
  error: "bad",
};
```

Replace the `parts` construction in `SubsystemLineRow`:

```ts
const parts: string[] = [];
if (line.tier3Count > 0)
  parts.push(t("overview.briefingSubsystemTier3", { count: line.tier3Count }));
if (line.tier2Count > 0)
  parts.push(t("overview.briefingSubsystemTier2", { count: line.tier2Count }));
if (line.note) parts.push(line.note);
```

with:

```ts
const parts: string[] = [];
if (line.tier3Count > 0)
  parts.push(t("overview.briefingSubsystemTier3", { count: line.tier3Count }));
if (line.errorCount > 0)
  parts.push(t("overview.briefingSubsystemError", { count: line.errorCount }));
if (line.tier2Count > 0)
  parts.push(t("overview.briefingSubsystemTier2", { count: line.tier2Count }));
if (line.note) parts.push(line.note);
```

Also update the `StatusDot`'s `pulse` prop so the error state pulses too (mirroring `waiting`'s existing treatment — both are states the operator should notice):

```tsx
<StatusDot pulse={line.state === "waiting"} size="75" tone={STATE_DOT_TONE[line.state]} />
```

with:

```tsx
<StatusDot
  pulse={line.state === "waiting" || line.state === "error"}
  size="75"
  tone={STATE_DOT_TONE[line.state]}
/>
```

- [ ] **Step 5: Run the test file to confirm it passes**

Run: `pnpm exec vitest run apps/web/features/chat/components/BriefingMessageCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/briefing/components/BriefingRows.tsx apps/web/features/chat/components/BriefingMessageCard.test.tsx apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
git commit -m "feat(web): briefing rows show a subsystem's failed count separately"
```

---

### Task 10: Full-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck everything**

Run: `pnpm exec tsc -p libs/contracts --noEmit && pnpm exec tsc -p libs/design-system --noEmit && pnpm exec tsc -p apps/api --noEmit && pnpm exec tsc -p apps/web --noEmit`
Expected: no errors. This is the first point in the plan where every package is typechecked together — it catches any remaining consumer of `statusLabel`/old `tier2Count`-only semantics missed by the per-task steps above.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all green (pre-existing known-flaky suites excepted — see `project_api_flaky_pipeline_e2e` / `project_playwright_e2e_preexisting_failures` in prior context if any unrelated failure looks pre-existing rather than caused by this change).

- [ ] **Step 3: Lint everything touched**

Run: `pnpm exec eslint --fix libs/contracts/src/subsystems/subsystem.schema.ts libs/contracts/src/briefing/briefing.schema.ts apps/api/src/subsystems/subsystems.service.ts apps/api/src/subsystems/subsystems.service.test.ts apps/api/src/briefing/briefing.service.ts apps/api/src/briefing/briefing-assembly.ts libs/design-system/src/immersive/OrbNode/OrbNode.tsx libs/design-system/src/immersive/OrbNode/OrbNode.test.tsx libs/design-system/src/immersive/OrbNode/OrbNode.stories.tsx libs/design-system/src/immersive/OrbMap/OrbMap.tsx libs/design-system/src/immersive/OrbMap/OrbMap.test.tsx libs/design-system/src/immersive/OrbMap/OrbMap.stories.tsx apps/web/features/subsystems/subsystemVisuals.ts apps/web/features/subsystems/subsystemVisuals.test.ts apps/web/features/chat/components/SubsystemOrbMap.tsx apps/web/features/chat/components/SubsystemOrbMap.test.tsx apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.test.tsx apps/web/features/briefing/components/BriefingRows.tsx apps/web/features/chat/components/BriefingMessageCard.test.tsx`
Expected: no remaining issues.

- [ ] **Step 4: Manual smoke check (per CLAUDE.md — verify UI changes in the real app, not just tests)**

Run `pnpm web:dev` and `pnpm api:dev`, open `/chat`. Confirm:

- No subsystem orb shows text under its name anymore — only the name.
- Halo color still visibly differs by state (grey idle / blue-ish working / green report / yellow await).
- If any subsystem currently has a failed owned run (or one can be produced via a test pipeline), its orb shows a **red** halo + attention ping, its drawer header shows a red "Chyba" pill with an error count badge, and the briefing card (if visible) shows an "N selhalo" line distinct from any "N k reportu" line.

No code changes in this step — this is a verification gate, not a task.

## Self-Review Notes

- **Spec coverage:** every numbered section of `docs/superpowers/specs/2026-07-22-orb-status-declutter-design.md` maps onto a task above — §1 → Task 4/5/7, §2 → Task 1, §3 → Task 2, §4 → Task 6, §5 → Task 8/9, §6 → Tasks 8/9 (i18n folded into their consuming task rather than split out, since an i18n key has no independent test cycle).
- **Correction to the spec:** the spec claimed removing the visible status text was accessibility-neutral because `aria-label`/`nodeAria` "keeps announcing state." On inspection, `nodeAria` was a dead, never-referenced i18n key, and `OrbNode`'s `aria-label` only ever carried the bare `label` (name), never state. Task 4 adds a real `ariaLabel` override to `OrbNode`/`OrbMap`, and Task 7 finally wires the existing `nodeAria` catalog string (`"{name}, {state}"`) through — so removing the visible text doesn't regress accessibility, it fixes a latent gap instead.
- **Type consistency:** `errorCount` is spelled identically everywhere it appears (`SubsystemWithStatus`, `BriefingSubsystemLine`, `Aggregate`, test fixtures) — no `errCount`/`failCount` drift. `ariaLabel` (not `accessibleName`/`ariaText`) is used consistently in `OrbNode`/`OrbMap`/`SubsystemOrbMap`.
- **Scope check:** single cohesive change (declutter + one new state), 9 implementation tasks + 1 verification task — no further decomposition needed.
