# Orb status declutter + subsystem error state

**Date:** 2026-07-22
**Status:** Approved, ready for planning

## Problem

Every subsystem orb on the `/chat` map (`SubsystemOrbMap` → `OrbNode`) shows a
text status row under its name — e.g. "V klidu" for `idle`. This duplicates
information the orb already carries visually: the halo ring is colored and
animated per state (`ORB_STATE_COLOR` / `ORB_STATE.live`), and `OrbitField`
already renders one orbiting dot per active task. On a map of 11 subsystems,
mostly-idle at any given moment, the repeated "V klidu" text is visual noise
that adds nothing the halo doesn't already say.

Separately, while auditing the state pipeline for this: `SubsystemsService`
today folds a subsystem's **successful** and **failed** terminal runs into the
same `report` bucket (`tier2Count`), both rendered in the same "ok/green"
tone. A subsystem whose owned pipeline just failed reads identically to one
that just finished cleanly. There is no real "chyba" (error) signal for a
subsystem today, even though the DS orb vocabulary already has an unused
`incident` (red) state reserved for exactly this.

## Goals

1. Remove the redundant status text from the ambient orb map — state is
   carried by color/motion/orbit-count only.
2. Give subsystems a real `error` state, distinct from `report`, so a failed
   run is visually and textually distinguishable from a successful one — on
   the map (red incident halo + ping), in the subsystem drawer, and in the
   briefing.
3. Keep detail surfaces (drawer header pill, briefing rows) textual — only the
   ambient map loses its text. Removing text is a map-only change.

## Non-goals

- No settings/toggle to bring the text back — this is a permanent removal,
  not a preference (confirmed with operator).
- No change to `OrbitField` / active-task-count visualization — it already
  does what was wanted.
- No change to how `waiting` (Tier-3 approvals) is computed or displayed —
  only the `report`/`error` split is new.
- No retry/auto-heal behavior change — this is a status _signal_ change only,
  not new autonomy behavior.

## Design

### 1. `OrbNode` — drop the status text row

`libs/design-system/src/immersive/OrbNode/OrbNode.tsx`:

- Delete the `Status` block (the `<span data-testid={OrbNodeTestId.Status}>`
  wrapper containing the state dot + `statusLabel` text, currently lines
  229–253) and the now-unused `OrbNodeTestId.Status` enum member.
- Remove the `statusLabel` prop from `OrbNodeProps` and its JSDoc.
- The name label (`OrbNodeTestId.Label`) stays — only the state's _text_ goes;
  the halo, ping, orbit field, and contact shadow are untouched.

`SubsystemOrbMap.tsx` stops passing `statusLabel: t(\`state.${state}\`)`into
the node shape (the`t(...)`call and its import stay — still used for`aria-label`/`nodeAria` on the root map, which keeps announcing state to
screen readers even though it's no longer painted).

Other `OrbNode` consumers (Storybook, tests) that pass `statusLabel` drop the
prop; their snapshots/assertions on `OrbNodeTestId.Status` are deleted.

### 2. Contract — `error` state + split counts

`libs/contracts/src/subsystems/subsystem.schema.ts`:

```ts
export const SubsystemStateSchema = z.enum(["idle", "running", "report", "waiting", "error"]);

export const SubsystemWithStatusSchema = SubsystemSchema.extend({
  state: SubsystemStateSchema,
  tier2Count: z.number().int().nonnegative(), // successful (done) terminal runs since last seen
  tier3Count: z.number().int().nonnegative(), // pending Tier-3 approvals
  errorCount: z.number().int().nonnegative(), // failed (error) terminal runs since last seen
});
```

`tier2Count`'s meaning narrows (done-only, no longer done+error combined) —
every reader of `tier2Count` is audited in section 5 so none silently
under-counts.

### 3. Backend — `SubsystemsService` aggregation + precedence

`apps/api/src/subsystems/subsystems.service.ts`, in `aggregateAll()`: the
terminal-run loop currently does:

```ts
if (run.status === "done" || run.status === "error") {
  // ...counts into tier2Count regardless of which
}
```

splits into two maps, `tier2Count` (done only) and a new `errorCount` (error
only), using the same "since `lastSeenAt`" completion-signal logic already in
place for both.

Both precedence tables gain the `error` candidate:

```ts
// Single subsystem's headline state — error outranks ambient "still working"
// but not an explicit pending decision.
const STATE_PRECEDENCE: Record<SubsystemState, number> = {
  waiting: 0,
  error: 1,
  running: 2,
  report: 3,
  idle: 4,
};

// Cross-subsystem list/briefing ordering — a fresh failure is worth seeing
// before an ambient "still running", same relative shift as above.
const LIST_ORDER_RANK: Record<SubsystemState, number> = {
  waiting: 0,
  error: 1,
  report: 2,
  running: 3,
  idle: 4,
};
```

`withAggregate` / the `candidates` array in `aggregateAll()` adds
`...(errorCount.get(s.id) ?? 0) > 0 ? (["error"] as const) : []`, mirroring
the existing `report`/`waiting` candidate construction.

`list()`'s tie-break sort (`b.tier2Count - a.tier2Count` for `report` ties)
gets a matching `if (a.state === "error") return b.errorCount - a.errorCount;`
arm.

### 4. DS visual mapping

`apps/web/features/subsystems/subsystemVisuals.ts`:

```ts
export const SUBSYSTEM_ORB_STATE: Record<SubsystemState, OrbState> = {
  idle: "idle",
  running: "working",
  report: "report",
  waiting: "await",
  error: "incident",
};
```

No DS changes needed — `ORB_STATE_COLOR.incident` (`#ff6b6b`),
`ORB_MOTION.incident`, and `OrbNode`'s `showPing` (already includes
`state === "incident"`) all already exist and were simply never reachable
from a subsystem before. Wiring this one line makes the map's red
halo + attention ping appear for a genuinely failed subsystem.

