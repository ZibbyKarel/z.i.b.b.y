# Close Ambient Native-Skill Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ZIBBY-spawned `claude` session runs with `--setting-sources ""` (no ambient user/project/local settings, plugins, skills, hooks), and whatever a run should get back is declared on disk (`plugins[]` → `--plugin-dir`).

**Architecture:** One-shots all route through `spawnClaudeCli` (+ the product-factory haiku provider) — add the flag there. Runs route through `ClaudeRunCommandService.buildClaudeCommand` — add the flag, a `pluginDirs` option (→ `--plugin-dir` each) and a `contextDir` option (→ `--add-dir`, so the target repo's `CLAUDE.md` still loads via `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`, set in RunnerCore's spawn env). ZIBBY's custom commands move from `<spawnCwd>/.claude/commands` (invisible under `""`) to a ZIBBY-owned plugin in the run sandbox, passed via `--plugin-dir`.

**Tech Stack:** NestJS, Zod (libs/contracts), vitest, pnpm.

**Spec:** `docs/superpowers/specs/todo-1-uzavrit-ambientni-nacitani-nativnich-skills.md`

## Global Constraints

- Worktree `/Users/zibar/Workspace/z.i.b.b.y/worktrees/todo-1-uzavrit-ambientni-nacitani-nativnich-skills`, branch `todo-1-uzavrit-ambientni-nacitani-nativnich-skills`. Never touch the main checkout.
- pnpm only. No `any`. Contract-first: schema change in `libs/contracts` before API use.
- Commit with `PATH="$PWD/node_modules/.bin:$PATH" git commit …`, never `--no-verify`. If pre-commit fails on `.zibby/data/vault/knowledge/self-knowledge.md`: `pnpm self-knowledge:generate && git add .zibby/data/vault/knowledge/self-knowledge.md`, retry.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- After each file edit: `pnpm exec prettier --write <file>` and `pnpm exec eslint --fix <file>`.
- No vendoring of any third-party plugin tree into the repo. `plugins[]` just takes paths.
- The value of `--setting-sources` is the empty string `""` (a separate argv element).

## Review Focus

- A caller of `spawnClaudeCli` that already passes `--setting-sources` must not get it twice — test pins "not duplicated".
- No enabled commands → no plugin dir is created and no `--plugin-dir` for it (CLI ignores missing dirs, but the persisted args should not lie) — test pins `materialize` returns `null`.
- Approval→resume replays persisted args: the commands plugin dir must live in the run's persistent sandbox (`systemPromptDir`/stage cwd), not a tmp dir — test pins the path is under the given dir.
- Agent with `plugins` + project with `plugins` → both appear, agent's first, each as its own `--plugin-dir` pair — test pins order.
- The approval hook `--settings` must still be present alongside `--setting-sources ""` (verified empirically that it still fires) — existing settings test must keep passing.

---

### Task 1: `--setting-sources ""` on every one-shot

**Files:**

- Modify: `apps/api/src/shared/spawn-claude-cli.ts`
- Modify: `apps/api/src/shared/spawn-claude-cli.test.ts`
- Modify: `libs/product-factory/src/providers/haiku.ts`
- Modify: `libs/product-factory/src/providers/providers.test.ts` (the `describe("haiku")` block ~L209)

**Interfaces:** Produces: `spawnClaudeCli` always spawns with `["--setting-sources", "", ...opts.args]` unless `opts.args` already contains `--setting-sources`. Exported const `ISOLATED_SETTING_SOURCES = ["--setting-sources", ""] as const` from `spawn-claude-cli.ts` (Task 2 reuses it).

- [ ] **Step 1: Failing tests.** In `spawn-claude-cli.test.ts` change the first test's expected call to `["--setting-sources", "", "-p", "hi"]`, and add:

