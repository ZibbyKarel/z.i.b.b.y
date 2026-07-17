# F7 — Second Monitor + Merge-Queue Actions & Post-Merge Loop — Implementation Plan

> **Scope:** prove the monitor seam is real by adding a second `MonitorAdapter` (Sentry), and close the operator's "review & merge" verb by adding gated actions on Maestro's read-side queue plus a post-merge CI-watch loop. Everything fail-open; the merge click stays FOREVER the operator's (`pr.merge` locked-deny, "Never: Auto-merge"); Tier-3 = surface and wait. Three independently committable subphases: **F7a Sentry adapter**, **F7b-1 merge-queue actions**, **F7b-2 post-merge loop**.

---

## Factual corrections (roadmap premises the code refines — read first)

1. **"Zero watcher changes expected" for F7a is NOT fully achievable — and the roadmap already hedges ("that's the test of the seam"). Two concrete seam facts:**

   **(a) The `MonitorAdapter` registry seam itself IS clean.** Adding Sentry is exactly `registry.register(new SentryMonitor())` in `monitors.module.ts:29-36` plus one `MonitorEventKindSchema` value. `MonitorWatcherService.tick` (`monitor-watcher.service.ts:88-108`) calls `registry.forIntegration(integration)` and polls whatever `wants()` — no watcher edit needed for ingestion. ✅ The seam's promise holds for the *monitor* path.

   **(b) But the integration-KIND model assumes every kind is a channel — this breaks for the first monitor-only kind.** `AdapterRegistry.resolve(kind)` (`apps/api/src/channels/adapters/adapter-registry.ts:35-49`) is an **exhaustive `switch` over `Integration["kind"]` with no default**, and `ChannelWatcherService` (`channel-watcher.service.ts:109-140`) polls **every** enabled+credentialled integration through `registry.resolve(integration.kind)`. `github` is dual (channel via `streams:["issues","pulls"]` + monitor via `"ci"`); `calendar` is a `readOnly` channel. **There is no precedent for a monitor-only kind.** Adding `"sentry"` to `IntegrationKindSchema` (a) fails `tsc` at the exhaustive switch until handled, and (b) at runtime the channel watcher would try to poll Sentry as a conversational channel. **This is the real, honestly-flagged seam cost of F7a** (design decision below: a `readOnly` no-op `SentryChannelAdapter` — ~25 lines, reuses the calendar `readOnly` precedent, and doubles as the connection-test probe; keeps the exhaustive switch intact, zero channel-watcher change).

   **(c) The dispatch task text is CI-specific.** `MonitorWatcherService.dispatch` (`monitor-watcher.service.ts:172-193`) hard-codes `"Investigate the failing CI run and prepare a fix on its own branch."` (`:177`). For a Sentry error that reads wrong. F7a needs a **minimal, well-contained watcher change**: derive the instruction line from `event.kind` (a small map), not a hard-coded CI sentence. This is the one genuine watcher edit — flag it, keep it tiny.

2. **`ProjectPrService` is NOT exported from `ProjectsModule`.** `projects.module.ts:70` provides it, `:72-78` exports do **not** include it. F7b-2's post-merge recording must therefore hook *inside* `ProjectPrService.merge` (the "only merge path", `project-pr.service.ts:124-152`) or in the controller — it can't be injected cross-module. Design below records inside `merge()` via a **leaf** `MergeWatchStore` module (no cycle), not by exporting `ProjectPrService`.

3. **`ProjectPrService.merge` discards the merge commit sha.** It reads only `body.merged` (`project-pr.service.ts:150-151`) and returns `{ merged, url }`. GitHub's `PUT …/merge` response includes `sha` (the merge commit on the base branch) — exactly what the post-merge CI watch needs. F7b-2 extends `merge()` to capture it and `MergeProjectPrResultSchema` to carry it (additive optional).

4. **The existing merge confirm uses `ConfirmDeleteDialog`, not `HoldButton`.** `ProjectPullRequestsPanel.tsx:132-148` gates merge behind `ConfirmDeleteDialog`. The queue merge action uses `HoldButton` (`libs/design-system/src/components/HoldButton/HoldButton.tsx`) — a higher-friction arm→confirm control for the one irreversible click. The existing project-panel dialog is left untouched (both are valid double-confirmation guardrails; the queue is the "informed glance → deliberate hold" surface).

5. **F5b may have deferred the `MergeQueueCard` web component.** Per the F5 plan's orchestrator addendum, F5b ships API + briefing as committed scope and the card ships only if green on first attempt. **F7b-1 must therefore treat the `MergeQueueCard` as possibly-not-yet-existing** — it either extends the F5b card with actions or creates it. Verify `apps/web/features/maestro/` at implementation time; the plan covers both.

6. **Sentry uses a `token` credential — no credential-rule change.** `credentialMatchesKind` (`apps/api/src/integrations/credential-kind.ts:11-13`) returns `"password" in creds` only for `email`, else `"token" in creds`. Sentry (non-email) falls into the `token` branch automatically. `CredentialsInputSchema` (`integration.schema.ts:230-234`) already accepts `{token}`. Zero change.

