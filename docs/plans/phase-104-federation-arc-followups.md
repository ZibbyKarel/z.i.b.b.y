# Phase 104 — Federation-arc follow-ups (chain-runs SSE scope + repo hygiene)

> TODO ("Otevřené otázky z federation arc (PR #49, rozhodnutí operátora)"). These were flagged as
> operator-decision items. This phase takes the two that are clean, self-contained engineering;
> the two that genuinely need an architecture/design decision are deferred below with reasons.

## In scope (this phase)

### A — Wire chain-run status into the `/api/events` SSE (TODO: rim particles blocker)
> _"Rim particles (node→node) … potřebují chain-runs SSE scope na API
> (`ChainRunnerService.onRunStatus` není zapojený do `/api/events`); bez něj by byly fake."_

Recon (verified):
- `apps/api/src/events/events.controller.ts` merges `fromRunStatus` streams for **agents,
  pipelines, goals** + channels + activity + heartbeats. It does NOT include chain runs.
- `apps/api/src/chains/chain-runner.service.ts` (l.52) already exposes
  `onRunStatus(listener: (run: ChainRun) => void)` (l.145–147) that **mirrors
  PipelineRunnerService** exactly (emits `"status"` on every transition; `chainRunId` +
  `status`). So the data source exists — only the merge + module wiring is missing.
- The web `RunEventsProvider` ignores unknown scopes (documented "decision 15/7"), so adding a new
  `"chain-runs"` scope is safe/additive on the client.

Change:
1. Add `ChainRunnerService` to `EventsController`'s constructor and merge a new
   `fromRunStatus<ChainRun>("chain-runs", (l) => this.chains.onRunStatus(l), (run) => ({ runId:
   run.chainRunId, status: run.status }))` block alongside the others.
2. Ensure `EventsModule` (`apps/api/src/events/events.module.ts`) can inject `ChainRunnerService`
   — import `ChainsModule` (or whichever module `provides/exports` the chain runner). Confirm the
   runner is `exported` from its module; export it if not (mirror how PipelineRunnerService is
   exported).
3. Frontend: add `"chain-runs"` to whatever scope handling exists so a chain-run transition
   invalidates the chain-runs query (mirror the goal-runs precedent). Find the web
   `RunEventsProvider` / query-invalidation switch and add the scope; if it's fully
   unknown-scope-tolerant and chain runs already refetch via another path, keep it minimal and
   just document that the scope now flows.
4. This unblocks node→node rim particles (they can now be driven by real chain-run transitions).
   Rendering the rim particles themselves is scene-polish left as a follow-up **on top of this
   real data path** — note it in TODO rather than shipping fake motion. (If a clean, low-risk
   rim-particle hook already exists in the scene from phase 97's handoff-particle machinery, wire
   it to the new scope; otherwise defer the visual.)

Tests: extend `events.controller` test (if present) to assert the merged stream includes a
chain-run transition; `ChainRunnerService` test already covers `onRunStatus`.

### B — Untrack `.playwright-mcp/` artifacts (TODO: repo hygiene)
> _".playwright-mcp/*.png historicky trackované v gitu (před gitignore) — rozhodnout, jestli
> vyčistit."_

Decision: **clean up.** `.gitignore` already ignores `/.playwright-mcp/` (l.78) but the PNGs +
console logs were committed before that. Run `git rm -r --cached .playwright-mcp` so they stop
being tracked (files stay on disk locally; they're ignored going forward). Confirm `git status`
shows them removed from the index and not re-added.

## Deferred (needs an operator/architecture decision — documented in TODO)

- **Per-project gate rules — re-homing the global catalog onto a project + precedence (item 1).**
  Large architectural change (rule ownership/scoping + precedence resolution) and it explicitly
  gates the sentence-builder AUTHORING UI. Not a self-contained fix; needs a design decision on
  the ownership/precedence model before implementation. Leave for a dedicated future phase.
- **Drawer on mobile + multiple drawers at once (item 2).** Acknowledged as a deliberate v1 scope
  (sheet under lg, a single drawer). Multi-drawer + mobile sheet is a UX design task that should
  follow the Phase 99 drawer rework, not ride along with it. Defer.

Keep items 1 and 2 in TODO.md flagged as "deferred — needs design decision".

## Files

- `apps/api/src/events/events.controller.ts` (+ its test if present)
- `apps/api/src/events/events.module.ts` (import ChainsModule / ChainRunnerService)
- `apps/api/src/chains/chains.module.ts` (export ChainRunnerService if not already)
- web `RunEventsProvider` / event-scope handling (add `chain-runs`) — locate under
  `apps/web` (RunEventsProvider is referenced in app/providers.tsx)
- `.playwright-mcp/*` (git untrack via `--cached`)

## Verification

- `pnpm check:types` clean; scoped lint.
- `pnpm exec vitest run apps/api/src/events apps/api/src/chains` green.
- `git status` confirms `.playwright-mcp/` files removed from the index; `.gitignore` keeps them
  out going forward.
- Manual reasoning: a chain run transition now produces a `{ scope: "chain-runs", runId, status }`
  SSE frame; the client tolerates/uses it without error.

## Constraints

- The SSE addition must be purely additive (unknown-scope tolerance preserved); do not change the
  agent/pipeline/goal frames. No `any`. Keep the diff tight. Don't implement the deferred
  architectural items.
