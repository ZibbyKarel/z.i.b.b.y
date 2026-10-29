# Run extensibility — Commands, MCP, Hooks, Project env/secrets

Four catalogs the operator uses from the UI to extend the environment of every
`claude -p` run. Shared pattern: **files are the source of truth** (a file-backed
store), and enabled entries are injected into the run at spawn time. The command
builder is `apps/api/src/runner/claude-run-command.service.ts`; the spawn engine
is `runner-core.ts`.

## Commands (`/api/commands`)

Custom Claude Code slash commands (`/<id>`) that downloaded skills/agents rely on
(e.g. `plan-orchestrate` references `/orchestrate`). Claude Code discovers
commands only from files, and runs spawn with `--setting-sources ""`, so ZIBBY
ships them as a plugin.

- **Store:** `commands.storage.service.ts` (Markdown `<id>.md`, kebab-case
  frontmatter `description`/`argument-hint`/`allowed-tools`/`model`/
  `disable-model-invocation` + body).
- **Injection:** `command-materializer.service.ts` writes enabled commands as a
  ZIBBY-owned plugin at `<run sandbox>/zibby-commands/` (manifest
  `.claude-plugin/plugin.json`, name `zibby`), passed via `--plugin-dir`. They
  appear as `/zibby:<id>` and the Skill tool resolves a bare `/<id>`. Nothing is
  written into the client worktree. Per-run isolation. Fail-open.
- **allowedTools:** `Skill` is in the base allow-list so the model can invoke
  materialized commands. Confirmed in `claude-run-command.service.ts` —
  `Skill` (not `SlashCommand`) is the tool name the model uses to call a
  filesystem command, alongside its normal role of invoking catalog skills.

## MCP servers (`/api/mcp-servers`)

Connected MCP servers injected into **every** run (except `grantOnly` servers, which ride only runs that grant them; the root `.mcp.json` is NOT
wired in).

- **Store:** `mcp.storage.service.ts` (`{ id, type: stdio|http|sse, command?/args?/url?/headers?, enabled }`)
  - gitignored `mcp-credentials.store.ts` (write-only `{ env?, headers?, authToken? }`,
    never read back or logged; the entity carries only the `hasCredentials` flag).
- **Injection:** `buildMcpConfig()` merges enabled servers + secrets into
  `--mcp-config <json>`. A `grantOnly: true` server is injected only into runs whose
  `tools`/`toolGrants` reference it (heavy servers such as Playwright).
- **allowedTools:** each enabled server adds `mcp__<id>__*` (otherwise `dontAsk`
  would deny the MCP tool call; the bare `mcp__<id>` does not match).

## Hooks (`/api/hooks`)

Custom Claude Code lifecycle hooks (PreToolUse/PostToolUse/Stop/…) merged into
`--settings`.

- **Store:** `hooks.storage.service.ts` (JSON `{ id, event, matcher?, command, timeout?, enabled }`).
- **Merge (Law 1 — approval-first is structural):** `buildSettings()` always
  inserts the locked approval hook **first** in `PreToolUse`, with a `Bash|Task`
  matcher (Fáze 2a: `Task` is delegation via the Agent tool — every handoff goes
  through the same intent-request protocol as destructive Bash, classified as
  `agent.delegate`). A custom hook with `event=PreToolUse` and a matcher on
  `Bash`/`Task` (or an empty matcher) is **dropped**. No stored hook can bypass
  or weaken the gate this way. Other events are added normally. Fail-open onto
  approval-only.

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

## Registry bindings (`/api/registries/bindings`) — ZB-11

Read-only, derived "Bound in" data for the `/system/registries/[kind]` screens
(skills, mcp, hooks, commands) and the department detail tabs (O-09 — no new FK,
no stored binding). `RegistriesService` computes, per kind, a `Record<id,
DepartmentId[]>`:

- **mcp:** read off each active agent's `tools`/`optionalTools` — an entry equal
  to the server id, `mcp__<id>`, or prefixed `mcp__<id>__` counts as a grant; the
  bound departments are the distinct `department` of every such agent.
