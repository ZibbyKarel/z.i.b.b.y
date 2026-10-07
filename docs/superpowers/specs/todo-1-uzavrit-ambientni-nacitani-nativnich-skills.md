# Close ambient loading of native skills into runs

## TODO item (verbatim)

Uzavřít ambientní načítání nativních skills do běhů: buildClaudeCommand (apps/api/src/runner/claude-run-command.service.ts:427-508) nepředává --setting-sources, takže claude CLI defaultně načte user+project+local scope — ověřeno empiricky, že každý zibby běh (i haiku one-shoty v triage/briefing/task-namer/memory-distiller) dostane všech 14 superpowers:\* skills, ~40 skill descriptions a SessionStart injekci 'You have superpowers' (--settings se merguje, nepřepisuje user settings; Skill je vždy v --allowedTools, :594). Tři problémy: (1) kolize kontraktů — superpowers preambule nutí skill-first/brainstorming s dotazy na člověka, OPERATING_CONTRACT (:148-166) říká headless dontAsk bez člověka; (2) porušení Zákona 2/5 — chování běhu závisí na nepinnutém ~/.claude/plugins stavu, který repo nedeklaruje a nikde nezůstává trace; (3) cwd je worktree cizího (klientského) repa, takže jeho .claude/settings.json hooky a skills se načtou do autonomního dontAsk běhu. Pozn.: chat už `--setting-sources ""` posílá (chat-session.service.ts), runner a haiku one-shoty ne. Fix: přidat explicitní --setting-sources "" (nebo vědomě project) do buildClaudeCommand i do haiku one-shotů, a co chceme zpět přidat deklarativně přes nové per-agent/per-project pole plugins[] -> --plugin-dir na vendorovanou pinnutou kopii (ověřeno: --setting-sources project skryje superpowers, + --plugin-dir ji deterministicky vrátí). Skilly neforkovat do ZIBBY Skill entity — buildCatalog je skládá do --agents s capem MAX_CATALOG_AGENTS = 16 sdíleným s core agenty, 14 superpowers skills by cap přeteklo; forkovat max brainstorming/using-superpowers kvůli interaktivním předpokladům, ostatní pinnout na verzi. Do katalogu si slot zaslouží test-driven-development, systematic-debugging, verification-before-completion (Kodér loop); brainstorming je v dontAsk běhu aktivně škodlivý

Conductor scope: must-have is explicit `--setting-sources ""` on the runner's
`buildClaudeCommand` AND every one-shot spawn, with tests pinning the flag. Second
deliverable: a declarative `plugins[]` field on agent + project (contract-first) wired
to `--plugin-dir`. No vendoring of any third-party plugin tree. Document in docs/api.

## Context found in the codebase

Spawn sites of a `claude` session:

- `apps/api/src/runner/claude-run-command.service.ts` `buildClaudeCommand` — every agent
  run and workflow agent stage (callers: `agents/agent-runner.service.ts`,
  `workflows/workflow-runner.service.ts`).
- `apps/api/src/shared/spawn-claude-cli.ts` `spawnClaudeCli` — the single shared body for
  every one-shot: router, task-namer, briefer, memory distiller, triager,
  review-comment distiller, reply-draft researcher. One fix there covers all of them.
- `libs/product-factory/src/providers/haiku.ts` — the vision-QA haiku one-shot.
- `apps/api/src/chat/chat-session.service.ts` — already passes `--setting-sources ""`.
- `claude-preflight.service.ts` runs only `--version` / `auth status` (no session).

Empirical probe (claude CLI, 2026-10-07, a temp dir with `.claude/commands`,
`.claude/skills`, `CLAUDE.md`):

| flags                                                                       | user plugins (superpowers) | cwd `.claude/commands` + skills | cwd `CLAUDE.md` |
| --------------------------------------------------------------------------- | -------------------------- | ------------------------------- | --------------- |
| (none)                                                                      | loaded (15 entries)        | loaded                          | loaded          |
| `--setting-sources project`                                                 | hidden                     | loaded                          | loaded          |
| `--setting-sources ""`                                                      | hidden                     | hidden                          | hidden          |
| `""` + `--add-dir <cwd>` + `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` | hidden                     | hidden                          | loaded          |

Also verified under `--setting-sources ""`: the `--settings` PreToolUse approval hook
still fires (the gate floor is intact); `--plugin-dir <dir>` loads that plugin's
commands/skills, namespaced `<plugin>:<name>`, and the Skill tool resolves an
unqualified `/name` to it; a missing `--plugin-dir` path is silently ignored.

Consequences for the design:

- `--setting-sources ""` alone would silently break `CommandMaterializerService`,
  which writes ZIBBY's custom commands into `<spawnCwd>/.claude/commands/` (only
  discovered via the project setting source). Fix: materialize them as a ZIBBY-owned
  plugin in the run sandbox and pass it by `--plugin-dir` — which also stops writing
  into the client worktree.
- It would also drop the client repo's `CLAUDE.md` that project runs intentionally load
  (runner.md: "spawns in the project checkout so its own CLAUDE.md/.claude context
  loads"). Keep `CLAUDE.md` (passive context) via `--add-dir <spawnCwd>` +
  `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`; the repo's hooks/skills/settings
  stay out.
- `MAX_CATALOG_AGENTS` / skill catalog unchanged; adding TDD/debugging skills to the
  catalog is a follow-up, not this item.
