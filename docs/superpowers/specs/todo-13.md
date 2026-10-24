# TODO 13 — Inventář MCP, skills a pluginů na stroji + katalog vlastních skills ZIBBY k instalaci

**Raw TODO item:** Inventář MCP, skills a pluginů na stroji + katalog vlastních skills ZIBBY k instalaci

## Interpretation (night-run rulings, operator asleep)

- **"Na stroji"** means the operator's Claude Code installation on the machine ZIBBY runs on.
  ZIBBY's own registries (`/system/registries/*`) already list what ZIBBY injects into its runs.
  This item adds a read-only view of what the machine itself has.
- **"Katalog vlastních skills ZIBBY k instalaci"** means ZIBBY's skill library, which is served by
  the existing skills store. Each library skill can be installed into the operator's Claude Code
  as a user skill with one click. It never overwrites a skill ZIBBY did not install.
- **Secrets never leave the config files.** MCP configs hold tokens in `env`, `headers`, `args` and
  URL query strings. The inventory exposes only:
  - names;
  - scope;
  - transport;
  - a sanitised target: the command basename, or the URL origin with no userinfo, path or query.

## Requirements

1. **Claude config location.**
   - The Claude dir is `$CLAUDE_CONFIG_DIR`, else `~/.claude`. This mirrors
     `apps/api/src/limits/rate-limits.reader.ts`.
   - The user config file is `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json`.
   - The project `.mcp.json` lives at the ZIBBY repo root, i.e. the API's install root. Reuse
     whatever the API already uses to find the repo root.
   - The API takes these locations from one injectable provider, so tests point it at temp dirs.
2. **Contract `inventoryContract`.**
   - `GET /api/inventory` returns `200 MachineInventory`:
     - `mcp: { name, scope: "user" | "project" | "local" | "plugin", transport: "stdio" | "http" | "sse" | "unknown", target?: string, plugin?: string }[]`
       - `user` comes from `.claude.json` `mcpServers`.
       - `local` comes from `.claude.json` `projects[<repo root>].mcpServers`.
       - `project` comes from the repo `.mcp.json`.
       - `plugin` comes from `<installPath>/.mcp.json` of an installed plugin.
       - `target`:
         - for stdio, the basename of `command`;
         - for http/sse, `new URL(url).origin`;
         - omitted when unparsable.
       - `args`, `env` and `headers` are NEVER read into the response.
     - `skills: { id, name, description?, source: "user" | "plugin", plugin?: string, zibbyManaged: boolean }[]`
       - User skills are `<claudeDir>/skills/<dir>/SKILL.md`. Symlinked dirs are followed.
       - Plugin skills are `<installPath>/skills/<dir>/SKILL.md`.
       - `name` and `description` come from the frontmatter, with `name` falling back to the dir
         name. `description` is capped at 300 chars.
       - `zibbyManaged` is true when the frontmatter has `managed-by: zibby`.
     - `plugins: { id, version?, scope?, enabled: boolean, skillCount: number, mcpCount: number }[]`
       - These come from `<claudeDir>/plugins/installed_plugins.json` (v2 shape: `plugins` maps an
         id to an array of installs; take the first).
       - `enabled` comes from `<claudeDir>/settings.json` `enabledPlugins[id] === true`.
     - `catalog: { skillId, name, desc?, status: "not-installed" | "installed" | "outdated" | "conflict" }[]`
       - There is one row per ZIBBY library skill.
       - `not-installed`: no `<claudeDir>/skills/<skillId>/` dir.
       - `installed`: the dir is zibby-managed and its SKILL.md equals what install would write
         now.
       - `outdated`: the dir is zibby-managed but its content differs.
       - `conflict`: the dir exists but is not zibby-managed, so install refuses.
   - `POST /api/inventory/skills/:skillId/install` with body `{}`:
     - `200 { skillId, status: "installed" }`;
     - `404` for an unknown library skill;
     - `409 ErrorSchema` when the result would be `conflict`.
     - Install writes `<claudeDir>/skills/<skillId>/SKILL.md`. It creates the dir if needed and
       overwrites only when the existing file is zibby-managed.
     - The content is YAML frontmatter `name`, `description` (the skill's `desc` or `name`) and
       `managed-by: zibby`, then a blank line, then the skill's `instructions`.
     - The write is atomic: write a temp file in the same dir, then rename.
   - Installing records an activity entry, kind `skill-installed`, with the skill id, so the
     briefing and audit can answer what was installed.
3. **Robustness.**
   - A missing or invalid JSON file, or an unreadable dir, yields empty lists for that source,
     never a 500.
   - One broken plugin does not hide the others.
   - The scan is read-only. Only the install endpoint writes, and only under
     `<claudeDir>/skills/<skillId>/`.
   - `skillId` is validated with the existing skill id rules, so there is no path traversal.
4. **Web — `/system/inventory`** (cs "Inventář stroje" / en "Machine inventory").
   - The page is reachable from the same place `/system/registries` is reached (a sibling nav
     entry), plus a command-palette static entry if the palette lists system pages statically.
   - **Sections, in order:**
     1. "Katalog ZIBBY skills" / "ZIBBY skill catalog";
     2. "MCP servery" / "MCP servers";
     3. "Skills na stroji" / "Skills on this machine";
     4. "Pluginy" / "Plugins".
   - **Catalog rows** show the name, the description and a status badge:
     - cs "Nenainstalováno" / en "Not installed";
     - "Nainstalováno" / "Installed";
     - "Zastaralé" / "Outdated";
     - "Konflikt" / "Conflict".
   - **Catalog actions:**
     - `not-installed` shows "Nainstalovat" / "Install";
     - `outdated` shows "Aktualizovat" / "Update";
     - `conflict` shows no button, plus the hint cs "Na stroji už existuje skill se stejným názvem,
       který nespravuje ZIBBY." / en "A skill with this name already exists on this machine and is
       not managed by ZIBBY."
     - The mutation invalidates the inventory query.
     - Errors show inline on the row (`meta.inlineError`), not as a global toast.
   - **Other rows:**
     - MCP rows show the name, scope, transport, target and plugin.
     - Skill rows show the name, source/plugin and a "ZIBBY" tag when zibby-managed.
     - Plugin rows show the id, version, an enabled/disabled tag and the skill/MCP counts.
   - **Empty states** have one line per section: cs "Nic nenalezeno." / en "Nothing found."
   - **Freshness:** the inventory is state, so it is fetched on mount with no polling. A "Obnovit"
     / "Refresh" button sits top-right.
5. Every string goes through next-intl in cs and en. Use DS primitives, DS testid enums, and no
   inline style.
6. **Docs:** `docs/api/inventory.md`, plus whatever docs-sync names.

## Out of scope (v1)

- Uninstalling. Removing a skill from the machine stays manual.
- Installing or enabling plugins or MCP servers.
- Inventory for other agents' config (Codex and similar).
