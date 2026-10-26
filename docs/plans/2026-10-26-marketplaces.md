# Marketplaces — connect Claude Code plugin marketplaces to ZIBBY

Date: 2026-10-26. Branch `feat/marketplaces` (worktree `worktrees/marketplaces`).

## Intent

The operator keeps their own Claude Code marketplace (`https://github.com/ZibbyKarel/skills`,
checked out locally at `/Users/zibar/Workspace/zibby-skills`). They want to:

1. Open AI → Marketplaces, click "Connect marketplace", give a git repo (or a local path).
2. See the marketplace detail: its plugins and what each contains (skills, agents, commands,
   hooks, MCP servers). Install one plugin or all of them. **Installed = available in their normal
   terminal `claude` sessions too** (user scope in `~/.claude`), and in every ZIBBY run.
3. "Update" on the detail pulls the newest versions of what is installed.
4. **Dev mode** (chosen when connecting): instead of the copy that `claude plugin install` puts in
   `~/.claude/plugins/cache/...`, the installed plugin is a **symlink into a git checkout**, so
   edits to the repo are live with no version bump. A local path is used as-is (their own
   `zibby-skills` checkout); a git URL is **cloned** by ZIBBY into its clone dir first.
5. Uninstall a plugin, or remove the whole marketplace.
6. In the Bridge "Quick actions" widget the task text gets the `/` skill autocomplete, which also
   offers installed marketplace skills (`/zibby:standup-post`). A "Standup" button with text
   `Použij skill /zibby:standup-post` then runs it on click.

## Decisions (builder: these are settled)

- **Install unit = plugin.** Claude Code installs plugins, not single skills; the detail page lists
  each plugin's components read-only and offers Install / Uninstall per plugin plus "Install all".
- **Claude CLI is the mechanism** (`claude plugin marketplace add|list|update|remove`,
  `claude plugin install|uninstall|update`, always `--scope user`). Never pass `-y`/`--accept-command`
  (a marketplace-declared command must not be auto-accepted — the install fails and the error is
  shown). Installed state is read from `~/.claude/plugins/installed_plugins.json` (v2:
  `{ version: 2, plugins: { "<plugin>@<marketplace>": [{ scope, installPath, version, ... }] } }`),
  only the `scope: "user"` entry counts. Dir overridable via env `CLAUDE_PLUGINS_DIR`
  (default `~/.claude/plugins`).
- **ZIBBY's own record** is `data/marketplaces.json` (via `dataDir("marketplaces.json")`, env
  override `MARKETPLACES_FILE`): `[{ id, source, devMode, localPath, managedClone, addedAt }]`.
  `id` = the marketplace `name` from its `.claude-plugin/marketplace.json`. Only marketplaces in
  this record are managed by ZIBBY; other marketplaces the operator has in Claude are untouched.
- **Catalog (contents) is read from disk**, not the CLI: `<marketplaceDir>/.claude-plugin/marketplace.json`
  → `plugins[]` (`name`, `source` — a relative path string; non-string sources such as
  `{source:"github",...}` are listed with empty components), then per plugin dir:
  `skills/*/SKILL.md` frontmatter (`name`, `description`), `agents/*.md` and `commands/*.md`
  frontmatter, `hooks/hooks.json` present → hooks, `.mcp.json` / `plugin.json mcpServers` keys →
  MCP server names. `marketplaceDir` = `localPath` (dev) or the `installLocation` from
  `claude plugin marketplace list --json`.
- **Adding**
  - normal: `claude plugin marketplace add <source> --scope user`; then find the entry in
    `claude plugin marketplace list --json` (by matching `repo`/`url`/`path` against the source,
    else by a name that is new versus a pre-add snapshot).
  - dev, local absolute path: must exist and contain `.claude-plugin/marketplace.json`;
    `localPath = source`, `managedClone = false`.
  - dev, git URL (`isValidGitRemote` from contracts / `shared/git-exec.ts`): `git clone` into
    `<cloneDir>/<repo-basename>` (env `MARKETPLACES_CLONE_DIR`, default `~/.zibby/marketplaces`),
    `managedClone = true`. Then `claude plugin marketplace add <localPath> --scope user`.
  - If Claude already knows a marketplace with that name and the same source/path, **adopt** it
    (no error) — the operator's `zibby-skills` is already registered and installed.
  - 409 if ZIBBY's record already has the id.