7. **No new `SubsystemId` is needed.** "Sentry" is an integration *kind*, not a subsystem. The Sentry integration carries `ownerSubsystem` (default `puls`, the heartbeat owner — all integrations seed to puls) exactly like the github-ci monitor; the *task* it dispatches is owned by whatever the F2 switchboard routes it to. The roadmap's "beacon/forge" destination is the classifier's job, not an ownership tag on the integration.

---

## Shared conventions (all subphases)

- **Contract-first:** every Zod addition lands in `libs/contracts` and `pnpm --filter @zibby/contracts exec tsc -p tsconfig.json` passes before any consumer. Then api, then web — `tsc -p` per package directly (never `rtk pnpm typecheck`).
- **No `any`.** External JSON (Sentry issues, GitHub check-runs, merge response) parsed with tolerant narrow interfaces + `as`/`as unknown` casts exactly like `WorkflowRun` (`github-ci.monitor.ts:14-25`) and `GitHubPull` (`project-pr.service.ts:10-18`).
- **Fail-open everywhere.** No token / no config / 401/403/404 / rate limit on a *scheduled* poll → `[]` or silent no-op + `log.warn`, never a thrown error out of a heartbeat/tick. The monitor watcher owns the per-integration try/catch (`monitor-watcher.service.ts:94-108`); the Sentry `poll` may throw (the watcher's retry/backoff owns it, exactly like github-ci's rate-limit throw `:66-68`).
- **testid enums, i18n cs+en, per-package tsc:** every web addition uses a `*TestId` enum member and adds both `cs.json` and `en.json` keys.
- **Briefing edits strictly additive, rebased onto the post-F6 file.** Never fold F7 lines into another phase's field.
- **Validation policy:** incremental; repo-wide suites only at each subphase checkpoint commit. `rtk` prefix for shell commands.
- **Ownership tag:** the Sentry integration and any dispatched task carry attribution through existing seams (F1b write-time 422 for the integration; F2 dispatch for the task).
- **Commit footers:** every commit ends with the standard `Co-Authored-By` + `Claude-Session` footers.

---

# F7a — Sentry `MonitorAdapter` (the second monitor)

**Goal:** a `SentryMonitor` implementing the `MonitorAdapter` seam that polls Sentry's issues REST API for new unresolved issues at or above a level threshold, maps them to `MonitorAlert`s riding the **same** tier path as CI alerts (persist → `monitor-alert` activity → dispatched investigation task), dedups via `MonitorEventStore`, and fails open on a missing/invalid token. New integration kind `"sentry"` (token + org/project config), settable in the web form. Owner: `puls` (the integration); tasks routed by the switchboard.

### Verified current state
- **Seam interface:** `apps/api/src/monitors/monitor-adapter.ts:54-83` — `MonitorAdapter` (`kind`, `wants(integration):boolean` `:58`, `poll(...)→MonitorPollResult` `:60-64`); `MonitorAlert` `:10-17`; `MonitorPollResult { events, cursor, status? }` `:39-43`; `MonitorAdapterRegistry.register/forIntegration` `:72-83`.
- **Reference adapter:** `apps/api/src/monitors/github-ci.monitor.ts:40-101` — `wants` checks `config.kind==="github" && streams.includes("ci")` `:45-50`; constructor `fetchImpl: typeof fetch = fetch` `:43`; `tokenOf(creds)` `:27-30`; only actionable (red) runs emit `:82`; deterministic id `ci-<repo>-<runId>-<attempt>` `:85`; rate-limit throws `:66-68`; `status` snapshot optional `:98-99`.
- **Registration point (the whole seam):** `apps/api/src/monitors/monitors.module.ts:29-36` — `registry.register(new GithubCiMonitor())` inside the `MonitorAdapterRegistry` factory.
- **Watcher (do not edit for ingestion):** `monitor-watcher.service.ts:88-108` iterates integrations → `forIntegration` → `pollOne`; `:112-165` persists via `store.putNew` (dedup), records `monitor-alert`, `dispatch`. **Edit needed only at `:177`** (CI-specific text, correction 1c).
- **Event store:** `monitor-event.store.ts:77` `putNew` dedup-by-id; `EVENT_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` `:17` (Sentry id must sanitize slashes/colons).
- **Event kind enum:** `libs/contracts/src/monitors/monitor.schema.ts:9` `MonitorEventKindSchema = z.enum(["ci-run-failed"])`; `detail` capped `max(4000)` `:35`.
- **Integration contract:** `libs/contracts/src/integrations/integration.schema.ts:19` `IntegrationKindSchema`; `GitHubConfigSchema:78-86`; `IntegrationConfigSchema` discriminatedUnion `:106-112`; `CredentialsInputSchema:230-234`.
- **The kind-model seam cost:** `apps/api/src/channels/adapters/adapter-registry.ts:35-49` exhaustive `resolve` switch; `channel-watcher.service.ts:109-140` polls all integrations; `ChannelAdapter` interface `apps/api/src/channels/adapters/adapter.ts:42-65` with `readOnly?: true` precedent `:45`.
- **Web form:** `apps/web/features/integrations/components/IntegrationFormFields.tsx` — kind `SelectField` options `:335-346`; per-kind config blocks `:376-523`; `secretLabel` switch `:312-319`; `buildConfig` `:155-202`; `configReady` `:205-218`; testid enum `:23-46`. Credential rule `apps/api/src/integrations/credential-kind.ts:11-13` (no change).

