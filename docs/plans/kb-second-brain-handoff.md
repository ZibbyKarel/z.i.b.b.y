# KB / second brain — handoff

Goal (operator, 2026-10-09): adopt LLM-wiki practices (gist jakubkulhan/85686bab…), restore the
"second brain" node graph with a switch between ZibbyCorp vault and a team KB, restore features
lost since tag `v3.0`, start actually using project/team KBs. Decisions: `kb-second-brain-decisions.md`.

## Work items

| # | Item | Owner | Status |
|---|---|---|---|
| W1 | Restore node graph + source switch (vault / team KB) — contract, api, web | sonnet agent + orchestrator review | done — `/knowledge/graph`, `?source=vault\|team:<id>`, `GET /api/teams/:id/kb/graph`; verified in the browser |
| W2 | Diff v3.0 → HEAD for lost knowledge/memory features | sonnet agent (read-only) | done — only graph + filterGraph lost, tier filter degraded; import/distill/triage/self-knowledge all still wired |
| W3 | `recall_memory` domain/project isolation | orchestrator | done — run-facing entity MCP recall = global work notes only; chat stays unscoped (F8) |
| W4 | Vault lint automation + `updated` stamp + vault change log | sonnet agent + orchestrator review | done — log append made fail-open; web automation card handles `vault-lint` |
| W5 | Team KB grounding (team-context + INDEX) | sonnet agent + orchestrator review | done — reviewed; added whole-or-nothing budget rule so the envelope is never cut |
| W6 | Doc drift fixes (`docs/api/memory.md`, `memory.module.ts` comment, `TeamKnowledgeBasePanel` docblock, NoteType vision/project, tag cap) | sonnet agent | done |
| W7 | Team-KB ingest workflow → PR to team KB repo | sonnet agent | done — `team-kb-ingest` workflow + `kb-librarian` agent; KB repo registered as project `devrel-knowledgebase` (teamId devrel). Not run end-to-end yet |
| W8 | Restore features found by W2 (tier filter chips folded into W1) | sonnet agent (W1) | done — tier chips back on the vault graph |

## Resume notes

- Commits go straight to `main` with explicit paths; prefix `PATH="$PWD/node_modules/.bin:$PATH"`,
  regenerate `pnpm self-knowledge:generate` and add the note before committing.

## Next (not done in this run)

- Run `team-kb-ingest` on `devrel-knowledgebase` once (first commit/stash the KB's dirty
  `_meta/log.md`; `gh` must be authed for `shoptet/devrel-knowledgebase`). Review the PR.
- KB `.vtt` files sit in `meetings/` while the KB log says `raw/` — team decision.
- `output/zibby-memory/` in the devrel KB is the shadow output of a lost 2026-09-03
  distiller (D8: not recreated). Safe to delete once the wiki is compiled; it still shows
  in the team graph/search.
- Run-facing `recall_memory` could include the run's own project notes by resolving
  `X-Zibby-Run-Id` → project (see `ponytail:` note in `recall.helper.ts`).
- Search hits with snippets in the vault nav (W2 rank 3) — optional.