- **Dev link**: after install (or when already installed), replace the user-scope `installPath`
  directory with a symlink to the plugin's source dir inside `localPath`. Guard: only ever remove a
  path that resolves inside `<CLAUDE_PLUGINS_DIR>/cache/`. Before `claude plugin uninstall` of a
  dev plugin, unlink the symlink and put an empty dir there, so the CLI can never delete through
  the link into the operator's repo. A plugin reports `linked: true` when its installPath is a
  symlink to the expected dir.
- **Update**: normal → `claude plugin marketplace update <id>` then `claude plugin update
  <plugin>@<id> --scope user` per installed plugin. Dev → `git pull --ff-only` only when
  `managedClone` (never touch the operator's own checkout), then `claude plugin marketplace update
  <id>`, then re-ensure links for installed plugins.
- **Remove marketplace**: uninstall each installed plugin (dev-safe as above), `claude plugin
  marketplace remove <id>`, drop the record; when `managedClone`, delete the clone dir (guard: must
  resolve inside the clone dir root). The operator's own checkout is never deleted.
- **ZIBBY runs** (`apps/api/src/runner/claude-run-command.service.ts` `buildClaudeCommand`): runs
  spawn with `--setting-sources ""`, so append `--plugin-dir <installPath>` for every installed
  plugin of every ZIBBY-managed marketplace (deduped against `opts.pluginDirs`). A failure to read
  them yields none (fail-open, never blocks a run) — same posture as MCP/hooks there.
- **Skill autocomplete source**: `GET /api/marketplace-skills` → installed plugins' skills as
  `{ id: "<plugin>:<skill>", name: "<plugin>:<skill>", desc?, marketplace, plugin }`.
- CLI calls go through one small injectable runner (`execFile`, env from `agentBaseEnv`, timeout
  ~120s for network ops) so tests substitute a fake. Errors from the CLI surface as 4xx/5xx with
  the CLI's stderr message (trimmed), never swallowed.

## Contract (`libs/contracts/src/marketplaces/`)

```
MarketplaceSchema        { id, source, devMode, localPath?, managedClone, addedAt }
MarketplaceComponentSchema { name, description? }
MarketplacePluginSchema  { name, description?, version?, installed, installedVersion?, linked,
                           skills[], agents[], commands[] (components), hooks: boolean, mcpServers: string[] }
MarketplaceDetailSchema  Marketplace & { description?, plugins: MarketplacePlugin[] }
AddMarketplaceInputSchema { source: string(trim,min1), devMode: boolean }
MarketplaceSkillSchema   { id, name, desc?, marketplace, plugin }

GET    /api/marketplaces                               → Marketplace[] (+ pluginCount, installedCount)
POST   /api/marketplaces                body Add       → 201 MarketplaceDetail | 400 | 409
GET    /api/marketplaces/:id                           → MarketplaceDetail | 404
DELETE /api/marketplaces/:id                           → { id } | 404
POST   /api/marketplaces/:id/update                    → MarketplaceDetail
POST   /api/marketplaces/:id/install-all               → MarketplaceDetail
POST   /api/marketplaces/:id/plugins/:plugin/install   → MarketplaceDetail
DELETE /api/marketplaces/:id/plugins/:plugin           → MarketplaceDetail
GET    /api/marketplace-skills                         → MarketplaceSkill[]
```

## Web

- Nav: `workforce` (label "AI") gets tab `marketplaces` → `/workforce/marketplaces`; detail
  `/workforce/marketplaces/[id]`. i18n cs + en.
- List: one card per marketplace (name, source, dev badge, installed/total); card click → detail.
  Top-right "Connect marketplace" opens a create dialog: source field + dev-mode switch with a
  one-line hint (local path used as-is, git URL cloned).
- Detail: header (name, source, mode); top-right Update, Install all, Remove (confirm dialog).
  One panel per plugin: name, version, installed/linked state, Install / Uninstall, and its
  skills / agents / commands / hooks / MCP lists.
- `CommandLine` `/` picker: skills = ZIBBY skills ∪ marketplace skills.
- `QuickActionsWidget` add form: the task text field becomes a `CommandLine`
  (`chrome={false}`, `allowSkillMentions`, no attach, no own submit button) so `/` works there.

## Out of scope

Per-skill install, project/local scope, private-repo auth beyond what `git`/`claude` already have,
auto-update on a schedule.