### Contract additions (exact Zod)

**1. `libs/contracts/src/integrations/integration.schema.ts`** — add `"sentry"` to the kind enum (`:19`):
```ts
export const IntegrationKindSchema = z.enum(["slack", "email", "jira", "github", "calendar", "sentry"]);
```
Add the config schema after `CalendarConfigSchema` (`:103`):
```ts
/**
 * Sentry config (NS2 F7a) — the first monitor-ONLY integration kind. `org` +
 * `project` are Sentry slugs; the auth token lives in the credentials store
 * (`token`, like Slack/Jira/GitHub). `baseUrl` overrides the SaaS host for
 * self-hosted (default https://sentry.io). `minLevel` is the actionability floor:
 * only issues at or above it become alerts (→ tier path); quieter issues stay in
 * Sentry's own UI (the adapter's analogue of github-ci emitting only red runs).
 * `.strict()` — no token-shaped key can leak into the committed entity file.
 */
export const SentryConfigSchema = z
  .object({
    kind: z.literal("sentry"),
    org: z.string().min(1),
    project: z.string().min(1),
    baseUrl: z.string().url().optional(),
    minLevel: z.enum(["warning", "error", "fatal"]).default("error"),
  })
  .strict();
export type SentryConfig = z.infer<typeof SentryConfigSchema>;
```
Add `SentryConfigSchema` to the discriminatedUnion (`:106-112`).

**2. `libs/contracts/src/monitors/monitor.schema.ts`** — add the event kind (`:9`):
```ts
export const MonitorEventKindSchema = z.enum(["ci-run-failed", "error-unresolved"]);
```
Update the doc comment (`:3-8`) to name Sentry's `error-unresolved` as the second member.

### Change list

1. **Contracts (1–2 above).** Build contracts. Update enumerating tests: `integration.contract.test.ts` (add a sentry accept case mirroring `:26-45`); any test asserting the exact `IntegrationKindSchema`/`IntegrationConfigSchema`/`MonitorEventKindSchema` member set (grep `"ci-run-failed"`, `"calendar"` in `libs/contracts/**/*.test.ts`).

