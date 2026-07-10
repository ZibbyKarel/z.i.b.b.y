# Phase 116a — Backend/contract trim + reshape system automations

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`. Do NOT add the new `task`
target here (that's 116b) — this phase only removes and reshapes.

## Goal
Remove the `discovery`, `research-digest`, `app-ideas` automation targets and their dead
machinery; keep `ResearchService`; seed the final 5 system automations.

## Changes

### 1. Contract — `libs/contracts/src/automations/automation.schema.ts`
- In `TargetSchema` remove the three variants: `discovery` (~L49), `research-digest` (~L62),
  `app-ideas` (~L69). Keep `agent`, `pipeline`, `briefing`, `memory-distill`, `pattern-extract`,
  `gap-detect`, `agent-factory`. Update the surrounding comments accordingly.

### 2. Scheduler — `apps/api/src/automations/scheduler.service.ts`
- Remove `case "discovery"`, `case "research-digest"`, `case "app-ideas"` from the `dispatch`
  switch.
- Remove constructor injections + imports for `DiscoveryTriageService`, `ResearchService`,
  `IdeaGeneratorService` (they are no longer used by the scheduler). **Do not** remove
  `MemoryDistillerService`, `PatternExtractorService`, `GapDetectorService`, `BriefingService`,
  `AgentFactoryService`, `AgentRunnerService`, `PipelineRunnerService`.

### 3. Delete `DiscoveryTriageService`
- Delete `apps/api/src/discovery/discovery-triage.service.ts` (+ its unit test if any).
- `apps/api/src/discovery/discovery.module.ts`: drop the provider/export + import of
  `DiscoveryTriageService`. **Keep** `DiscoveryController`, `ProposalsStorageService`,
  `ProposedTaskFlowService`, `proposal.schema` — the proposals-inbox feature stays.
- Rework `apps/api/test/discovery.e2e.test.ts`: it currently exercises `discovery.run()` →
  parked proposal → gate. Since triage is gone, either (a) reduce it to assert the proposals
  listing endpoint (`GET /api/discovery/proposals`) works, seeding a proposal directly via
  `ProposalsStorageService`, or (b) delete the spec. Prefer (a) so the controller stays covered.

### 4. Delete `IdeaGeneratorService` + ideas module
- Delete the entire `apps/api/src/ideas/` directory (service + test).
- `apps/api/src/automations/automations.module.ts`: remove the `IdeasModule` import (L7/L34).
  Also drop the now-unused `DiscoveryModule`/`ResearchModule` imports from **automations.module**
  IF they were only there for the scheduler (they remain registered in `app.module.ts`, so their
  controllers keep working). Verify nothing else in automations.module needs them.

### 5. Activity kind — `libs/contracts/src/activity/activity.schema.ts`
- Remove the `app-ideas-generated` kind (~L74) — it was emitted only by the deleted
  IdeaGenerator. **Keep** `research-digest` (~L58): `ResearchService.refresh()` still emits it via
  the research controller endpoint. Check `activity-view.schema.ts` mapping (~L74-75) and remove
  only the `app-ideas-generated` reference; keep the `research-digest`→`research` mapping.

### 6. Storage seeds — `apps/api/src/automations/automations.storage.service.ts`
Expand `SYSTEM_AUTOMATIONS` from `[memory-distill]` to the full 5 (preserve each entry's
`trigger`/`enabled`/`lastFiredAt` from disk via the existing heal logic — only `name`/`target`/
`system` are re-asserted):
```ts
export const SYSTEM_AUTOMATIONS: readonly Automation[] = [
  { id: "morning-briefing", name: "Ranní briefing",
    trigger: { type: "cron", expr: "0 7 * * *" }, target: { type: "briefing" },
    enabled: true, system: true },
  { id: "memory-distill", name: "Destilace paměti",
    trigger: { type: "cron", expr: "0 3 * * *" }, target: { type: "memory-distill" },
    enabled: true, system: true },
  { id: "nightly-patterns", name: "Extrakce vzorů",
    trigger: { type: "cron", expr: "0 23 * * *" }, target: { type: "pattern-extract" },
    enabled: true, system: true },
  { id: "gap-detect", name: "Návrhy na automatizaci",
    trigger: { type: "cron", expr: "0 23 * * *" }, target: { type: "gap-detect" },
    enabled: false, system: true },
  { id: "agent-factory", name: "Továrna agentů",
    trigger: { type: "cron", expr: "0 4 * * 1" }, target: { type: "agent-factory" },
    enabled: false, system: true },
];
```
Keep the existing `MEMORY_DISTILL_AUTOMATION_ID` export. Note the heal preserves the operator's
`trigger`/`enabled`, so these `trigger`/`enabled` values only apply when the file is first created.

### 7. Data files — `.zibby/data/automations/`
- Delete `discovery-triage.json`, `research-digest.json`, `app-ideas.json`.
- Update `morning-briefing.json` → `"system":true`; rename `gap-detect.json` name →
  `"Návrhy na automatizaci"`. (nightly-patterns/memory-distill already system:true.) The seed will
  also heal these on boot, but update the files so the checked-in state is correct.

### 8. Web references (make it compile — full UI redesign is 116d/e)
- `apps/web/features/automations/Screen.tsx` `resolveTarget`: remove the
  `target.type === "discovery"` branch (~L51).
- `apps/web/features/automations/components/AutomationFormFields.tsx`: remove the
  `discovery` option + `discoveryNote` card + the `discovery` branch in `buildTarget`/`canSave`.
  (This file is rewritten in 116d/e; here just remove the now-invalid `discovery` references so
  types pass.)
- `AutomationCard.tsx`: remove any `discovery`/`research-digest`/`app-ideas` label references.

### 9. i18n — `apps/web/i18n/messages/{en,cs}.json`
Remove keys `automations.targetDiscovery`, `automations.discoveryNote`,
`automations.targetResearchDigest`, `automations.targetAppIdeas`. Keep `targetMemoryDistill`,
`targetPatternExtract`, `targetGapDetect`, `targetAgentFactory`.

### 10. Docs
- Delete `docs/api/ideas.md`. Update `docs/api/discovery.md` (triage removed, proposals stay),
  `docs/api/automations.md` (target list), `docs/api/activity.md` (drop `app-ideas-generated`).
- Update `apps/api/src/automations/automations.storage.service.test.ts` fixtures that use
  `target:{type:"discovery"}` (~L117, L133) → use a surviving target (e.g. `{type:"briefing"}`).

## Verify
`pnpm check:types && pnpm --filter @zibby/contracts test && pnpm api:test && pnpm web:test`
(at minimum the automations, discovery, activity, and scheduler suites). Fix all failures.

## Out of scope
The new `task` target (116b); the dialog/CommandLine work (116c–e); settings descriptions (116f).