```ts
it("does not duplicate --setting-sources when the caller already passes it", async () => {
  const child = nextSpawn();
  const promise = spawnClaudeCli({
    args: ["-p", "hi", "--setting-sources", "project"],
    timeoutMs: 8000,
    label: "test",
  });
  child.emit("exit", 0);
  await promise;
  const args = spawnMock.mock.calls[0]?.[1] as string[];
  expect(args.filter((a) => a === "--setting-sources")).toHaveLength(1);
  expect(args[args.indexOf("--setting-sources") + 1]).toBe("project");
});
```

Fix any other `toHaveBeenCalledWith("claude", [...])` in that file the same way. In the haiku test, add `expect(args[args.indexOf("--setting-sources") + 1]).toBe("");` next to `expect(args).toContain("haiku")`.

- [ ] **Step 2:** `pnpm exec vitest run apps/api/src/shared/spawn-claude-cli.test.ts --project api` → FAIL. (product-factory: find its vitest project name in `vitest.workspace*`/`vitest.config*`, or run `pnpm exec vitest run libs/product-factory/src/providers/providers.test.ts`.)

- [ ] **Step 3: Implement.** In `spawn-claude-cli.ts`:

```ts
/**
 * Every one-shot runs isolated: `--setting-sources ""` loads NO user/project/local
 * settings — so no ambient ~/.claude plugins/skills/SessionStart hooks and none of a
 * client repo's `.claude/` leak into a headless call (Law 2/5: behaviour depends only
 * on what ZIBBY passes). Same mechanism the chat engine uses. `--settings`/`--plugin-dir`
 * flags still apply.
 */
export const ISOLATED_SETTING_SOURCES = ["--setting-sources", ""] as const;
```

and in `spawnClaudeCli` spawn with

```ts
const args = opts.args.includes("--setting-sources")
  ? opts.args
  : [...ISOLATED_SETTING_SOURCES, ...opts.args];
```

Update the docblock of `SpawnClaudeCliOptions.args` to mention the prepend. In `haiku.ts` add `"--setting-sources", "",` after `"--no-session-persistence",`.

- [ ] **Step 4:** Rerun both test files → PASS. Also run every one-shot caller's tests that may assert exact argv: `pnpm exec vitest run apps/api/src/tasks apps/api/src/briefing apps/api/src/memory apps/api/src/channels/triage apps/api/src/channels/reply-draft apps/api/src/review-learning --project api` → PASS (fix any exact-argv assertion by adding the prefix).

- [ ] **Step 5: Commit** `fix(runner): isolate every claude one-shot with --setting-sources ""`.

---

### Task 2: Isolated run command + `pluginDirs` / `contextDir`

**Files:**

- Modify: `apps/api/src/runner/claude-run-command.service.ts` (`ClaudeRunOptions` ~L18, `buildClaudeCommand` ~L427-508)
- Modify: `apps/api/src/runner/runner-core.ts` (both `spawn(spec.command, spec.args, …)` env objects, ~L399 and ~L494)
- Test: `apps/api/src/runner/claude-run-command.service.test.ts`

**Interfaces:**

- Consumes: `ISOLATED_SETTING_SOURCES` from `../shared/spawn-claude-cli`.
- Produces: `ClaudeRunOptions.pluginDirs?: readonly string[]` and `ClaudeRunOptions.contextDir?: string`.

