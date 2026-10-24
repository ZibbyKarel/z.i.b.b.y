# Machine Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a read-only inventory of the machine's Claude Code MCP servers, skills and plugins, plus a catalog of ZIBBY library skills that installs a skill into the operator's Claude Code in one click.

**Architecture:**

- **API:**
  - a new `inventory` resource: contract-first in `libs/contracts/src/inventory/`, Nest module `apps/api/src/inventory/`;
  - an injectable `ClaudeLocations` provider holds `{ claudeDir, userConfigFile, repoRoot }`;
  - `InventoryService.scan()` aggregates fail-soft readers;
  - `install(skillId)` writes atomically under `<claudeDir>/skills/<id>/`.
- **Web:** `features/inventory` (query + mutation + screen) and a route `/system/inventory`.

**Tech Stack:** Zod 4, ts-rest, NestJS, gray-matter / the existing frontmatter helper, Next.js 15, TanStack Query, next-intl, DS.

**Spec:** `docs/superpowers/specs/todo-13.md` is binding. Exact field names, statuses and copy are there.

## Global Constraints

- Never read `args`, `env` or `headers` of an MCP server into any response, log or activity entry. Never put the MCP URL path or query in a response.
- Tests use temp dirs only. Never touch the real `~/.claude` or `~/.claude.json` in tests, and never write to them while developing.
- Never edit `.zibby/data/`. The exception is the regenerated `.zibby/data/vault/knowledge/self-knowledge.md` when the pre-commit gate demands it: run `graphify update .`, then `pnpm self-knowledge:generate`, stage the note and retry.
- Use pnpm only. No `any`. No `forwardRef`. No inline `style` on DOM in `apps/web`. Every string goes through next-intl in cs and en.
- Run prettier and eslint on changed files. Run the related tests only. Run `tsc` for the touched projects and check the exit code, because rtk can lie about it.
- Never use `--no-verify`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- An MCP entry with a token in `env`, `headers`, `args` or the URL query: the token never appears in the `GET /api/inventory` body. Task 1 has a test that asserts on the serialised JSON.
- Installing over a non-zibby skill dir returns 409 and leaves the file byte-identical. Task 1 test.
- `skillId` is `../x`, or an id the store rejects: 400 or 404, and nothing is written outside `<claudeDir>/skills/`. Task 1 test.
- Corrupt `installed_plugins.json`, a missing `.claude.json`, or a plugin `installPath` that does not exist: the other sections still populate and the response is 200. Task 1 test.
- An install error renders inline on the row rather than as a toast, and the button shows pending. Task 2 test.

---

### Task 1: API — inventory contract, scan, install

**Files:**

- Create:
  - `libs/contracts/src/inventory/inventory.schema.ts` and `inventory.contract.ts` (+ contract test).
  - Export them from `libs/contracts/src/index.ts`, and register the contract in `app.contract.ts`, following how `project-health` was added.
- Create:
  - `apps/api/src/inventory/claude-locations.ts`: the `CLAUDE_LOCATIONS` token and a factory reading `CLAUDE_CONFIG_DIR` / `homedir()` / the repo root.
  - `inventory.service.ts` (+ test).
  - `inventory.controller.ts`.
  - `inventory.module.ts`, registered in `app.module.ts`.
  - An e2e test following the existing `apps/api/test/*.e2e.test.ts` pattern, with `CLAUDE_CONFIG_DIR` pointed at a temp dir.
- Modify: the activity kinds in contracts, adding `skill-installed`. Find the activity kind enum and any exhaustive maps, such as `ACTIVITY_GROUP_OF` in web, and add the entry where `tsc` demands it.
- Docs: `docs/api/inventory.md`.

**Interfaces (produced):**

- types `MachineInventory`, `InventoryMcpServer`, `InventorySkill`, `InventoryPlugin`, `InventoryCatalogEntry`, `InventoryCatalogStatus`;
- `inventoryContract.getInventory`;
- `inventoryContract.installSkill` (`POST /api/inventory/skills/:skillId/install`, body `{}` → 200 `{ skillId, status: "installed" }` | 404 | 409).

