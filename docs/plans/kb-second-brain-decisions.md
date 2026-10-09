# KB / second brain — decision log

Run started 2026-10-09 12:56 CEST, hard stop 14:00 (operator: pause if not done).

| # | Decision | Why |
|---|---|---|
| D1 | "tag verze 2.0" = git tag `v3.0` (2026-09-24). No `v2.0` tag exists; `v3.0` is the last tag before the ZibbyCorp shell migration (`2344ab8bb`, 2026-09-25) that deleted `features/memory/components/MemoryGraph.tsx` + `filterGraph.ts`. | Only tag that contains the old memory UI. |
| D2 | Work on `main`, no PRs/worktrees; agents never commit, the orchestrator commits reviewed chunks with explicit paths. | Operator rule since 2026-10-02; parallel agents share one checkout. |
| D3 | Graph source switch = ZibbyCorp vault OR one team KB (read-only, in place). Team KB graph is built by `KbReaderService` from wikilinks; no copy into the vault. | Team KB `readOnly: true` is structural (Law 1). |
| D4 | Vault lint is report-only (a note `knowledge/vault-lint.md`), never auto-fixes. | Gist's lint triad; Tier 1 — act silently, no destructive edits. |
| D5 | `updated` frontmatter is stamped by `VaultService` writes; vault change log appended to `knowledge/vault-log.md`. | Staleness + Law 5 (answerable from the record). |
| D6 | Team KB grounding: inject the run's team `team-context.md` + `wiki/INDEX.md` (capped, enveloped) into the grounding block. | KB was reachable only via an MCP tool the model may never call. |
| D7 | `recall_memory` from chat honours `visibleInDomain` (work by default) — project filter applies where a project is known. | Spec §3.2 isolation gap. |
| D8 | Team-KB ingest (sources → `wiki/`) ships as a workflow whose artifact is a PR to the team KB repo (Tier 2), never a push. The lost 2026-09-03 `output/zibby-memory` distiller is NOT recreated. | Law 3; writing the team's own wiki beats a shadow copy. |