### 5. Drawer + briefing (detail surfaces keep their text)

These are per-subsystem detail views, not the ambient map — they keep their
state text; they just need to know about the new state.

- `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx`:
  - `STATE_TAG_TONE` gains `error: "bad"`.
  - The header pill's count selection (currently `state === "report" ?
tier2Count : state === "waiting" ? tier3Count : undefined`) gains an
    `error` arm reading `errorCount`.
- `apps/web/features/briefing/components/BriefingRows.tsx`:
  - `STATE_DOT_TONE` gains `error: "bad"`.
  - The per-subsystem row's count line (`tier2Count > 0 →
"overview.briefingSubsystemTier2"`) gains a parallel `errorCount > 0`
    branch with its own copy (new i18n key `overview.briefingSubsystemError`,
    cs "N selhalo" / en "N failed") rather than folding into the existing
    "N reported" string — that string is now accurate only for successes.
- `apps/api/src/briefing/briefing-assembly.ts`:
  - Line ~418 (`if (s.tier2Count > 0) counts.push(\`${s.tier2Count}
    reported\`);`) gains a matching
    `if (s.errorCount > 0) counts.push(\`${s.errorCount} failed\`);` — this
    text feeds the spoken/written briefing narrative, English internally
    (the UI-facing i18n strings above are separate from this backend string).

### 6. i18n

`apps/web/i18n/messages/{cs,en}.json`, `subsystems.state`:

```json
"state": {
  "idle": "V klidu" / "Idle",
  "running": "Běží" / "Running",
  "report": "Hlášení připraveno" / "Report ready",
  "waiting": "Čeká na rozhodnutí" / "Awaiting decision",
  "error": "Chyba" / "Error"
}
```

Plus the new `overview.briefingSubsystemError` key described in section 5.

## Testing

- `OrbNode.test.tsx`: drop assertions on `OrbNodeTestId.Status`/`statusLabel`;
  add/keep coverage that the halo color and `OrbitField` dot count still
  reflect `state`/`activeCount` with no text node rendered for state.
- `subsystems.service.spec.ts` (or wherever `SubsystemsService` is tested):
  new cases — a subsystem with only a failed terminal run since `lastSeenAt`
  reads `state: "error"`, `errorCount: 1`, `tier2Count: 0`; a subsystem with
  both a done and an error run reads `tier2Count: 1`, `errorCount: 1`,
  `state: "error"` (error wins precedence); an `error` + a still-`running`
  owned run together still reads `state: "error"` (error outranks running).
- `SubsystemDrawer.test.tsx`: header pill renders `errorCount` + `"bad"` tone
  when `state === "error"`.
- `BriefingRows.test.tsx`: error count renders the new failed-count copy,
  separate from the report copy.
- Full contract/schema changes are additive (`errorCount` required, `error`
  is a new enum member) — no back-compat concern since there's a single
  in-repo consumer (no external API clients).

## Files touched

- `libs/contracts/src/subsystems/subsystem.schema.ts`
- `apps/api/src/subsystems/subsystems.service.ts` (+ its spec)
- `apps/web/features/subsystems/subsystemVisuals.ts`
- `apps/web/features/subsystems/components/SubsystemDrawer/SubsystemDrawer.tsx` (+ test)
- `apps/web/features/briefing/components/BriefingRows.tsx` (+ test)
- `apps/api/src/briefing/briefing-assembly.ts`
- `libs/design-system/src/immersive/OrbNode/OrbNode.tsx` (+ test, stories)
- `apps/web/features/chat/components/SubsystemOrbMap.tsx`
- `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