- [ ] **Step 1: Failing tests** for the service, using a temp `claudeDir` + `.claude.json` + `repoRoot`:
  - **MCP:**
    - user stdio `{command:"/usr/local/bin/npx", args:["--token=SECRET"], env:{API_KEY:"SECRET"}}` → `{name, scope:"user", transport:"stdio", target:"npx"}`;
    - http `{type:"http", url:"https://user:pw@mcp.example.com/v1?key=SECRET", headers:{Authorization:"SECRET"}}` → target `"https://mcp.example.com"`;
    - `JSON.stringify(result)` contains no `SECRET`, `user:pw` or `/v1`;
    - local scope comes from `projects[repoRoot].mcpServers`, and project scope from `repoRoot/.mcp.json`.
  - **Plugins:**
    - `installed_plugins.json` v2 with 2 plugins, one with `skills/a/SKILL.md` and `.mcp.json`;
    - `settings.json` `enabledPlugins` → `enabled` and the counts;
    - the plugin's skills appear in `skills` with `source:"plugin"`;
    - the plugin's MCP servers appear with `scope:"plugin"`.
  - **User skills:**
    - frontmatter name/description;
    - a symlinked dir is followed;
    - `managed-by: zibby` → `zibbyManaged:true`.
  - **Catalog statuses:** all four (`not-installed`, `installed`, `outdated`, `conflict`).
  - **Install:**
    - writes the exact content;
    - a second install over zibby-managed content succeeds;
    - a non-managed dir → conflict error, with the file unchanged;
    - an invalid id → error, with nothing written;
    - an unknown skill → not-found.
  - **Fail-soft:** corrupt JSON, missing files, and a nonexistent `installPath` → 200 with empty sections.
  - **e2e:** `GET /api/inventory` 200, and install 200/404/409.
- [ ] **Step 2:** Run the tests and confirm they FAIL.
- [ ] **Step 3: Implement.** Keep each source reader a small pure-ish function over paths. On install success, record the activity entry using the existing activity writer.
- [ ] **Step 4:** Tests PASS. `tsc` is clean for apps/api and libs/contracts, and also for apps/web if the activity kind enum change ripples there.
- [ ] **Step 5: Commit** `feat(api): machine inventory — MCP/skills/plugins scan + ZIBBY skill install`.

### Task 2: Web — `/system/inventory`

**Files:**

- Create `apps/web/features/inventory/`:
  - `queries/useInventoryQuery.ts` (+ `getInventoryQueryKey`, index);
  - `mutations/useInstallSkillMutation.ts` (invalidates, `meta.inlineError`);
  - `screens/InventoryScreen.tsx` (+ test).
  - Use `export enum InventoryScreenTestId { Catalog = "inventory-catalog", CatalogRow = "inventory-catalog-row", Install = "inventory-install", RowError = "inventory-row-error", Mcp = "inventory-mcp", Skills = "inventory-skills", Plugins = "inventory-plugins", Refresh = "inventory-refresh", Empty = "inventory-empty" }`.
- Create `apps/web/app/(company)/system/inventory/page.tsx`.
- Add a nav entry next to wherever `/system/registries` is linked from the shell or system navigation, and a command-palette static entry if system pages are listed statically.
- i18n cs/en: `inventory.*`, using the spec's exact copy.

- [ ] **Step 1: Failing tests** (mock the hooks the way other screens' tests do):
  - The four sections render in the spec's order.
  - Each catalog status shows its badge copy:
    - `not-installed` → an Install button;
    - `outdated` → an Update button;
    - `conflict` → no button, plus the conflict hint;
    - `installed` → no button.
  - Clicking Install calls the mutation with `{ params: { skillId } }`. While pending, the button is disabled.
  - A mutation error renders `RowError` on that row.
  - An empty section shows "Nic nenalezeno." (en "Nothing found.").
  - The MCP row shows the target. The skill row shows the ZIBBY tag when managed.
  - Refresh calls `refetch`.
- [ ] **Step 2:** Confirm the tests FAIL, implement, then confirm they PASS. `tsc -p apps/web/tsconfig.json --noEmit` exits 0.
- [ ] **Step 3: Commit** `feat(web): machine inventory page — MCP, skills, plugins and ZIBBY skill catalog install`.