2. **`apps/api/src/monitors/sentry.monitor.ts`** (new — the adapter, models `github-ci.monitor.ts`).
   - `class SentryMonitor implements MonitorAdapter`, `readonly kind = "sentry" as const`, `constructor(private readonly fetchImpl: typeof fetch = fetch)`.
   - `wants(integration)`: `integration.config.kind === "sentry"` (no `streams` gate — every sentry integration is a monitor).
   - `poll(integration, creds, cursor)`:
     - guard `config.kind !== "sentry"` → throw; `token = tokenOf(creds)` (copy the 3-line helper `github-ci.monitor.ts:27-30`); no token → throw `"no sentry token configured"` (watcher catches → fail-open per integration).
     - `const base = config.baseUrl ?? "https://sentry.io";`
     - `GET ${base}/api/0/projects/${org}/${project}/issues/?query=is:unresolved&sort=new&limit=25` with `authorization: Bearer <token>`, `accept: application/json`.
     - `res.status === 429 || 403 || 401` → throw — the watcher's retry/backoff + per-integration boundary owns it (mirror `github-ci.monitor.ts:66-69`); a persistent 401 surfaces as `monitor poll failed after retries` (`monitor-watcher.service.ts:100`).
     - Tolerant-parse: `interface SentryIssue { id?: string; shortId?: string; title?: string; culprit?: string; level?: string; permalink?: string; firstSeen?: string; lastSeen?: string; count?: string }`.
     - `LEVEL_RANK = { warning:1, error:2, fatal:3 }`; `minRank = LEVEL_RANK[config.minLevel]`.
     - Cursor = newest `firstSeen` seen (opaque ISO string, exactly like github-ci's `created_at` cursor `:74-77`). Skip issues with `firstSeen <= cursor`.
     - Emit an alert only for issues with `LEVEL_RANK[level] >= minRank`. Deterministic id: `` `sentry-${slug(org)}-${slug(project)}-${issue.id}` `` where `slug` = `.replace(/[^a-zA-Z0-9._-]/g, "-")` (satisfy `EVENT_ID_REGEX`). `kind: "error-unresolved"`, `title: \`Sentry: ${issue.title}\``, `detail` (multi-line: Project, Level, Culprit, Count, capped ≤ 4000), `url: issue.permalink`, `occurredAt: firstSeen`.
     - Return `{ events, cursor: newest }`. **Status snapshot: omit for v1** (`MonitorPollResult.status` is optional) — Sentry has no clean red/green; keep the adapter minimal. Document the omission.
   - **Dedup is free:** `MonitorEventStore.putNew` drops an id already seen, so each issue alerts exactly once even as `lastSeen` updates or on a re-poll. Cursor-after-persist (`monitor-watcher.service.ts:152-153`) keeps it replay-safe.

3. **`apps/api/src/channels/adapters/sentry.adapter.ts`** (new — correction 1b, the honest seam cost). A `readOnly` no-op `ChannelAdapter` so the exhaustive `resolve` switch stays total and the channel watcher harmlessly no-ops on a Sentry integration. Model the calendar adapter's `readOnly: true`.
   - `readonly kind = "sentry" as const; readonly readOnly = true as const;`
   - `poll(...)`: return `{ items: [], cursor: undefined }` (Sentry has no conversational inbound; alerts flow through the monitor watcher, not here).
   - `test(integration, creds)`: real token probe — `GET ${base}/api/0/projects/${org}/${project}/` → `{ ok: res.ok, detail }`. This gives the operator a working "Test connection" for free.
   - `send(...)`: `throw new Error("sentry is read-only")` (never reached — `readOnly` short-circuits the reply surface, same as calendar).
   - Register in `adapter-registry.ts`: `private readonly sentry = new SentryChannelAdapter();` + `case "sentry": return this.sentry;` (`:47`). This resolves the `tsc` exhaustiveness error and keeps the channel watcher a no-op for Sentry.
   - **Alternative (documented, not chosen):** teach `channel-watcher.service.ts` to skip a `MONITOR_ONLY_KINDS` set and let `resolve` return `null` — a channel-watcher change. Rejected: the no-op adapter is smaller, reuses the `readOnly` precedent, and yields the connection-test probe.

4. **`apps/api/src/monitors/monitors.module.ts`** — register the adapter (the seam's whole point, `:32-35`):
   ```ts
   registry.register(new GithubCiMonitor());
   registry.register(new SentryMonitor());   // NS2 F7a — the second monitor
   ```
   No other module change; `SentryMonitor` needs no DI (constructs its own `fetch`, like `GithubCiMonitor`).

5. **`apps/api/src/monitors/monitor-watcher.service.ts`** — the ONE watcher edit (correction 1c). Replace the hard-coded CI sentence at `:177` with a per-kind instruction map:
   ```ts
   const INSTRUCTION: Record<MonitorEventKind, string> = {
     "ci-run-failed":
       "Investigate the failing CI run and prepare a fix on its own branch. Do not push or merge — the PR is the gate.",
     "error-unresolved":
       "Investigate the Sentry error, find the root cause, and prepare a fix on its own branch. Do not push or merge — the PR is the gate.",
   };
   ```
   and build `text` from `INSTRUCTION[event.kind]`. Everything else in `dispatch` (`:172-193`) unchanged — same tier path, same `createTask`, same act-then-report gate. A `Record<MonitorEventKind, string>` also makes any future kind a compile-time reminder to supply text.

6. **Web form (`IntegrationFormFields.tsx`) — make `sentry` settable:**
   - Add `{ value: "sentry", label: t("integrations.kindSentry") }` to the kind `SelectField` options (`:343`).
   - Add testids to the enum (`:23-46`): `SentryOrg`, `SentryProject`, `SentryBaseUrl`, `SentryMinLevel`.
   - Add `sentry` state to `IntegrationFormState` (`org`, `project`, `baseUrl`, `minLevel` + setters), seeded from `sentryCfg` (`:127-131` pattern).
   - `buildConfig` `sentry` case (`:155-202`): `{ kind:"sentry", org, project, ...(baseUrl?{baseUrl}:{}) , minLevel }`.
   - `configReady` `sentry` case (`:205-218`): `org.trim() && project.trim()`.
   - `secretLabel` (`:312-319`): sentry → `t("integrations.apiToken")`.
   - A `kind === "sentry"` config block (`:492-523` pattern): org, project TextInputFields, optional baseUrl, a `SelectField` for minLevel.
   - **Do NOT** exclude sentry from the Integrace UI — a Sentry integration is created *as* a sentry kind; it must be selectable. Verify `IntegrationFormDialog`/`DetailScreen` don't filter it out.

7. **i18n (`cs.json` + `en.json`):** `integrations.kindSentry`, `integrations.sentryOrg`(+Hint), `integrations.sentryProject`, `integrations.sentryBaseUrl`(+Hint), `integrations.sentryMinLevel`. cs first-class, en mirror.

### Tests (scoped vitest)
- `libs/contracts/src/integrations/integration.contract.test.ts` — a sentry integration + `{token}` credential parse; `SentryConfigSchema.strict()` rejects a stray `token` key; `minLevel` defaults to `"error"`.
- `libs/contracts/src/monitors/monitor.schema.test.ts` — `"error-unresolved"` parses in `MonitorEventKindSchema`; a full `MonitorEvent` with it round-trips.
- `apps/api/src/monitors/sentry.monitor.test.ts` (stub `fetchImpl`, model `github-ci.monitor.test.ts`):
  - **fixture alert → event:** one `error`-level unresolved issue → one `MonitorAlert`, id `sentry-<org>-<project>-<id>`, kind `error-unresolved`, `occurredAt = firstSeen`; cursor = newest `firstSeen`.
  - **actionability filter:** a `warning` issue with `minLevel:"error"` → NOT emitted; with `minLevel:"warning"` → emitted.
  - **cursor/dedup:** issues at/below cursor `firstSeen` skipped; re-poll of the same page yields the same ids (watcher dedups via `putNew`).
  - **fail-open:** no token → throws (watcher catches); 401/403/429 → throws (retry/backoff owns it); malformed JSON / missing fields → tolerant-parsed, no crash.
  - **slug sanitization:** an org slug with a `/` or `:` produces an `EVENT_ID_REGEX`-valid id.
- `apps/api/src/channels/adapters/sentry.adapter.test.ts` — `poll` returns empty; `readOnly === true`; `test` maps a 200 to `{ok:true}` and a 404 to `{ok:false}`; `send` throws.
- `apps/api/src/monitors/monitor-watcher.service.test.ts` — extend: a Sentry integration ingests an `error-unresolved` event, records `monitor-alert`, dispatches a task whose text contains the Sentry (not CI) instruction; **second-adapter-registers-with-zero-ingestion-change** assertion (a fixture with both a github-ci and a sentry integration ticks and each yields its own event via `forIntegration`).
- `apps/api/src/channels/adapters/adapter-registry.test.ts` — `resolve("sentry")` returns the readOnly adapter.
- Web: `IntegrationFormFields.test.tsx` — selecting `sentry` renders org/project fields, hides github/slack fields, secret label = API token; `buildCreate()` yields a valid `SentryConfig`.

### Commit
`feat(monitors): Sentry MonitorAdapter — second monitor proves the seam (new sentry kind, error-unresolved alerts on the tier path)`

---

# F7b-1 — Merge-queue actions

**Goal:** on F5b's read-side queue, add operator-triggered actions — **merge a `ready` PR through the EXISTING gated merge path** (reuse `POST /projects/:id/prs/:number/merge`, `HoldButton` confirm), and **open-in-GitHub** external links. No new merge code; no auto-merge; every merge is an operator's deliberate hold. This is a mostly-web subphase.

### Verified current state
- **The only merge path (reuse, never duplicate):** `apps/api/src/projects/project-pr.service.ts:124-152` `merge()` → `PUT …/pulls/{number}/merge`; controller `projects.controller.ts:185-203`; route `projects.contract.ts:157-173` (`POST /projects/:id/prs/:number/merge`, body `{method?}` optional, 200/404/409/422).
- **Existing merge mutation (reuse):** `apps/web/features/projects/mutations/useMergeProjectPrMutation.ts`; existing confirm (leave untouched) `ProjectPullRequestsPanel.tsx:132-148`.
- **`HoldButton`:** `libs/design-system/src/components/HoldButton/HoldButton.tsx` — `onConfirm`, `label`/`armedLabel`/`doneLabel`, `tone`, `size`, `block`; `HOLD_DURATION_MS=900` `:34`; testids `:36-43`; arm→confirm doc `:68-77`.
- **F5b queue surface (build on / possibly create — correction 5):** `libs/contracts/src/maestro/maestro.schema.ts`, contract `GET /api/maestro/queue`; web `apps/web/features/maestro/queries/useMergeQueueQuery.ts` + `MergeQueueCard` (verify existence at impl time).

### Change list
1. **No contract change.** Reuse `mergeProjectPr` verbatim.
2. **Web — `MergeQueueCard` (extend if F5b shipped it, else create):**
   - A `MergeQueueMergeControl` per entry rendered **only when `entry.queueState === "ready"`** (a blocked/stale PR shows no merge control). Non-ready entries render an "open in GitHub" link + the reason (checkState/reviewState).
   - The control is a `HoldButton` (`tone="warn"`, `size="sm"`, labels from i18n naming the PR number) whose `onConfirm` fires `useMergeProjectPrMutation` with `{ params: { id: entry.projectId, number: entry.number }, body: {} }`. On success, invalidate `useMergeQueueQuery` **and** `useProjectPrsQuery(entry.projectId)`.
   - An "open in GitHub" `<a href={entry.url} target="_blank" rel="noreferrer">` per entry.
   - testids: `MergeQueueTestId.{MergeHold, OpenInGithub}` added to the enum (or a new `MergeQueueActionTestId`).
3. **i18n (`cs.json`+`en.json`):** `maestro.merge.hold` ("Podržte pro sloučení #{number}"), `maestro.merge.armed` ("Znovu potvrďte sloučení"), `maestro.merge.done`, `maestro.merge.openInGithub`, plus `maestro.merge.blockedReason`. cs first-class.
4. **Guardrail assertions (structural):** the queue's merge path must reach ONLY the existing gated endpoint — no new API. Keep the "no PUT in maestro.service" test from F5b intact (the *action* lives in web, calling the operator route).

### Tests (scoped vitest)
- `MergeQueueCard.test.tsx`:
  - a `ready` entry renders a `HoldButton` (testid) + open-in-GitHub link; a `blocked`/`stale` entry renders **no** merge control (only the link + reason).
  - holding to completion fires `useMergeProjectPrMutation` once with the entry's `projectId`+`number`; a single click does **not** fire it (arm-only) — asserts the double-confirmation.
  - on mutation success, both query keys invalidate.
- No new API test (reuses existing `mergeProjectPr` e2e).

### Commit
`feat(maestro): merge-queue actions — hold-to-merge a ready PR via the existing gated path + open-in-GitHub (no auto-merge)`

---

# F7b-2 — Post-merge loop

**Goal:** after an operator merges a PR **through ZIBBY's merge endpoint**, record the merge outcome, watch the target branch's CI on the merged sha within a bounded window, dispatch a **gated fix task** (the ordinary tier path) if it goes red, and surface the outcome in briefing + activity. NO auto-anything — this closes the loop the operator opened.

### Verified current state
- **Merge path returns no sha (correction 3):** `project-pr.service.ts:150-151`; `merge()` is the single choke point (`:113-123`) — the right place to record.
- **`ProjectPrService` not exported (correction 2):** `projects.module.ts:72-78`. Recording lives inside `merge()` writing to a **leaf** `MergeWatchStore` module.
- **CI-on-sha read:** `MonitorEventStore.listStatuses()` (`monitor-event.store.ts:140`); for a *specific sha* use `GET /repos/{repo}/commits/{sha}/check-runs` + `/commits/{sha}/status` (tolerant roll-up) — same REST posture as `ProjectPrService`.
- **Gated fix dispatch:** `TaskSchedulerService.createTask` (`task-scheduler.service.ts:286`); template `monitor-watcher.service.ts:172-193`.
- **Scheduler seam:** `scheduler.service.ts:131-210`; system automations `automations.storage.service.ts:54-95`; target union `automation.schema.ts:43-96`.
- **Briefing (additive):** `briefing.service.ts:58-110`; `briefing.schema.ts:97-104` extras.
- **Activity:** `activity.schema.ts:11` kind enum; `ActivityRefsSchema:92` is `.strict()` — existing fields suffice (encode PR as `itemId: "pr-<number>"`, sha in the summary text — **no ActivityRefs change needed**).

### Contract additions (exact Zod)

**1. `libs/contracts/src/projects/project-pr.schema.ts`** — extend the merge result (additive optional):
```ts
export const MergeProjectPrResultSchema = z.object({
  merged: z.boolean(),
  url: z.string().optional(),
  /** NS2 F7b-2 — the merge commit sha on the base branch, for the post-merge CI watch. */
  sha: z.string().optional(),
});
```

**2. New file `libs/contracts/src/maestro/merge-watch.schema.ts`** (persisted, internal — no HTTP endpoint):
```ts
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

/** A merge ZIBBY performed, awaiting its target-branch CI verdict (bounded window). */
export const MergeWatchStateSchema = z.enum(["watching", "green", "red", "expired"]);
export type MergeWatchState = z.infer<typeof MergeWatchStateSchema>;

export const MergeWatchSchema = z.object({
  /** Deterministic id: `merge-<repo-slug>-<sha>`. */
  id: z.string().min(1),
  projectId: z.string().min(1),
  repo: z.string().min(1),
  sha: z.string().min(1),
  prNumber: z.number().int(),
  prTitle: z.string(),
  mergedAt: IsoDateTimeSchema,
  /** Stop watching after this instant (mergedAt + window). */
  deadline: IsoDateTimeSchema,
  attempts: z.number().int().nonnegative(),
  state: MergeWatchStateSchema,
  /** The fix task dispatched on a red verdict (links the loop's tail). */
  taskId: z.string().optional(),
});
export type MergeWatch = z.infer<typeof MergeWatchSchema>;
```
Export from the maestro barrel.

**3. `libs/contracts/src/automations/automation.schema.ts`** — add to `TargetSchema` after F5's `loom-audit`:
```ts
  // NS2 F7b-2 — poll pending post-merge CI watches: for each merge ZIBBY performed,
  // check the merged sha's target-branch CI within a bounded window; on red dispatch
  // a gated fix task (tier path), on green record success, past deadline expire.
  // Deterministic; ref = `merge-watch:<resolvedCount>`.
  z.object({ type: z.literal("post-merge-watch") }),
```

**4. `libs/contracts/src/briefing/briefing.schema.ts`** — add after the last F6 extras field (rebase onto post-F6 file):
```ts
  /** NS2 F7b-2 — merged-work celebration + post-merge CI outcomes per project. */
  mergedRecently: z.array(z.string()).max(50).optional(),
```

**5. `libs/contracts/src/activity/activity.schema.ts`** — add two kinds to `ActivityKindSchema`:
```ts
  // NS2 F7b-2. An operator-merged PR (through ZIBBY's gated endpoint) — the merge
  // loop's head; the post-merge watch rides its sha.
  "merge-completed",
  // NS2 F7b-2. The merged sha's target-branch CI resolved (green: silent Tier-1;
  // red: a gated fix task dispatched, riding taskId) or the watch window expired.
  "post-merge-outcome",
```

### Change list
1. **Contracts (1–5).** Build. Update: the `TargetSchema` enumeration test; the `ActivityKindSchema` frozen-set test; `MergeProjectPrResultSchema` consumers (the merge mutation/e2e tolerate the new optional field automatically).
2. **`apps/api/src/maestro/merge-watch.store.ts`** + `MERGE_WATCH_DIR` token in a **leaf** `MergeWatchModule` (imports nothing — no cycle; both `ProjectsModule` and the poller import it). File-backed one `<id>.json` per watch, modeled on `MonitorEventStore` (`putNew`-style create + `patch` + `list`). Path `process.env.MERGE_WATCH_DIR ?? dataDir("maestro/merge-watch")`.
3. **`apps/api/src/projects/project-pr.service.ts`** — record the merge:
   - Capture sha: `const body = (await res.json()) as { merged?: boolean; sha?: string };` → return `{ merged, url, ...(body.sha ? { sha: body.sha } : {}) }`.
   - Inject `MergeWatchStore` (via `MergeWatchModule` imported into `projects.module.ts` — leaf, verify no cycle at boot) + `ActivityLogService`. After a successful `merged === true` merge: record `merge-completed` activity (`refs: { projectId, itemId: \`pr-${number}\` }`, summary names PR + sha) and, **if a sha is present**, `mergeWatch.putNew({...state:"watching"})` with `deadline = mergedAt + POST_MERGE_WINDOW_MIN`. Wrap recording in `.catch(() => {})` — **a recording failure must never fail the merge**. PR title: store the number if title unknown.
   - **Keep the merge itself unconditional and un-gated by the watch** — no behavior change to the merge decision. Only *observation* is added.
4. **`apps/api/src/maestro/post-merge-watch.service.ts`** (new, in `MaestroModule`). Inject `MergeWatchStore`, `ProjectsStorageService` + `resolveGithubToken` (F5's extracted helper), `MonitorEventStore`, `TaskSchedulerService`, `ActivityLogService`, `LoggerService`, `@Optional() fetchImpl`.
   - `async poll(now = new Date()): Promise<{ resolved: number }>`:
     - For each `watch` in `store.list()` where `state === "watching"`:
       - `now >= deadline` → `patch(state:"expired")`, record `post-merge-outcome` ("CI nedokončeno v okně" — Tier-1), continue.
       - Resolve repo token; fail-open skip (leave watching) if absent.
       - Prefer the CI sidecar: `monitorEvents.listStatuses({projectId})` — if a matching green/red status covers the sha, use it. Else `GET /repos/{repo}/commits/{sha}/check-runs` (+ `/status`), tolerant roll-up to `passing|failing|pending`.
       - `passing` → `patch(state:"green")`, record `post-merge-outcome` (silent Tier-1, `status:"green"`).
       - `failing` → dispatch a gated fix task exactly like the monitor watcher (`createTask({ title: \`Post-merge red: #${prNumber}\`, text: ..., paths: [] }, Date.now(), projectId)`); on success `patch(state:"red", taskId)`, record `post-merge-outcome` (`status:"red"`, `refs.taskId`). Per-watch try/catch — a failed dispatch leaves it `watching` for the next tick (never lost).
       - `pending` → increment `attempts`, leave `watching`.
     - Return the resolved count.
   - **NO auto-merge, no auto-anything outward** — only a *task dispatch that itself ends at the PR gate*.
5. **`apps/api/src/automations/scheduler.service.ts`** — inject `PostMergeWatchService`; add ``case "post-merge-watch": const { resolved } = await this.postMerge.poll(); return `merge-watch:${resolved}`;``. `automations.module.ts` import `MaestroModule` (verify no cycle: MaestroModule imports Projects/Monitors/MergeWatch; AutomationsModule imports Maestro; nothing imports back).
6. **`apps/api/src/automations/automations.storage.service.ts`** — seed a system automation, `enabled: true`, frequent cron for a short window:
   ```ts
   { id: "post-merge-watch", name: "Sledování po sloučení",
     trigger: { type: "cron", expr: "*/10 * * * *" }, // every 10 min
     target: { type: "post-merge-watch" }, enabled: true, system: true },
   ```
   Update the `seedSystem` exact-set test + the data-test fixture landmine sweep (temp copy + `git status --short apps/api/data-test`).
7. **Briefing (additive, rebased onto post-F6 file):** read the store into a `mergedRecently` string array in the `Promise.all` (`.catch(() => [])`); pass into `assembleBriefing`; `## Merged` render block (celebrate green merges per project + flag any post-merge red with its fix task). `BriefingInput` gains `mergedRecently?`, conditional spread. `briefing.module.ts` import the module (verify no cycle).
8. **Web (light):** the merge activity + `post-merge-outcome` surface through the existing activity feed automatically (new kinds render via their summary). Optional: a `mergedRecently` briefing-card section reusing the `automationGaps` treatment — defer if the suite isn't green first try. No new mutation.

### Tests (scoped vitest)
- `libs/contracts/src/maestro/merge-watch.schema.test.ts` — `MergeWatch` + `MergeWatchState` parse; deadline/attempts constraints.
- `libs/contracts/src/projects/project-pr.schema.test.ts` — `MergeProjectPrResultSchema` accepts and omits `sha` (old result still parses).
- `libs/contracts/src/automations/*.test.ts` — `post-merge-watch` target parses/round-trips.
- `libs/contracts/src/activity/activity.schema.test.ts` — `merge-completed` + `post-merge-outcome` parse.
- `libs/contracts/src/briefing/briefing.schema.test.ts` — `mergedRecently` optional; old briefing parses.
- `apps/api/src/projects/project-pr.service.test.ts` — extend: a successful merge returns `sha`, records `merge-completed`, and writes a `watching` MergeWatch; a merge whose recording throws still returns `{merged:true}` (recording never fails the merge); a 409/422 records nothing.
- `apps/api/src/maestro/post-merge-watch.service.test.ts` (stub `fetchImpl` + store):
  - **green:** check-runs all success → `state:"green"`, `post-merge-outcome` green, **no** `createTask`.
  - **red → gated fix:** a failing check-run → `createTask` called once with `paths:[]` + the projectId; `state:"red"`, `taskId` linked; **assert no PUT/merge call anywhere**.
  - **pending:** in-progress → stays `watching`, attempts++.
  - **expiry:** `now > deadline` → `state:"expired"`, outcome recorded, no task.
  - **CI-sidecar reuse:** a matching green `listStatuses` entry resolves without a check-runs fetch.
  - **fail-open:** no token / 403 → watch stays `watching`, no throw; `createTask` throwing leaves it `watching` for retry.
- `apps/api/src/automations/scheduler.service.test.ts` — `post-merge-watch` dispatches `PostMergeWatchService.poll`, ref `merge-watch:<n>`.
- `apps/api/src/automations/automations.storage.service.test.ts` — `post-merge-watch` seeded, `system:true`, `enabled:true`, delete → 409.
- `apps/api/src/briefing/*` — `mergedRecently` present⇄absent; read failure omitted, briefing still assembles.

### Commit
`feat(maestro): post-merge loop — record the operator's merge, watch merged-sha CI in a bounded window, dispatch a gated fix on red (no auto-merge)`

---

## Sequencing, dependencies, risks

- **Order:** F7a first (independent — pure monitor seam + integration kind). Then F7b-1 (needs F5b's queue; web-only, quick). Then F7b-2 (needs F5b's token-resolution helper + the merge path; API-heavy). Each is a separate checkpoint commit.
- **Hard dependency on F1–F6:** F1b `ownerSubsystem` write-time 422 (the Sentry integration must carry it); F2 dispatch (routes the alert task); F5b's queue surfaces and `resolveGithubToken` helper; F6's briefing-file state (F7's additive fields rebase onto it). If F5b deferred `MergeQueueCard` (correction 5), F7b-1 creates it.
- **The two honest F7a seam facts (correction 1):** the monitor *registry* seam is clean; the integration-*kind* model needed a readOnly no-op channel adapter (first monitor-only kind) and a one-line, per-kind dispatch-text generalization. Both small and contained; neither weakens any law.
- **Autonomy contract preserved:** F7a only *observes*. F7b-1 merges **only** through the existing operator endpoint, behind a `HoldButton` double-confirm, only for `ready` PRs. F7b-2 only *watches* and dispatches a gated fix; it never merges, deploys, or pushes.
- **Rate-limit / window risk (F7b-2):** the `*/10` cron × bounded `deadline` × per-watch try/catch × CI-sidecar reuse bound the GitHub fan-out; a huge backlog degrades gracefully (watches expire, never error). `POST_MERGE_WINDOW_MIN = 120`.
- **Cross-package tsc:** contracts → api → web per touched package at each checkpoint. The `AdapterRegistry.resolve` exhaustive switch is the compile-time guarantee that `sentry` is handled everywhere kind is switched.
- **data-test fixture landmine (F7b-2):** the `enabled:true` `post-merge-watch` system automation seeds into any `data-test` vault on boot — temp copy + `git status --short apps/api/data-test`, update seed-set assertions in lockstep.
- **API e2e baseline:** 2 pre-existing pipelines.e2e failures — do not chase.

---

## Orchestrator review addendum (Fable, 2026-07-17) — BINDING

Plan APPROVED with the following rulings:

1. **All seven corrections accepted.** The readOnly no-op `SentryChannelAdapter` is
   the chosen resolution of the monitor-only-kind seam cost (rejected alternative
   stays rejected); the per-kind dispatch-instruction `Record` is the one sanctioned
   watcher edit.
2. **`POST_MERGE_WINDOW_MIN = 120`** (2 h) is fixed; `post-merge-watch` seeds
   `enabled: true` (charter duty 6, consistent with the F5 ruling).
3. **Merge-safety invariants must each have a test:** (a) the queue merge action
   reaches only the existing `mergeProjectPr` endpoint (no new API); (b) a single
   click on the HoldButton never merges (arm-only); (c) no merge control renders on
   a non-`ready` entry; (d) `PostMergeWatchService` performs no PUT/merge call;
   (e) a recording failure never fails the operator's merge.
4. **F7a Sentry `detail` hygiene:** keep the 4000-char cap; the detail carries
   title/culprit/level/count only — never request or embed Sentry event payloads
   (stack locals may contain user data; the link is the drill-down).
5. **Briefing sequencing:** F7's `mergedRecently` edit rebases onto the post-F6
   briefing file — implementation order on that file stays strictly sequential
   (F3 → F4 → F5 → F6 → F7).
6. Commit messages end with the standard Co-Authored-By + Claude-Session footers.
