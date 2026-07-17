# F5 — The Empty Chairs: Sentinel · Maestro · Loom v1 — Implementation Plan

> **Scope:** give three seated-but-idle subsystems one real, recurring backend duty each, built on existing machinery (the automation/scheduler seam, the GitHub-REST posture, the graphify tooling, F4's memory shelves, F3b's briefing). Everything fail-open; nothing writes outward autonomously; anything that commits the operator ends at the Tier-3 gate. Three independently committable subphases: **F5a Sentinel**, **F5b Maestro**, **F5c Loom**.

---

## Factual corrections (roadmap premises the code disproves — read first)

1. **`knip` is not installed and has no script.** `node_modules/.bin/knip` is absent and `package.json` has no `knip` script (only `knip.json` config exists at root). The roadmap's "graphify god-node report, madge cycles, **knip**" (ROADMAP-2.md:250) overstates available tooling. **Loom v1 must not shell out to knip.** The two duties that actually run today are: graphify (`graphify-out/GRAPH_REPORT.md`, parsed by the existing `apps/api/src/self-knowledge/graph-report.parser.ts`) and madge (`package.json:17` — `check:cycles`, but note it is scoped to `apps/web` only, not the whole repo). Loom v1 = **god-node/community delta from the graphify report + a madge circular-dependency check**, knip deferred to a later phase (add a "knip when installed" TODO).

2. **`pnpm audit --json` is not a universal dependency-vuln source, and osv-scanner is not installed.** Project repos are arbitrary external clones (may be npm/yarn, may have no `pnpm-lock.yaml`); `pnpm audit` only works in a pnpm workspace, and osv-scanner is a missing external CLI (same class of problem as knip). The **already-wired, universal** path is **GitHub Dependabot alerts over REST** using the github-integration PAT — the exact token-resolution seam `ProjectPrService.resolveGithubLink` already uses (`apps/api/src/projects/project-pr.service.ts:70-81`). **Sentinel v1's dependency-vuln source is `GET /repos/{repo}/dependabot/alerts?state=open` via the stored integration token**, not `pnpm audit`. (A local `pnpm audit` fallback for ZIBBY-itself is a documented follow-up, not v1.)

3. **Sentinel and Loom are scheduled automations, not monitor adapters.** The `MonitorAdapter` seam (`apps/api/src/monitors/monitor-adapter.ts`) is for **status/alert streams riding an integration** (GitHub CI now, Sentry in F7a) — it polls on the monitor watcher's heartbeat and has a `wants(integration)` opt-in. Sentinel's periodic scan and Loom's nightly audit have no per-integration stream; they are **scheduler targets** exactly like `gap-detect` and `agent-factory` (`apps/api/src/automations/scheduler.service.ts:171-183`). The roadmap groups all three under "empty chairs," but F5a/F5c use the **automation seam**, and only F5b touches anything monitor-adjacent (reading CI status). This is consistent with ROADMAP-2.md:239 which itself says "**Scheduled automation** runs…".

4. **Maestro's read-side already half-exists.** `ProjectPrService.listOpen` (`apps/api/src/projects/project-pr.service.ts:90-111`) already enumerates open PRs per project via `GET /repos/{repo}/pulls` with the resolved token, and `getProjectPrs`/`mergeProjectPr` routes already exist (`apps/api/src/projects/projects.controller.ts:182-203`). The merge path is already **operator-only** and documented as "the ONLY merge path" (`project-pr.service.ts:113-123`). **F5b is enrichment + cross-project aggregation + ordering over that existing service — it adds zero merge code.** The vault's "The merge click is forever the operator's" (north-star-2.md:90) is already satisfied; F5b must not weaken it.

5. **F5 must not touch F3b's briefing restructure.** F3b adds a **structured** `subsystems?: BriefingSubsystemLine[]` field (per ns2-f3-policy-accountability.md:131). F5 feeds the briefing through the **separate, established optional-string-array extras pattern** (`learnedPatterns`/`automationGaps`/`appIdeas` — `libs/contracts/src/briefing/briefing.schema.ts:97-103`, rendered `briefing-assembly.ts:349-357`). The two are independent and both additive; do not fold F5 findings into F3b's `subsystems` lines.

6. **Existing "proposer" automations seed `enabled: false`.** `gap-detect` and `agent-factory` are seeded disabled (`automations.storage.service.ts:84,92`). But charter duty 6 (north-star-2.md:63-65) says a watcher that never wakes on its own "is not a watcher." **Design decision (below): Sentinel and Loom seed `enabled: true`** with conservative crons — they are fail-open no-ops when there's nothing to scan, so waking them by default makes the chairs real without risk. Called out so a reviewer can flip it.

---

## Shared conventions (apply to all three subphases)

