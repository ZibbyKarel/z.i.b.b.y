# Rozšiřitelnost runů — Commands, MCP, Hooks, Project env/secrets

Čtyři katalogy, kterými operátor z UI rozšiřuje prostředí každého `claude -p` runu.
Společný vzor: **soubory jsou zdroj pravdy** (file-backed store), enabled položky se
vkládají do runu při spawnu. Command builder je `apps/api/src/runner/claude-run-command.service.ts`,
spawn engine `runner-core.ts`.

## Commands (`/api/commands`)

Custom Claude Code slash-commandy (`/<id>`), na kterých stojí stažené skilly/agenti
(např. `plan-orchestrate` odkazuje `/orchestrate`). Claude Code objevuje commandy
**jen ze souborů** (`.claude/commands/*.md` v cwd) — neexistuje `--commands` flag.

- **Store:** `commands.storage.service.ts` (Markdown `<id>.md`, kebab-case frontmatter
  `description`/`argument-hint`/`allowed-tools`/`model`/`disable-model-invocation` + body).
- **Injektáž:** `command-materializer.service.ts` zapíše enabled commandy do
  `<spawnCwd>/.claude/commands/<id>.md` (worktree u projektového runu, jinak sandbox).
  Per-run izolace (každý run má vlastní cwd). Fail-open. Pollution guard: existující
  soubor (projektový/uživatelský command) **vyhrává**, materializovaný se přidá do
  `.git/info/exclude`, aby ho agent nemohl commitnout.
- **allowedTools:** `Skill` je v base setu, aby model materializované commandy mohl volat.
- ⚠️ **Ověřit při nasazení:** jméno nástroje, kterým model volá filesystem command
  (`Skill` vs `SlashCommand`). Plně autonomní mid-run vyvolání je spolehlivé jen pro
  operátorem/`-p` spuštěné a generativní skilly (slash expanze je input-time).

## MCP servery (`/api/mcp-servers`)

Připojené MCP servery injektované do **každého** runu (root `.mcp.json` NENÍ napojen).

- **Store:** `mcp.storage.service.ts` (`{ id, type: stdio|http|sse, command?/args?/url?/headers?, enabled }`)
  + gitignored `mcp-credentials.store.ts` (write-only `{ env?, headers?, authToken? }`,
  nikdy se nečte ani neloguje; entity nese jen `hasSecrets`-ekvivalent `hasCredentials`).
- **Injektáž:** `buildMcpConfig()` sloučí enabled servery + secrety → `--mcp-config <json>`.
- **allowedTools:** pro každý enabled server se přidá `mcp__<id>__*` (jinak by `dontAsk`
  volání MCP nástroje zamítlo; bare `mcp__<id>` nematchuje).

## Hooks (`/api/hooks`)

Custom Claude Code lifecycle hooks (PreToolUse/PostToolUse/Stop/…) slité do `--settings`.

- **Store:** `hooks.storage.service.ts` (JSON `{ id, event, matcher?, command, timeout?, enabled }`).
- **Slití (Zákon 1 — approval-first je strukturální):** `buildSettings()` vždy vloží
  zamčený approval hook jako **první** v `PreToolUse`; custom hook s `event=PreToolUse`
  a matcherem na `Bash` (nebo prázdným) se **zahodí**. Žádný uložený hook tak nemůže
  obejít/oslabit gate. Ostatní eventy se přidají normálně. Fail-open na approval-only.

## Per-projekt env/secrets (`/api/projects/:id/secrets`)

Env proměnné a secrety vlité do runů daného projektu (API klíče, DB URL).

- **Non-secret `env`** žije na committed entitě (`project.env`); **secrety** v gitignored
  `project-secrets.store.ts` (write-only, entity nese jen `hasSecrets`).
- **Injektáž:** runner sloučí `project.env` + secrety (secrety vyhrávají) do
  `RunSpec.env`; `runner-core.ts` je rozprostře do `env` dítěte při spawnu i resume.
  ZIBBY-vlastní klíče (`ZIBBY_INTENT_DIR`) se aplikují **až po** project env — projekt
  je nemůže přepsat. Secrety se nikdy nelogují (core loguje `command`/`cwd`, ne `env`).

## Datové adresáře / env knoby

| Store | Dir (env override) | Git |
|-------|--------------------|-----|
| Commands | `data/commands` (`COMMANDS_DIR`) | committed |
| MCP servery | `data/mcp-servers` (`MCP_DIR`) | committed |
| MCP secrety | `data/mcp-credentials` (`MCP_CREDENTIALS_DIR`) | gitignored |
| Hooks | `data/hooks` (`HOOKS_DIR`) | committed |
| Projekt secrety | `data/project-secrets` (`PROJECT_SECRETS_DIR`) | gitignored |
