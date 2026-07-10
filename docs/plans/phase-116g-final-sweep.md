# Phase 116g — Final sweep

Parent: `phase-116-automations-cleanup-and-commandline-dialog.md`. Runs last.

## Goal
Land the feature clean: i18n complete in both locales, docs current, whole suite green, graph fresh.

## Checklist
1. **i18n parity** — `apps/web/i18n/messages/cs.json` and `en.json` have identical key sets for
   everything touched (automations.*, settings.automations.*). No orphaned keys
   (`targetDiscovery`, `discoveryNote`, `targetResearchDigest`, `targetAppIdeas`, `systemBadge`
   removed; `scheduleAction`, `commandLinePlaceholder`, `taskTargetLabel`, `settings.automations.desc.*`
   present). Run any existing i18n-consistency check/test.
2. **Docs** — `docs/api/automations.md` reflects the final target set incl. the new `task` target
   and the removals; `docs/api/discovery.md` (triage gone, proposals stay); `docs/api/activity.md`
   (`app-ideas-generated` gone); `docs/api/ideas.md` deleted; `docs/api/research.md` still accurate
   (service kept, automation gone). Cross-check `docs/api/overview.md` for stale references.
3. **Dead-code sweep** — `knip` (or grep) for orphans left by the ideas/discovery-triage removal;
   remove any now-unused exports/imports/testids (e.g. `AutomationFormTestId.Submit`,
   `AutomationCardTestId.SystemBadge` if fully gone).
4. **Full green**:
   ```
   rtk pnpm check:lint
   rtk pnpm check:types
   rtk pnpm test
   ```
   All green (modulo the two pre-existing flaky/regressed suites noted in
   docs/reviews/2026-07-10-project-audit-and-chat-ui.md, if still red on main — confirm they are
   unrelated to this work; do not let this feature add new failures).
5. **graphify** — `graphify update .` to refresh the AST graph after the structural changes.
6. Mark all Phase 116 sub-tasks complete and note any deferred follow-ups (e.g. pipeline/chain
   attachment seam) in the plan.

## Verify
The three checks above pass and `git status` shows only intended changes.