- [ ] **Step 1: Failing tests** (use the file's `makeService`/`flagValue` helpers and its existing `buildClaudeCommand` call style):

```ts
it('isolates the run from ambient settings with --setting-sources ""', async () => {
  const { args } = await makeService([CODER], []).buildClaudeCommand({
    instructions: "x",
    task: "do it",
  });
  expect(flagValue(args, "--setting-sources")).toBe("");
  // the approval-hook floor still rides --settings
  expect(flagValue(args, "--settings")).toContain("PreToolUse");
});

it("passes each declared plugin dir as its own --plugin-dir, in order", async () => {
  const { args } = await makeService([CODER], []).buildClaudeCommand({
    instructions: "x",
    task: "do it",
    pluginDirs: ["/opt/plugins/a", "/opt/plugins/b"],
  });
  const dirs = args.flatMap((a, i) => (a === "--plugin-dir" ? [args[i + 1]] : []));
  expect(dirs).toEqual(["/opt/plugins/a", "/opt/plugins/b"]);
});

it("grants contextDir via --add-dir so its CLAUDE.md loads", async () => {
  const { args } = await makeService([CODER], []).buildClaudeCommand({
    instructions: "x",
    task: "do it",
    contextDir: "/repo/worktree",
  });
  const added = args.flatMap((a, i) => (a === "--add-dir" ? [args[i + 1]] : []));
  expect(added).toContain("/repo/worktree");
});

it("emits no --plugin-dir when none are declared", async () => {
  const { args } = await makeService([CODER], []).buildClaudeCommand({
    instructions: "x",
    task: "do it",
  });
  expect(args).not.toContain("--plugin-dir");
});
```

(If the `--settings` value assertion shape differs in this file, mirror the existing settings test instead.)

- [ ] **Step 2:** `pnpm exec vitest run apps/api/src/runner/claude-run-command.service.test.ts --project api` → FAIL.

- [ ] **Step 3: Implement.** Add to `ClaudeRunOptions`:

```ts
  /**
   * Plugin directories to load (`--plugin-dir`, one per entry). Runs spawn with
   * `--setting-sources ""`, so NO ambient user/project plugin loads — this is the only
   * way a plugin reaches a run, and it is declared on disk (agent/project `plugins[]`,
   * plus ZIBBY's own materialized commands plugin). Persisted in the run's args = trace.
   */
  pluginDirs?: readonly string[];
  /**
   * The repo the session spawns in (worktree / project checkout). Granted via
   * `--add-dir` so its `CLAUDE.md` still loads under `--setting-sources ""`
   * (RunnerCore sets `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`); the repo's
   * `.claude/` settings, hooks, skills and commands do NOT load.
   */
  contextDir?: string;
```

In `buildClaudeCommand`'s `args` array, right after `"-p", withExecutionDirective(...)`, insert `...ISOLATED_SETTING_SOURCES,` with a comment pointing at the spec (ambient superpowers preamble vs OPERATING_CONTRACT; client-repo hooks in a dontAsk run). After the `grantDirs` loop add:

```ts
if (opts.contextDir) args.push("--add-dir", opts.contextDir);
for (const dir of opts.pluginDirs ?? []) args.push("--plugin-dir", dir);
```

In `runner-core.ts`, both spawn envs become:

```ts
      env: {
        ...process.env,
        // Runs spawn with --setting-sources "" (no project source), so the target
        // repo's CLAUDE.md only loads as an --add-dir (see ClaudeRunOptions.contextDir).
        CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: "1",
        ...spec.env,
        [INTENT_DIR_ENV]: spec.cwd,
      },
```

Update the class docblock of `ClaudeRunCommandService` with one sentence on isolation.

- [ ] **Step 4:** Rerun → PASS; also `pnpm exec vitest run apps/api/src/runner --project api` → PASS (fix exact-argv assertions if any).

- [ ] **Step 5: Commit** `fix(runner): spawn runs with --setting-sources "" + declared --plugin-dir`.

---

### Task 3: `plugins[]` on agent + project, commands as a ZIBBY plugin, wiring

**Files:**

- Modify: `libs/contracts/src/agents/agent.schema.ts` (`AgentSchema`, after `optionalTools`)
- Modify: `libs/contracts/src/projects/project.schema.ts` (`ProjectSchema`, after `env`)
- Modify: `apps/api/src/runner/command-materializer.service.ts` + `.test.ts`
- Modify: `apps/api/src/agents/agent-runner.service.ts` (~L349 buildCommand call, ~L409 materialize, `buildCommand` ~L745)
- Modify: `apps/api/src/workflows/workflow-runner.service.ts` (~L2027-2041, `buildStageCommand` ~L2442-2550)
- Test: `apps/api/src/agents/agent-runner.service.test.ts`, `apps/api/src/workflows/workflow-runner.service.test.ts` (only if they need fixing)

**Interfaces:**

- Consumes: `ClaudeRunOptions.pluginDirs`, `ClaudeRunOptions.contextDir` (Task 2).
- Produces: `Agent.plugins?: string[]`, `Project.plugins?: string[]`; `CommandMaterializerService.materialize(sandboxDir: string): Promise<string | null>` returning the plugin dir `<sandboxDir>/zibby-commands` or `null`.

- [ ] **Step 1: Contracts.** Add to both schemas:

```ts
  /**
   * Claude Code plugin directories this agent's runs load (`--plugin-dir`, one per
   * entry; absolute paths — a relative one resolves against the run's spawn cwd).
   * Runs spawn with `--setting-sources ""`, so nothing from ~/.claude/plugins loads
   * ambiently — declare a pinned copy here to get a plugin back. Merged with the
   * project's `plugins` (agent's first).
   */
  plugins: z.array(z.string().min(1)).optional(),
```

(Project wording: "this project's runs … merged after the agent's.") Check `apps/api/src/agents/*storage*` and `apps/api/src/projects/*storage*` persist schema fields generically (no per-field allowlist); if one has an allowlist, add `plugins` there. Run `PATH="$PWD/node_modules/.bin:$PATH" tsc -p libs/contracts/tsconfig.lib.json --noEmit` (or the contracts tsconfig that exists).

- [ ] **Step 2: Materializer failing tests.** Rewrite `command-materializer.service.test.ts` cases:

```ts
it("writes enabled commands as a ZIBBY plugin under <dir>/zibby-commands and returns it", async () => {
  const pluginDir = await makeMaterializer([orchestrate, disabled]).materialize(dir);
  expect(pluginDir).toBe(path.join(dir, "zibby-commands"));
  const manifest = JSON.parse(
    await fs.readFile(path.join(dir, "zibby-commands", ".claude-plugin", "plugin.json"), "utf8"),
  ) as { name: string };
  expect(manifest.name).toBe("zibby");
  const text = await fs.readFile(
    path.join(dir, "zibby-commands", "commands", "orchestrate.md"),
    "utf8",
  );
  expect(text).toContain("Orchestrate: $ARGUMENTS");
  expect(text).toContain("argument-hint");
  await expect(fs.access(path.join(dir, "zibby-commands", "commands", "off.md"))).rejects.toThrow();
});

it("returns null and writes nothing when there are no enabled commands", async () => {
  expect(await makeMaterializer([disabled]).materialize(dir)).toBeNull();
  await expect(fs.access(path.join(dir, "zibby-commands"))).rejects.toThrow();
});

it("never writes into <dir>/.claude/commands any more", async () => {
  await makeMaterializer([orchestrate]).materialize(dir);
  await expect(fs.access(path.join(dir, ".claude"))).rejects.toThrow();
});
```

Delete the "does not overwrite a pre-existing command" and "git exclude" tests (and the `execFileSync` import if unused). Run → FAIL.

- [ ] **Step 3: Materializer implementation.** `materialize(sandboxDir)`: list enabled commands; none → `return null`; else write `<sandboxDir>/zibby-commands/.claude-plugin/plugin.json` = `{"name":"zibby","description":"ZIBBY custom commands materialized for this run"}` and `commands/<id>.md` via `renderCommandFile` (overwrite — the dir is ZIBBY-owned and per-run), return the plugin dir. On any error return `null` (fail-open, as before). Delete `excludeFromGit`. Rewrite the class docblock: under `--setting-sources ""` the CLI no longer discovers `<cwd>/.claude/commands`, so commands ride a ZIBBY-owned plugin in the per-run sandbox via `--plugin-dir`; they are namespaced `/zibby:<id>` and the Skill tool resolves a bare `/<id>`; nothing is written into a client worktree. Run tests → PASS.

- [ ] **Step 4: Wire agent runner.** In `agent-runner.service.ts`:
  - Move the `buildCommand(...)` call to AFTER the worktree/spawnCwd block, and replace the old `materialize(spawnCwd ?? cwd)` with, right before it, `const commandsPlugin = await this.commandMaterializer.materialize(cwd);` (cwd = the run sandbox; `materialize` mkdirs).
  - Add two trailing params to `buildCommand`: `pluginDirs: readonly string[] = []`, `contextDir?: string`, forwarded as `...(pluginDirs.length ? { pluginDirs } : {})`, `...(contextDir ? { contextDir } : {})`.
  - Call with `pluginDirs = [...(agent.plugins ?? []), ...(resolved?.plugins ?? []), ...(commandsPlugin ? [commandsPlugin] : [])]` and `contextDir = spawnCwd`.
  - Update the comment above the materialize call.

- [ ] **Step 5: Wire workflow runner.** In `workflow-runner.service.ts`:
  - Before `buildStageCommand(...)`: `const commandsPlugin = await this.commandMaterializer.materialize(stageCwd);` and delete the later `materialize(spawnCwd ?? stageCwd)` call.
  - Add trailing param to `buildStageCommand`: `commandsPluginDir?: string | null`, pass `commandsPlugin`.
  - In the claude branch's `buildClaudeCommand({...})` add
    `pluginDirs: [...(agent.plugins ?? []), ...(project?.plugins ?? []), ...(commandsPluginDir ? [commandsPluginDir] : [])],`
    and `...(spawnCwd ? { contextDir: spawnCwd } : {}),`.
  - Update the "Handoff paths are passed ABSOLUTE … its real CLAUDE.md/.claude context loads" comment: only CLAUDE.md loads now (via contextDir).
  - Existing test mocks `{ materialize: vi.fn(async () => {}) }` resolve `undefined` — treat falsy as no plugin (the `?` check above handles it).

- [ ] **Step 6: Tests.** Add to `agent-runner.service.test.ts` one test (follow the file's existing pattern for inspecting the spawned spec args, e.g. how it asserts `--resume` or `--add-dir`) that an agent with `plugins: ["/p/agent"]` produces `--plugin-dir /p/agent` in the spec args. Run:
      `pnpm exec vitest run apps/api/src/runner apps/api/src/agents apps/api/src/workflows --project api` → PASS.
      Typecheck: `PATH="$PWD/node_modules/.bin:$PATH" tsc -p apps/api/tsconfig.json --noEmit` (use the api tsconfig that includes src) → clean.

- [ ] **Step 7: Commit** `feat(runner): declarative plugins[] on agent/project; commands ride a ZIBBY plugin`.

---

### Task 4: Docs

**Files:**

- Modify: `docs/api/runner.md` (component table ~L26, spawn-cwd note ~L81, flags list ~L259, materializer section ~L336)
- Modify: `docs/api/agents-runs.md` and `docs/api/projects.md` (field list where agent/project fields are documented — add `plugins`)

- [ ] **Step 1:** In `runner.md` add an "Isolation" bullet to the flags list: `--setting-sources ""` on every run and one-shot (chat already did); what does NOT load (user `~/.claude` settings/plugins/skills/SessionStart hooks; the target repo's `.claude/settings.json` hooks, skills, commands); what still does (`--settings` approval hook — verified it fires; `--plugin-dir` entries; the target repo `CLAUDE.md` via `--add-dir` + `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`); and the `plugins[]` → `--plugin-dir` rule (agent then project then ZIBBY commands plugin; paths, no vendored third-party trees; persisted args are the trace). Rewrite the materializer row/section for the `zibby-commands` plugin (`/zibby:<id>`, nothing written into the worktree). Fix the ~L81 sentence (only CLAUDE.md loads now). Add `plugins` to the agent and project field docs.
- [ ] **Step 2:** `pnpm exec prettier --write docs/api/runner.md docs/api/agents-runs.md docs/api/projects.md`.
- [ ] **Step 3: Commit** `docs(runner): document run isolation and plugins[]`.