- **Contract-first:** every Zod addition lands in `libs/contracts` and its `pnpm --filter @zibby/contracts exec tsc -p tsconfig.json` passes before any `apps/api` consumer is written.
- **No `any`.** External JSON (Dependabot alerts, GitHub review/check payloads) is parsed with tolerant narrow interfaces + `as unknown` casts exactly like `GitHubPull` (`project-pr.service.ts:10-18`) and `WorkflowRun` (`github-ci.monitor.ts:14-25`).
- **Fail-open everywhere.** No github link / no token / 403 (feature disabled) / no local clone / tool missing → `[]` or silent no-op + a `log.warn`, never a thrown error out of a heartbeat. Mirror `ProjectPrService.listOpen`'s "`[]`, never an error page" posture (`project-pr.service.ts:44-52`) and the monitor watcher's per-source try/catch (`monitor-watcher.service.ts:94-108`).
- **Bounded exec.** Any shell-out uses the shared `exec` wrapper with an explicit timeout (`apps/api/src/shared/git-exec.ts:13,16`), never an unbounded `child_process`.
- **Ownership tag:** any agent/pipeline/integration created or seeded for these chairs carries `ownerSubsystem` (F1b write-time 422). Sentinel/Maestro/Loom are already in `SubsystemIdSchema` (`libs/contracts/src/subsystems/subsystem.schema.ts:9-20`).
- **Memory shelf (F4a):** findings notes are filed onto the owning subsystem's shelf via `vault.updateIndex(subsystemShelfId(<id>), noteId, label)` (`apps/api/src/memory/vault.service.ts:434`; helper `apps/api/src/memory/subsystem-shelf.ts` from F4a). `updateIndex` auto-creates a missing shelf. Guard with `.catch(() => {})` + warn (F4a's posture).
- **Proposal-note pattern:** deterministic findings are written to a vault note and read back for the briefing exactly like `GapDetectorService.writeGaps`/`readGaps` (`apps/api/src/gaps/gap-detector.service.ts:73-92,95-113`): `updateNote` then `createNote` on miss, `tier: "memory"`, `- [ ] …` bullet lines.
- **Gated task pattern:** a high-severity finding that needs code work is dispatched through the ordinary scheduler exactly like the monitor watcher does — `taskScheduler.createTask({ title, text, paths: [] }, Date.now(), projectId)` (`monitor-watcher.service.ts:172-193`; signature `task-scheduler.service.ts:281`). Classification, budget/limit guards, and the structural PR gate all apply; the run never pushes/merges.
- **Silent no-op is a real state.** Each service diffs against a persisted last-run snapshot; an unchanged/green scan writes nothing, dispatches nothing, and only logs (Tier-1). This is the third test case per chair (ROADMAP-2.md:257).
- **testid enums, i18n cs+en, per-package tsc:** any web addition uses a `*TestId` enum member and adds both `cs` and `en` keys; run `tsc -p` per touched package (never `rtk pnpm typecheck` — it lies, PROGRESS.md).
- **Validation policy:** incremental (prettier/eslint/scoped vitest per touched file); repo-wide suites only at each subphase's checkpoint commit.

---

## Shared new module (F5a lands it, F5c reuses it)

**`apps/api/src/subsystems/subsystem-findings.store.ts`** — a tiny durable JSON snapshot store so each chair can diff this run against the last (the "silent no-op" requirement) without re-deriving. Modeled on the cursor half of `MonitorEventStore` (a single `<key>.json` under a data dir).

```ts
// One persisted fingerprint set per scan key ("sentinel", "loom-<repo>"…).
export const FindingSnapshotSchema = z.object({
  key: z.string().min(1),
  fingerprints: z.array(z.string()),   // stable per-finding ids, sorted
  updatedAt: IsoDateTimeSchema,
});
```

Methods: `read(key): Promise<Set<string>>` (missing → empty set, fail-open) and `write(key, fingerprints)`. Path: `SUBSYSTEM_FINDINGS_DIR = process.env.SUBSYSTEM_FINDINGS_DIR ?? dataDir("subsystems/findings")` (mirror `resolveMonitorEventsDir`, `monitors.module.ts`). This schema lives in contracts (`libs/contracts/src/subsystems/subsystem-findings.schema.ts`) since it's persisted, but it is **internal** (not exposed over HTTP) — no contract endpoint.

> Rationale: keeps the diff logic out of the vault note (the note is a human proposal surface, the snapshot is the machine cursor), and makes "green run → no-op" a one-line set-equality test.

---

# F5a — Sentinel v1 (dependency CVE + secret watch)

**Goal:** a scheduled Sentinel scan that (1) reads open Dependabot alerts per project repo via REST, (2) runs a bounded secret-pattern scan over each project's local clone, files findings as a proposal note onto Sentinel's shelf + the briefing, and dispatches a **gated fix task** for critical CVEs. Fail-open; owner: `sentinel`.

### Verified current state
- Scheduler dispatch switch: `apps/api/src/automations/scheduler.service.ts:128-211` — `switch (target.type)`; the `gap-detect` case (`:171-176`) is the exact precedent (deterministic service call, ref = `gaps:<count>`).
- System automations seed: `apps/api/src/automations/automations.storage.service.ts:54-95` (`gap-detect` `:79-86`, `agent-factory` `:87-94`), self-heal loop `:118-133`.
- Target union: `libs/contracts/src/automations/automation.schema.ts:43-96`.
- Token resolution + REST posture to copy: `apps/api/src/projects/project-pr.service.ts:20-23,70-81,95-101` (Bearer, 429/403 handling, injectable `fetchImpl`).
- Project local clone path: `apps/api/src/projects/project-local.service.ts:36 resolve`, `:112 resolveForRun` (`{ path, isGitRepo }`).
- Gated-task dispatch: `apps/api/src/tasks/task-scheduler.service.ts:281 createTask`; monitor-watcher usage `apps/api/src/monitors/monitor-watcher.service.ts:172-193`.
- Proposal note write/read: `apps/api/src/gaps/gap-detector.service.ts:73-113`.
- Briefing extras: `libs/contracts/src/briefing/briefing.schema.ts:97-103`; assembly input `briefing-assembly.ts:43-47`, spread `:104-110`, render `:349-357`; read helper `briefing.service.ts:183-199` (`readAutomationGaps`).
- Activity kinds enum: `libs/contracts/src/activity/activity.schema.ts:11-82` (`monitor-alert` `:62`).
- Projects list source for iteration: `ProjectsStorageService.list()` (used in briefing `briefing.service.ts:68`).

