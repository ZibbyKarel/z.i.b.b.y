# Run extensibility — Commands, MCP, Hooks, Project env/secrets

Four catalogs the operator uses from the UI to extend the environment of every
`claude -p` run. Shared pattern: **files are the source of truth** (a file-backed
store), and enabled entries are injected into the run at spawn time. The command
builder is `apps/api/src/runner/claude-run-command.service.ts`; the spawn engine
is `runner-core.ts`.

## Commands (`/api/commands`)

Custom Claude Code slash commands (`/<id>`) that downloaded skills/agents rely on
(e.g. `plan-orchestrate` references `/orchestrate`). Claude Code discovers
commands **only from files** (`.claude/commands/*.md` in the cwd) — there is no
`--commands` flag.

- **Store:** `commands.storage.service.ts` (Markdown `<id>.md`, kebab-case
  frontmatter `description`/`argument-hint`/`allowed-tools`/`model`/
  `disable-model-invocation` + body).
- **Injection:** `command-materializer.service.ts` writes enabled commands into
  `<spawnCwd>/.claude/commands/<id>.md` (the worktree for a project run, else the
  sandbox). Per-run isolation (each run has its own cwd). Fail-open. Pollution
  guard: an existing file (a project's or user's own command) **wins** — the
  materialized copy is added to `.git/info/exclude` so the agent can't commit it.
- **allowedTools:** `Skill` is in the base allow-list so the model can invoke
  materialized commands. Confirmed in `claude-run-command.service.ts` —
  `Skill` (not `SlashCommand`) is the tool name the model uses to call a
  filesystem command, alongside its normal role of invoking catalog skills.

## MCP servers (`/api/mcp-servers`)

Connected MCP servers injected into **every** run (the root `.mcp.json` is NOT
wired in).

- **Store:** `mcp.storage.service.ts` (`{ id, type: stdio|http|sse, command?/args?/url?/headers?, enabled }`)
  - gitignored `mcp-credentials.store.ts` (write-only `{ env?, headers?, authToken? }`,
    never read back or logged; the entity carries only the `hasCredentials` flag).
- **Injection:** `buildMcpConfig()` merges enabled servers + secrets into
  `--mcp-config <json>`.
- **allowedTools:** each enabled server adds `mcp__<id>__*` (otherwise `dontAsk`
  would deny the MCP tool call; the bare `mcp__<id>` does not match).

## Hooks (`/api/hooks`)

Custom Claude Code lifecycle hooks (PreToolUse/PostToolUse/Stop/…) merged into
`--settings`.

- **Store:** `hooks.storage.service.ts` (JSON `{ id, event, matcher?, command, timeout?, enabled }`).
- **Merge (Law 1 — approval-first is structural):** `buildSettings()` always
  inserts the locked approval hook **first** in `PreToolUse`; a custom hook with
  `event=PreToolUse` and a matcher on `Bash` (or an empty matcher) is **dropped**.
  No stored hook can bypass or weaken the gate this way. Other events are added
  normally. Fail-open onto approval-only.

## Per-project env/secrets (`/api/projects/:id/secrets`)

Env vars and secrets injected into a given project's runs (API keys, DB URLs).

- **Non-secret `env`** lives on the committed entity (`project.env`); **secrets**
  live in the gitignored `project-secrets.store.ts` (write-only, the entity
  carries only `hasSecrets`).
- **Injection:** the runner merges `project.env` + secrets (secrets win) into
  `RunSpec.env`; `runner-core.ts` spreads it into the child's `env` on both spawn
  and resume. ZIBBY's own keys (`ZIBBY_INTENT_DIR`) are applied **after** project
  env, so a project can't override them. Secrets are never logged (the core logs
  `command`/`cwd`, never `env`).

## Data directories / env knobs

| Store            | Dir (env override)                             | Git        |
| ----------------- | ----------------------------------------------- | ---------- |
| Commands          | `data/commands` (`COMMANDS_DIR`)                | committed  |
| MCP servers       | `data/mcp-servers` (`MCP_DIR`)                   | committed  |
| MCP credentials   | `data/mcp-credentials` (`MCP_CREDENTIALS_DIR`)   | gitignored |
| Hooks             | `data/hooks` (`HOOKS_DIR`)                       | committed  |
| Project secrets   | `data/project-secrets` (`PROJECT_SECRETS_DIR`)   | gitignored |