- **skills / hooks / commands:** these three carry no per-agent reference at
  all — every enabled one is materialized into **every** run (see the Commands
  and Hooks sections above, and `claude-run-command.service.ts`'s `buildCatalog`
  for skills). Their honestly-derived binding is therefore "every department with
  at least one active employee", not a per-item subset.

A single cross-cutting endpoint (rather than a computed field added to each of
the four entity schemas) — see `registry-bindings.schema.ts`'s docblock.

## External skills (`/api/skills/external`)

Skills installed from a public GitHub repo (`apps/api/src/external-skills/`).
Only `https://github.com/<owner>/<repo>` URLs are accepted (optionally `.git` or
`/tree/<ref>/<path>`). A `/tree/<ref>` URL clones that branch/tag (stored as
`source.ref`) and scans only `<path>`; a raw commit sha is rejected by git → 502.

- `POST /api/skills/external/scan` `{ url }` — shallow-clones the repo into a temp
  dir (always deleted), lists every folder holding a `SKILL.md` with
  `conflict: true` when its id is already taken.
- `POST /api/skills/external` `{ url, paths }` — installs the chosen folders into
  `data/skills-external/<id>/` (no `.git`, symlinks never copied or followed) and
  records provenance (`owner`, `repo`, `path`, pinned `sha`, folder `treeSha`) in
  `data/external-skills.json`.
- Errors: 400 bad URL, 409 id taken (own or external), 422 no `SKILL.md` / unknown
  path, 502 git failed.

- `POST /api/skills/external/:id/sync` — checks one skill: `git ls-remote` of its
  repo/ref sets `checkedAt` + `latestSha`; same sha → done. Otherwise it clones and
  compares the folder's tree: same tree → only `sha` moves; new tree → the folder
  is replaced (temp + rename), `sha`/`treeSha`/`updatedAt` move and a
  `skill-updated` activity entry is recorded (shown in the briefing's "did for
  you"). Folder gone upstream or a failed copy → previous copy kept, 200 with
  `source.lastError` (`"skill folder missing upstream"` / `"copy failed: …"`).
  Unreachable repo → copy kept, `lastError` set, 502. 404 = not an installed
  external skill. `latestSha !== sha` means an update is pending.
- `POST /api/skills/external/sync` — the same for every external skill, one clone
  per repo + ref; a failing repo never stops the rest. Returns
  `{ checked, updated: id[], failed: id[] }`. A record whose stored URL no longer
  parses is listed in `failed` with `lastError`.
- The system automation `external-deps-update` ("Aktualizace externích
  závislostí", target `external-skills-sync`, cron `0 4 * * 1`, enabled) runs the
  sync-all weekly; its ref is `external-skills:<updated count>`.

`GET /api/skills` / `GET /api/skills/:id` return external skills next to own
ones, with a `source` field. They are read-only: `PATCH`/`DELETE` → 409. A broken
external folder is logged and left out of the list. `SKILL.md` frontmatter is
parsed YAML-only (gray-matter's JS engine is disabled — repo content is untrusted).

## Data directories / env knobs

| Store           | Dir (env override)                                                                                   | Git        |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---------- |
| Commands        | `data/commands` (`COMMANDS_DIR`)                                                                     | committed  |
| MCP servers     | `data/mcp-servers` (`MCP_DIR`)                                                                       | committed  |
| MCP credentials | `data/mcp-credentials` (`MCP_CREDENTIALS_DIR`)                                                       | gitignored |
| Hooks           | `data/hooks` (`HOOKS_DIR`)                                                                           | committed  |
| Project secrets | `data/project-secrets` (`PROJECT_SECRETS_DIR`)                                                       | gitignored |
| External skills | `data/skills-external` (`EXTERNAL_SKILLS_DIR`), `data/external-skills.json` (`EXTERNAL_SKILLS_FILE`) | committed  |