### Contract additions (exact Zod)

**1. `libs/contracts/src/automations/automation.schema.ts`** — add to the `TargetSchema` discriminated union (`:43`), after the `agent-factory` member (`:64`):
```ts
  // NS2 F5a — Sentinel's scheduled security watch: per project repo, open
  // Dependabot alerts (GitHub REST) + a bounded secret-pattern scan over the
  // local clone. Deterministic; proposes ≠ acts (findings → a vault note +
  // Sentinel's shelf); a CRITICAL CVE additionally dispatches a gated fix task
  // through the ordinary scheduler (ends at the PR gate). ref = `sentinel:<count>`.
  z.object({ type: z.literal("sentinel-scan") }),
```

**2. `libs/contracts/src/briefing/briefing.schema.ts`** — add after `appIdeas` (`:103`):
```ts
  /** NS2 F5a — Sentinel's open security findings (CVE/secret) for the briefing. */
  securityFindings: z.array(z.string()).max(50).optional(),
```

**3. `libs/contracts/src/subsystems/subsystem-findings.schema.ts`** — new file, `FindingSnapshotSchema` (shown above). Export from the subsystems barrel.

**4. `libs/contracts/src/activity/activity.schema.ts`** — add to `ActivityKindSchema` (`:11`):
```ts
  // NS2 F5a/F5c — a subsystem watcher completed a scheduled scan (Tier-1, silent +
  // recorded): new findings rode a proposal note; a critical one dispatched a gated task.
  "subsystem-scan",
```

### Change list
1. **Contracts (1–4 above).** Build contracts; then update the frozen-enum/target tests that assert the exact target set (`libs/contracts/src/automations/*.test.ts` if it enumerates `TargetSchema` options — grep `"sentinel-scan"` after; add the case).
2. **`apps/api/src/subsystems/subsystem-findings.store.ts`** (shared module, above) + register in a module (new `SubsystemFindingsModule` or fold into `SubsystemsModule`) exporting the store; provide `SUBSYSTEM_FINDINGS_DIR`.
3. **`apps/api/src/sentinel/sentinel.service.ts`** (new). Inject `ProjectsStorageService`, `ResolvedProjectService` + `CredentialsStore` (token resolution — reuse `resolveGithubLink` logic; extract a shared `resolveGithubToken(project)` helper into `project-pr.service.ts` and export it, or duplicate the 12 lines with a citation), `ProjectLocalService`, `VaultService`, `TaskSchedulerService`, `ActivityLogService`, `SubsystemFindingsStore`, `LoggerService`, and an `@Optional() fetchImpl?: typeof fetch` (default global `fetch`, tests stub — mirror `ProjectPrService:55-67`).
   - `async scan(now = new Date()): Promise<{ findings: SentinelFinding[] }>`:
     - For each `project` in `projects.list()`:
       - **Dependabot:** resolve token+repo; if present, `GET ${GITHUB_API}/repos/{repo}/dependabot/alerts?state=open&per_page=50` with `Bearer`; on 403/404 → skip (feature off / no scope) — fail-open, log debug; on 429 → catch and skip (this is a scheduled scan, not the merge click). Tolerant-parse each alert: `{ number, security_advisory?: { severity?, cve_id?, summary? }, dependency?: { package?: { name? } }, html_url? }`. Map to a `SentinelFinding` (fingerprint = `dep-<repo>-<number>`).
       - **Secret scan:** `const local = await projectLocal.resolve(project)` (or `resolveForRun`); if it has a clone path, walk tracked text files (bounded: skip `node_modules`, `.git`, binaries, files > 256 KB; cap total files scanned e.g. 5000) applying a curated regex set (AWS key `AKIA[0-9A-Z]{16}`, GitHub PAT `ghp_[0-9A-Za-z]{36}`, generic `-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----`, Slack `xox[baprs]-`, high-entropy `password|secret|token` assignments — keep the set small and documented). Fingerprint = `secret-<projectId>-<sha1(file:line:rule)>`. No local clone → skip.
     - Build the finding set; diff fingerprints against `findingsStore.read("sentinel")`; **new** = current − last.
     - If `new.length === 0`: log `"sentinel: no new findings"`, `findingsStore.write("sentinel", current)`, return (silent Tier-1 no-op). If findings shrank (fixed), rewrite the note/snapshot but dispatch nothing.
     - Else: `writeFindings(all current findings, now)` to vault note `suggestions/security-findings` (gap-detector pattern); `vault.updateIndex(subsystemShelfId("sentinel"), "suggestions/security-findings", "Bezpečnostní nálezy — <date>")` (`.catch`); `findingsStore.write("sentinel", current)`; `activity.record({ kind: "subsystem-scan", summary: "Sentinel: <n> nových bezpečnostních nálezů", refs: { count } })`.
     - **Gated task for criticals:** for each *new* finding with `severity === "critical"` (CVE only — never a secret; a leaked-secret fix is operator-manual, log it as needs-you text, do not auto-open a run touching it), dispatch `taskScheduler.createTask({ title: "Sentinel: kritická zranitelnost <pkg>", text: "<advisory summary>\n\nRepo: <repo>\nBalíček: <pkg> (<cve>)\n\nPřiprav opravu na vlastní větvi. Nepushuj ani nemerguj — brána je PR." , paths: [] }, Date.now(), project.id)`. Wrap per-finding in try/catch (a failed dispatch leaves the finding in the note; next scan retries) — mirror `monitor-watcher.dispatch` `:185-192`.
   - `async readFindings(): Promise<string[]>` — read the note, parse `- [ ] …` lines (gap-detector `readGaps`).
