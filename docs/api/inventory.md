# Machine inventory — Claude Code MCP / skills / plugins (TODO 13)

A read-only view of the operator's Claude Code installation on the machine ZIBBY
runs on, plus a one-click install of ZIBBY library skills into it. ZIBBY's own
registries (`/system/registries/*`) list what ZIBBY injects into its runs; this
lists what the machine itself has.

Contract: `libs/contracts/src/inventory/` (`inventoryContract`, mounted as
`appContract.inventory`). Implementation: `apps/api/src/inventory/`.

## Endpoints

| Method | Path                                     | Result                                                 |
| ------ | ---------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/inventory`                         | `200 MachineInventory`                                 |
| POST   | `/api/inventory/skills/:skillId/install` | `200 { skillId, status: "installed" }` / `404` / `409` |

`404`: unknown (or invalid-id) library skill. `409`: a skill of that name already
exists on the machine and is not ZIBBY-managed.

## Where it reads

- Claude dir: `$CLAUDE_CONFIG_DIR`, else `~/.claude`. User config: `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json`.
  Both come from one injectable provider (`CLAUDE_LOCATIONS`), so tests point it at temp dirs.
- Repo root: the ZIBBY install root (`installRoot()`), for the project `.mcp.json` and the `local` scope.
- MCP: `user` = `.claude.json` `mcpServers`; `local` = `.claude.json` `projects[<repo root>].mcpServers`;
  `project` = `<repo root>/.mcp.json`; `plugin` = `<installPath>/.mcp.json` of an installed plugin.
- Skills: `<claudeDir>/skills/<dir>/SKILL.md` (symlinked dirs followed) and `<installPath>/skills/<dir>/SKILL.md` of plugins.
- Plugins: `<claudeDir>/plugins/installed_plugins.json` (v2, first install per id); `enabled` from `settings.json` `enabledPlugins`.

Every source is fail-soft: a missing, unreadable or corrupt file yields an empty list for that
source, never a 500; one broken plugin does not hide the others.

## Secrets

MCP `args`, `env` and `headers` are never read into a response, log or activity entry. An MCP
server exposes only `name`, `scope`, `transport` and a sanitised `target`: the command basename
(stdio) or the URL origin without userinfo, path or query (http/sse; omitted when unparsable).

## Catalog and install

`catalog` has one row per ZIBBY library skill (`SkillsStorageService`):

| Status          | Meaning                                                          |
| --------------- | ---------------------------------------------------------------- |
| `not-installed` | no `<claudeDir>/skills/<skillId>/`                               |
| `installed`     | zibby-managed and `SKILL.md` equals what install would write now |
| `outdated`      | zibby-managed, content differs                                   |
| `conflict`      | dir exists but is not zibby-managed — install refuses            |

Install writes `<claudeDir>/skills/<skillId>/SKILL.md` only (id validated with `AGENT_ID_REGEX`),
atomically (temp file + rename), and never over a `SKILL.md` without `managed-by: zibby`
frontmatter. Content: frontmatter `name` (the skill id, a valid Claude Code skill name), `description` (the skill's `desc`, else name),
`managed-by: zibby`, a blank line, then the skill's `instructions`. Success records a
`skill-installed` activity entry (`refs.itemId` = skill id; display group `integrations`).

Out of scope: uninstalling, installing/enabling plugins or MCP servers, other agents' config.