4. **`apps/api/src/sentinel/sentinel.module.ts`** — imports `ProjectsModule`, `IntegrationsModule` (credentials), `MemoryModule` (vault), `TasksModule`, `ActivityModule`, `SubsystemFindingsModule`; provider+export `SentinelService`. Verify no boot cycle (Sentinel depends on tasks/projects/memory; none depend back — same leaf position as gaps).
5. **`apps/api/src/automations/scheduler.service.ts`** — inject `SentinelService`; add `case "sentinel-scan"` (`:171` neighbourhood): ``const { findings } = await this.sentinel.scan(); return `sentinel:${findings.length}`;``. Add `SentinelModule` to `automations.module.ts` imports.
6. **`apps/api/src/automations/automations.storage.service.ts`** — add to `SYSTEM_AUTOMATIONS` (`:54`):
   ```ts
   {
     id: "sentinel-scan",
     name: "Bezpečnostní hlídka",
     trigger: { type: "cron", expr: "0 5 * * 1" },   // weekly Mon 05:00
     target: { type: "sentinel-scan" },
     enabled: true,
     system: true,
   },
   ```
   (Correction #6: `enabled: true`.) The self-heal loop (`:118-133`) picks it up on boot; the `seedSystem` exact-set expectations in `automations.storage.service.test.ts` must be updated.
7. **Briefing wiring (additive):** `apps/api/src/briefing/briefing.service.ts` — inject `SentinelService`; add `this.sentinel.readFindings()` to the `Promise.all` at `:86-91` (`.catch(() => [])`), pass `securityFindings` into `assembleBriefing` (`:92-109`). `apps/api/src/briefing/briefing-assembly.ts` — add `securityFindings?: string[]` to `BriefingInput` (`:43`), conditional spread (`:104`), and a `## Security` render block (`:349` pattern). `apps/api/src/briefing/briefing.module.ts` — import `SentinelModule` (verify no cycle: briefing already imports tasks/projects/memory; Sentinel is a sibling leaf — confirm at boot).
8. **i18n + web (minimal):** the briefing note render is server-side markdown (no web change strictly required). If the overview `BriefingCard` renders `securityFindings` as a section, add `BriefingCardTestId.SecurityFinding` + `overview.security.*` cs+en keys — otherwise defer (briefing-line-only is acceptable per scope). **Committed scope: briefing note + activity; web card section optional.**

### Tests (scoped vitest)
- `libs/contracts/src/automations/automation.schema.test.ts` — `sentinel-scan` target parses; round-trips in `AutomationSchema`.
- `libs/contracts/src/briefing/briefing.schema.test.ts` — `securityFindings` optional/omissible; old briefing still parses.
- `apps/api/src/subsystems/subsystem-findings.store.test.ts` — read-missing → empty set; write→read round-trips; corrupt file → empty (fail-open).
- `apps/api/src/sentinel/sentinel.service.test.ts` (the three charter cases):
  - **fixture scan → proposal:** stub `fetchImpl` returning one high (non-critical) Dependabot alert → note `suggestions/security-findings` written with a `- [ ]` line, shelf `updateIndex` called with `subsystem-sentinel-moc`, `subsystem-scan` activity recorded, **no** `createTask`.
  - **critical → gated task:** one `critical` alert → `taskScheduler.createTask` called once with `paths: []` and the project id; note still written.
  - **secret scan:** a temp clone dir containing a file with `AKIA…` → a `secret-…` finding in the note; a clean dir → none.
  - **green/no-delta no-op:** snapshot pre-seeded with the fixture's fingerprints → `scan` writes nothing new, dispatches nothing, records nothing (assert `createTask`/`updateNote` not called for the no-op path; snapshot re-write allowed).
  - **fail-open:** 403 from Dependabot → skipped, no throw; no github link → skipped; `createTask` throwing on a critical → logged, other findings still noted (finding stays for retry).
- `apps/api/src/automations/scheduler.service.test.ts` — `sentinel-scan` target dispatches to `SentinelService.scan`, ref `sentinel:<n>`.
- `apps/api/src/automations/automations.storage.service.test.ts` — `sentinel-scan` seeded, `system: true`, `enabled: true`; delete refused (409).
- `apps/api/src/briefing/*` — assembly present⇄absent snapshot; service fixture → `securityFindings` populated; read failure → omitted, briefing still assembles.

### Commit
`feat(sentinel): scheduled CVE (Dependabot) + secret watch → proposals, gated critical-fix tasks, briefing`

---

# F5b — Maestro v1 (read-side merge queue)

**Goal:** a cross-project, ordered merge queue — every open PR across project repos with its CI/check state, review state, mergeability, and age, classified `ready | blocked | stale`. Exposed as a read-only API endpoint + briefing lines. **No merge, no write action** (merge stays the operator's existing `POST /projects/:id/prs/:number/merge`; F7b adds queue actions behind the gate).

### Verified current state
- `ProjectPrService.listOpen` (`apps/api/src/projects/project-pr.service.ts:90-111`) — REST `GET /repos/{repo}/pulls?state=open`, token via `resolveGithubLink` (`:70-81`), tolerant `toProjectPr` map (`:26-37`), `[]` on no-link (`:93`).
- `ProjectPr` contract: `libs/contracts/src/projects/project-pr.schema.ts:11-20` (number/title/url/author/branch/draft/createdAt).
- Merge (operator-only, keep untouched): `project-pr.service.ts:113-152`; routes `projects.controller.ts:182-203`.
- CI status already available per source: `CiStatusSchema` (`libs/contracts/src/monitors/monitor.schema.ts:61-76`), read via `MonitorEventStore.listStatuses()` (`briefing.service.ts:70`) — reusable for Maestro's per-repo CI colour without a second GitHub round-trip when a `ci` stream exists.
- ts-rest read-only controller template: `apps/api/src/monitors/monitors.controller.ts` (whole file); contract template `libs/contracts/src/monitors/monitors.contract.ts`.
- Web PR query precedent: `apps/web/features/projects/queries/useProjectPrsQuery.ts`, mutation `mutations/useMergeProjectPrMutation.ts`.

### Contract additions (exact Zod)

**1. New file `libs/contracts/src/maestro/maestro.schema.ts`:**
```ts
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { ProjectPrSchema } from "../projects/project-pr.schema";

/** Aggregated check/CI verdict for a PR head (GitHub check-runs + commit status
 *  rolled up). `unknown` = we couldn't read it (fail-open), never treated as green. */
export const MergeCheckStateSchema = z.enum(["passing", "failing", "pending", "unknown"]);
export type MergeCheckState = z.infer<typeof MergeCheckStateSchema>;

/** Review verdict from the PR's reviews (latest-per-reviewer rollup). */
export const MergeReviewStateSchema = z.enum(["approved", "changes_requested", "review_required", "unknown"]);
export type MergeReviewState = z.infer<typeof MergeReviewStateSchema>;

/** Maestro's classification of a PR's release-readiness (display only). */
export const MergeQueueStateSchema = z.enum(["ready", "blocked", "stale"]);
export type MergeQueueState = z.infer<typeof MergeQueueStateSchema>;

/** One PR enriched for the merge queue — the read-side ProjectPr plus release signals. */
export const MergeQueueEntrySchema = ProjectPrSchema.extend({
  projectId: z.string().min(1),
  projectName: z.string().optional(),
  repo: z.string(),
  checkState: MergeCheckStateSchema,
  reviewState: MergeReviewStateSchema,
  /** GitHub's own mergeability flag when known (clean/dirty/blocked/unknown). */
  mergeable: z.enum(["mergeable", "conflicting", "unknown"]),
  ageHours: z.number().nonnegative(),
  queueState: MergeQueueStateSchema,
});
export type MergeQueueEntry = z.infer<typeof MergeQueueEntrySchema>;

/** The whole queue, newest-blocking-first within each bucket. Order: ready, then
 *  blocked, then stale — the operator's "what can I merge now" glance. */
export const MergeQueueSchema = z.object({
  entries: z.array(MergeQueueEntrySchema),
  generatedAt: IsoDateTimeSchema,
});
export type MergeQueue = z.infer<typeof MergeQueueSchema>;

export const MergeQueueQuerySchema = z.object({ projectId: z.string().min(1).optional() });
export type MergeQueueQuery = z.infer<typeof MergeQueueQuerySchema>;
```

**2. New file `libs/contracts/src/maestro/maestro.contract.ts`** — ts-rest, read-only, mirror `monitorsContract`:
```ts
export const maestroContract = c.router({
  getMergeQueue: {
    method: "GET",
    path: "/api/maestro/queue",
    query: MergeQueueQuerySchema,
    responses: { 200: MergeQueueSchema },
  },
});
```
Export both from the contracts barrel (`libs/contracts/src/index.ts`).

**3. `libs/contracts/src/briefing/briefing.schema.ts`** — add:
```ts
  /** NS2 F5b — Maestro's merge-queue summary lines for the briefing. */
  mergeQueue: z.array(z.string()).max(50).optional(),
```

### Change list
1. **Contracts (1–3).** Build contracts + barrel exports. Classification rules (document in `maestro.schema.ts` JSDoc):
   - `ready` = `checkState === "passing"` AND `reviewState === "approved"` AND `mergeable !== "conflicting"` AND `!draft`.
   - `stale` = `ageHours > 24*14` (2 weeks) — applies only when not `ready`.
   - `blocked` = everything else (failing/pending checks, changes requested, conflicts, draft).
2. **`apps/api/src/maestro/maestro.service.ts`** (new). Inject `ProjectsStorageService`, `ResolvedProjectService`, `CredentialsStore`, `MonitorEventStore` (for CI status reuse), `LoggerService`, `@Optional() fetchImpl`. Reuse the exported `resolveGithubToken` helper (extracted in F5a step 3).
   - `async queue(query): Promise<MergeQueue>`:
     - Projects = `projects.list()` filtered by `query.projectId` when set.
     - For each project with a github link: call the existing `ProjectPrService.listOpen` directly (inject it) to avoid duplicating the pulls fetch. For each PR, enrich with **three bounded REST reads** (all tolerant-parsed, all fail-open to `unknown`):
       - `GET /repos/{repo}/pulls/{number}` → `mergeable_state`/`mergeable` → map to `mergeable`; `head.sha`.
       - `GET /repos/{repo}/commits/{sha}/check-runs` (+ `/status` for legacy statuses) → roll up to `checkState`. Prefer the CI `CiStatus` sidecar (`monitorEvents.listStatuses`) when the repo has a `ci` integration stream and the sha matches — cheaper, already polled.
       - `GET /repos/{repo}/pulls/{number}/reviews` → latest-per-reviewer rollup → `reviewState`.
     - Compute `ageHours` from `createdAt`; classify `queueState`; sort ready→blocked→stale (within bucket, blocked/oldest first).
     - Wrap each project in try/catch (one failing repo never blocks the queue); on any per-PR enrich failure, degrade that PR's signal to `unknown` (still listed, classified `blocked`).
   - `async summaryLines(): Promise<string[]>` — e.g. `"<project>: 2 ready · 3 blocked · 1 stale"` per project with open PRs, for the briefing.
   - **Rate-limit discipline:** cap enrich fan-out (only enrich the newest N=20 PRs per repo; older ones show with `unknown` signals + `stale`) so a huge repo can't exhaust the API. Document the cap.
3. **`apps/api/src/maestro/maestro.controller.ts`** (new) — `@TsRestHandler(maestroContract)`, read-only, `getMergeQueue` → `maestro.queue(query)`. Mirror `MonitorsController`.
4. **`apps/api/src/maestro/maestro.module.ts`** — imports `ProjectsModule` (verify `ProjectPrService` is exported; if not, export it), `IntegrationsModule`, `MonitorsModule` (for `MonitorEventStore`); providers `MaestroService` + controller; export `MaestroService`. Register module in `app.module.ts`. Verify no cycle.
5. **Briefing wiring (additive):** inject `MaestroService` into `briefing.service.ts`; add `this.maestro.summaryLines().catch(() => [])` to the `Promise.all`; pass `mergeQueue`. Assembly: `mergeQueue?` on `BriefingInput`, conditional spread, `## Merge queue` render block. `briefing.module.ts` import `MaestroModule` (verify no cycle at boot).
6. **Web (minimal surface):** `apps/web/features/maestro/queries/useMergeQueueQuery.ts` (mirror `useProjectPrsQuery`) + a small read-only `MergeQueueCard` rendering entries grouped by `queueState` with a `StatusDot`, PR link, and an "open in GitHub" external link (read-only — **no merge button**; merge stays on the project detail's existing gated dialog). testids `MergeQueueTestId.{Entry,ReadyGroup,BlockedGroup,StaleGroup}`; i18n `maestro.*` cs+en. **Committed scope: API endpoint + briefing lines; the web card is the light half — if time-boxed, ship API + briefing and defer the card to F7b's action pass.**

### Tests (scoped vitest)
- `libs/contracts/src/maestro/maestro.schema.test.ts` — entry/queue parse; `queueState`/`checkState`/`reviewState` enums; query optional.
- `apps/api/src/maestro/maestro.service.test.ts` (stubbed `fetchImpl` + injected `ProjectPrService` or stubbed pulls):
  - passing checks + approved + mergeable + fresh → `ready`.
  - failing checks OR changes_requested OR conflicting OR draft → `blocked`.
  - `ageHours > 14d` and not ready → `stale`; ordering ready→blocked→stale.
  - no github link → project contributes nothing, no error (`[]`).
  - one repo's enrich throws → other repos still in queue; that repo's PR degrades to `unknown`/`blocked`.
  - CI sidecar reuse: when `MonitorEventStore.listStatuses` has a matching green status, `checkState === "passing"` without a check-runs fetch.
  - **no merge:** assert the service never calls any `PUT …/merge` (no `method: "PUT"` in the service).
- `apps/api/src/maestro/maestro.controller.e2e.test.ts` — `GET /api/maestro/queue` returns 200 + shape; `?projectId=` filters.
- `apps/api/src/briefing/*` — `mergeQueue` present⇄absent; read failure omitted.
- Web: `MergeQueueCard.test.tsx` — groups render with testids; external links present; **no merge control rendered**.

### Commit
`feat(maestro): read-side merge queue (checks/reviews/mergeability/age, ordered) + briefing — no merge action`

---

# F5c — Loom v1 (scheduled quality audit)

**Goal:** a nightly Loom audit over ZIBBY itself that runs the **in-repo** tooling — graphify god-node/community report + madge circular check — diffs against the last run, and files **new** findings as a proposal note onto Loom's shelf + the briefing. knip deferred (correction #1). Fail-open; owner: `loom`.

### Verified current state
- graphify report parser (reuse, don't reimplement): `apps/api/src/self-knowledge/graph-report.parser.ts` — parses `graphify-out/GRAPH_REPORT.md` into god-nodes (`{name, degree}`) + communities (`{name, size}`); tolerant by design (`:7`). Report path token/consumer: `self-knowledge.service.ts:28,50-52 readCodebaseShape`.
- madge: `package.json:17` `check:cycles = madge --circular apps/web`; madge is installed (`package.json:77`). Run via shared `exec` with a timeout bound.
- Scheduler target + system-automation seams: same as F5a (`scheduler.service.ts:171-183`, `automations.storage.service.ts:54-95`).
- Shelf + proposal-note + snapshot-store: same shared machinery as F5a (F4a `subsystemShelfId`, `subsystem-findings.store.ts`, gap-detector note pattern).
- installRoot for running tools against ZIBBY itself: `apps/api/src/shared/data-dir.ts installRoot()` (used by `SelfService.cwd()` `self.service.ts:65-67`).

### Contract additions (exact Zod)

**1. `libs/contracts/src/automations/automation.schema.ts`** — add to `TargetSchema` after `sentinel-scan`:
```ts
  // NS2 F5c — Loom's nightly quality audit: graphify god-node/community deltas +
  // madge circular-dep check over ZIBBY itself. Deterministic; proposes ≠ acts
  // (new findings → a vault note + Loom's shelf + briefing; the operator turns a
  // line into work). knip deferred (not installed). ref = `loom:<count>`.
  z.object({ type: z.literal("loom-audit") }),
```

**2. `libs/contracts/src/briefing/briefing.schema.ts`** — add:
```ts
  /** NS2 F5c — Loom's new code-quality findings (god-nodes, cycles) for the briefing. */
  qualityFindings: z.array(z.string()).max(50).optional(),
```

(`subsystem-scan` activity kind already added in F5a; reuse it.)

### Change list
1. **Contracts (1–2).** Build; update `TargetSchema` enumeration test.
2. **`apps/api/src/loom/loom.service.ts`** (new). Inject `VaultService`, `SubsystemFindingsStore`, `ActivityLogService`, `LoggerService`, and a `GRAPH_REPORT_PATH` token (default `path.join(installRoot(), "graphify-out", "GRAPH_REPORT.md")` — same file `SelfKnowledgeService` reads; injectable so tests point at a fixture).
   - `async audit(now = new Date()): Promise<{ findings: LoomFinding[] }>`:
     - **graphify delta:** read `GRAPH_REPORT.md` (fail-open: missing → skip that source, log — do NOT run `graphify update` from the service; keeping the report current is the existing `graphify update .` hook). Parse with `parseGraphReport`. Findings = god-nodes above a degree threshold (e.g. `degree >= 25`) and oversized communities (e.g. `size >= 40`) — thresholds documented constants. Fingerprint = `godnode-<name>` / `community-<name>`.
     - **madge cycles:** `exec("pnpm", ["exec", "madge", "--circular", "--json", "apps/web"], { cwd: installRoot(), timeout: 60_000 })` (fail-open: non-zero/absent → skip source, log). Parse JSON cycles; each cycle → finding, fingerprint = `cycle-<sha1(sortedMembers)>`. (Scope limitation from correction #1 — `apps/web` only, matching the existing script; widening is a follow-up.)
     - Diff current fingerprints vs `findingsStore.read("loom")`; **new** = current − last.
     - `new.length === 0` → log `"loom: no new findings"`, write snapshot, return (silent Tier-1 no-op).
     - Else → `writeFindings(current, now)` to vault note `suggestions/quality-findings` (gap-detector pattern); `vault.updateIndex(subsystemShelfId("loom"), "suggestions/quality-findings", "Audit kvality — <date>")` (`.catch`); `findingsStore.write("loom", current)`; `activity.record({ kind: "subsystem-scan", summary: "Loom: <n> nových nálezů kvality" })`.
     - **No task dispatch in v1** — Loom findings are proposals to Forge (north-star-2.md); turning a finding into a run is an operator decision, matching gap-detector's "proposes ≠ acts."
   - `async readFindings(): Promise<string[]>` — read the note, parse `- [ ]` lines.
3. **`apps/api/src/loom/loom.module.ts`** — imports `MemoryModule`, `ActivityModule`, `SubsystemFindingsModule`; provider+export `LoomService` + `GRAPH_REPORT_PATH`. Leaf position, no cycle.
4. **`scheduler.service.ts`** — inject `LoomService`; ``case "loom-audit": const { findings } = await this.loom.audit(); return `loom:${findings.length}`;``. `automations.module.ts` import `LoomModule`.
5. **`automations.storage.service.ts`** — seed:
   ```ts
   {
     id: "loom-audit",
     name: "Noční audit kvality",
     trigger: { type: "cron", expr: "0 2 * * *" },   // nightly 02:00
     target: { type: "loom-audit" },
     enabled: true,
     system: true,
   },
   ```
   Update the seed-set test.
6. **Briefing wiring (additive):** inject `LoomService`; add `this.loom.readFindings().catch(() => [])` to `Promise.all`; pass `qualityFindings`; assembly `## Quality` render block; `briefing.module.ts` import `LoomModule`.
7. **Web:** briefing-line-only in committed scope (server markdown). Optional overview `qualityFindings` section reusing the same card treatment as `automationGaps` — if added, `BriefingCardTestId.QualityFinding` + `overview.quality.*` cs+en.

### Tests (scoped vitest)
- `libs/contracts/src/automations/*.test.ts` — `loom-audit` target parses.
- `libs/contracts/src/briefing/briefing.schema.test.ts` — `qualityFindings` optional.
- `apps/api/src/loom/loom.service.test.ts` (fixture `GRAPH_REPORT.md` + stubbed `exec`):
  - **fixture audit → proposal:** report with a degree-40 god-node + a stubbed madge cycle → note `suggestions/quality-findings` written, shelf `updateIndex` called with `subsystem-loom-moc`, `subsystem-scan` recorded.
  - **no-delta no-op:** snapshot pre-seeded with the fixture's fingerprints → nothing written/recorded (assert `updateNote`/`updateIndex`/`record` not called), snapshot re-write allowed.
  - **new-since-last:** snapshot has the god-node but not the cycle → only the cycle line is "new"; note lists all current, activity fires.
  - **fail-open:** missing report file → graphify source skipped, madge-only findings still filed; `exec` rejects → cycle source skipped, graphify-only findings still filed; both absent → total no-op, no throw.
  - **knip:** assert the service issues no knip invocation — v1 does not depend on it.
- `apps/api/src/automations/scheduler.service.test.ts` — `loom-audit` dispatches `LoomService.audit`, ref `loom:<n>`.
- `apps/api/src/automations/automations.storage.service.test.ts` — `loom-audit` seeded, `system`, `enabled: true`, delete → 409.
- `apps/api/src/briefing/*` — `qualityFindings` present⇄absent; read failure omitted.

### Commit
`feat(loom): nightly quality audit (graphify deltas + madge cycles) → proposals on Loom's shelf + briefing`

---

## Sequencing, dependencies, risks

- **Order:** F5a first (it lands the shared `subsystem-findings.store.ts` + the `subsystem-scan` activity kind + the `resolveGithubToken` extraction that F5b reuses). Then F5b (independent otherwise). Then F5c (reuses F5a's store + activity kind). Each is an independent checkpoint commit.
- **Hard dependency on F1/F3/F4 (all land before F5 per the roadmap order):** F1b's `ownerSubsystem` + write-time 422; F4a's `subsystem-shelf.ts` + `vault.updateIndex` shelf filing; F3b's briefing structure (F5's extras arrays are independent of F3b's `subsystems` field but share `BriefingSchema`/`assembleBriefing` — coordinate the additive edits so both land cleanly). If F4a's `subsystemShelfId` helper is not yet present when F5a is implemented, the shelf-filing line degrades to a no-op behind its `.catch` — but the plan assumes F4a shipped, so import it directly.
- **Autonomy contract preserved:** no outward writes anywhere — Sentinel/Loom only write vault notes + dispatch (Sentinel) tasks that themselves end at the PR gate; Maestro is pure read (asserted by the no-PUT test). `pr.merge` locked-deny and "the merge click is the operator's" are untouched (F5b adds zero merge code).
- **Rate-limit risk (F5b):** the per-PR triple-fetch fan-out is the one real cost; the N-cap + CI-sidecar reuse + per-repo try/catch bound it. If the operator has many large repos, the queue degrades gracefully (older PRs show `unknown`), never errors.
- **Cross-package tsc:** contracts → api → web, in that order, per touched package, at each checkpoint (`tsc -p` directly, not `rtk pnpm typecheck`).
- **data-test fixture landmine:** the three new `enabled: true` system automations will be seeded into any `data-test` vault on boot — regenerate/verify fixtures with a temp copy and `git status --short apps/api/data-test`, and update the `automations.storage.service.test.ts` seed-set assertions in lockstep.

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED with the following rulings:

1. **All six factual corrections accepted** — Sentinel uses Dependabot REST (not
   `pnpm audit`), Loom uses graphify+madge only (no knip), Sentinel/Loom ride the
   automation seam (not MonitorAdapter), Maestro adds zero merge code.
2. **Secret-scan output hygiene (new, binding):** the vault note, the briefing
   line, the activity summary, and the snapshot fingerprint must NEVER contain the
   matched secret value itself — only `file:line`, the rule name, and the project.
   Add an explicit test: a finding line for an `AKIA…` match does not contain the
   matched string. Leaked-secret findings never dispatch a task (plan already says
   so) — they surface as needs-you text only.
3. **`enabled: true` seeding for sentinel-scan and loom-audit is approved**
   (charter duty 6 — a watcher that never wakes is not a watcher); both are
   fail-open no-ops on a green system. If the operator objects, flipping the seed
   is a one-line change recorded in DECISIONS.md.
4. **Briefing schema coordination:** F3b, F4c and F5 all add optional fields to
   `BriefingSchema`/`assembleBriefing`. Implementation order is F3 → F4 → F5
   (sequential, never parallel on this file); each phase rebases its additive edit
   onto the file as it then exists.
5. **F5b web card:** implement the API endpoint + briefing lines as the committed
   scope; the `MergeQueueCard` ships if the suite stays green on first attempt,
   otherwise defer it to F7b with a note in PROGRESS.md (do not thrash on it).
6. Commit messages end with the standard Co-Authored-By + Claude-Session footers.
