# External Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install skills from a public GitHub repo link into the ZIBBY skill library (read-only, pinned by SHA, auto-updated weekly), and let an agent workflow phase carry a custom prompt with a `/skill` mention.

**Architecture:** A new `external-skills` module shallow-clones the repo, discovers every `SKILL.md`, and copies the chosen skill folders (whole folder: `SKILL.md` + references + scripts) to `dataDir("skills-external", <id>)`, with provenance in a JSON manifest `dataDir("external-skills.json")`. `SkillsStorageService.list/get` merge these in, so every existing consumer (run catalog, chat `/`, registries, inventory, MCP) sees them like any other skill; writes to them are rejected. Runs get the skill folder via `--add-dir` so referenced files and scripts work. A weekly system automation and two buttons call the same sync.

**Tech Stack:** NestJS + ts-rest + Zod (`libs/contracts`), git CLI via `apps/api/src/shared/git-exec.ts`, Next.js + TanStack Query + design system, vitest.

**Spec:** the operator's Q&A of 2026-10-29 (summarized in *Decisions* below — this is the spec).

## Decisions (spec)

1. Add by pasting a **public GitHub** repo URL (root or `/tree/<ref>/<path>`). Private repos are a later feature: `.zibby/data/vault/features/external-skills-private-repos.md`.
2. The repo is scanned for every `SKILL.md`; the operator picks which to install.
3. The **whole skill folder** is copied. Scripts may run; tools are not restricted (same as own skills).
4. Pinned to a commit **SHA**. Installed skills are **read-only**. Id collision with any existing skill → **error**.
5. Updates: weekly system automation **"Aktualizace externích závislostí"**, a per-skill button, and **"Synchronizovat vše"** at the top of the skills page. Updates apply **silently** and are **reported in the briefing**.
6. Workflow: an **agent phase** gets a custom prompt typed in the same composer as chat, with `/` skill autocomplete (reuse `CommandLine`). No new phase type.
7. Uninstall lists workflows that use the skill; per workflow the operator chooses **remove the whole workflow** or **remove just that step**, or cancels.
8. Not shared across team members (each ZIBBY installs its own).
9. Skill card/row shows **owner** (e.g. `cloudflare`), **skill name**, **last update**, and **update available** when known.

## Global Constraints

- Contract-first: each task lands its `libs/contracts` change before the implementation.
- Web composes from DS only; no inline `style` on DOM nodes; every new interactive DS-like part gets a `data-testid`.
- i18n: every new string in both `apps/web/i18n/messages/cs.json` and `en.json` (default `cs`).
- Query/mutation hooks: one per file under `apps/web/features/skills/{queries,mutations}/`, returning the TanStack result directly.
- Only `https://github.com/<owner>/<repo>` URLs are accepted (optionally `.git`, `/tree/<ref>/<path>`). Anything else → 400.
- Copying a skill folder never follows symlinks and never writes outside `dataDir("skills-external", <id>)`.
- External skill ids must match `AGENT_ID_REGEX` and be unique across own + external skills.
- Validation per `docs/ops/validation-policy.md`: prettier + eslint on touched files, run the related test file only.

## Review Focus

1. **Repo with no `SKILL.md`** (wrong link) → scan returns 422 "no skill found in repo", nothing written. Test in Task 2.
2. **Single-skill repo with `SKILL.md` at the root** → one candidate, id from frontmatter `name`, folder = repo root minus `.git`. Test in Task 1.
3. **Remote unreachable or deleted during sync** → installed copy untouched, record gets `lastError`, `syncAll` continues with other repos. Test in Task 3.
4. **Upstream moved/removed the skill folder** → sync keeps the installed copy and sets `lastError: "skill folder missing upstream"`. Test in Task 3.
5. **Symlink inside the repo pointing outside** (e.g. `references -> /etc`) → skipped on copy. Test in Task 2.

---

### Task 1: URL parsing and repo scanning (pure)

**Files:**
- Create: `apps/api/src/external-skills/skill-repo.ts`
- Test: `apps/api/src/external-skills/skill-repo.test.ts`

**Interfaces:**
- Produces:
  - `parseGitHubSkillUrl(url: string): { owner: string; repo: string; remote: string; subpath?: string }` — `remote` is `https://github.com/<owner>/<repo>.git`; throws `InvalidSkillRepoUrlError(url)` (exported from this file).
  - `scanSkillDir(root: string, subpath?: string): Promise<SkillCandidate[]>`
  - `type SkillCandidate = { path: string /* repo-relative dir, "" for root */; id: string; name: string; desc?: string; instructions: string }`
  - `parseSkillMd(text: string, fallbackId: string): { id: string; name: string; desc?: string; instructions: string }`

- [ ] **Step 1: Write failing tests**

```ts
it("parses root, .git and tree urls", () => {
  expect(parseGitHubSkillUrl("https://github.com/cloudflare/security-audit-skill"))
    .toEqual({ owner: "cloudflare", repo: "security-audit-skill", remote: "https://github.com/cloudflare/security-audit-skill.git" });
  expect(parseGitHubSkillUrl("https://github.com/a/b/tree/main/skills/x").subpath).toBe("skills/x");
});
it("rejects non-github and traversal", () => {
  for (const u of ["https://gitlab.com/a/b", "git@github.com:a/b", "https://github.com/a/b/tree/main/../../etc", "file:///tmp/x"])
    expect(() => parseGitHubSkillUrl(u)).toThrow(InvalidSkillRepoUrlError);
});
it("finds nested SKILL.md files and skips .git/node_modules", async () => {
  // fixture: skills/security-audit/SKILL.md (name: security-audit, description: Audit), node_modules/x/SKILL.md, .git/SKILL.md
  expect((await scanSkillDir(fx)).map((c) => [c.path, c.id, c.desc]))
    .toEqual([["skills/security-audit", "security-audit", "Audit"]]);
});
it("root SKILL.md yields path ''", async () => { /* fixture repo root */ expect((await scanSkillDir(fx))[0]?.path).toBe(""); });
it("slugifies a non-id name and falls back to the dir name", () => {
  expect(parseSkillMd("---\nname: Security Audit\n---\nbody", "dir").id).toBe("security-audit");
  expect(parseSkillMd("---\nname: ✨\n---\nbody", "my-dir").id).toBe("my-dir");
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm exec vitest run apps/api/src/external-skills/skill-repo.test.ts --project api`
- [ ] **Step 3: Implement.** Frontmatter: reuse the YAML frontmatter parser that `MarkdownEntityStore` uses (`apps/api/src/shared/file-storage`). Map `name`→`name`, `description`→`desc`, body→`instructions`. Id = lowercased `name` with non-`[a-z0-9]` runs → `-`, trimmed; if it fails `AGENT_ID_REGEX`, use the dir basename (repo name for root); `subpath` segments must not contain `..` or start with `/`. Walk with `fs.readdir({ withFileTypes: true })`, skipping `.git`, `node_modules` and symlinks; results sorted by `path`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(external-skills): github url parsing and SKILL.md discovery`

---

### Task 2: Manifest, install, read-only merge into the library

**Files:**
- Create: `libs/contracts/src/skills/external-skill.schema.ts`, `libs/contracts/src/skills/external-skills.contract.ts` (+ export from `libs/contracts/src/index.ts`, mount next to `skillsContract`)
- Modify: `libs/contracts/src/skills/skill.schema.ts` (add `source?: SkillSourceSchema`)
- Create: `apps/api/src/external-skills/{external-skills.store.ts,skill-repo-git.ts,external-skills.service.ts,external-skills.controller.ts,external-skills.errors.ts,external-skills.module.ts}`
- Modify: `apps/api/src/skills/skills.storage.service.ts`, `apps/api/src/skills/skills.controller.ts`, `apps/api/src/skills/skills.errors.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/src/external-skills/external-skills.service.test.ts`, `apps/api/test/external-skills.e2e.test.ts`, `libs/contracts/src/skills/external-skills.contract.test.ts`

**Interfaces:**
- Consumes: Task 1 (`parseGitHubSkillUrl`, `scanSkillDir`, `parseSkillMd`).
- Produces:
  - `SkillSourceSchema = z.object({ owner, repo, url /* as pasted */, path, sha, treeSha, installedAt, updatedAt, checkedAt: z.string(), latestSha: z.string().optional(), lastError: z.string().optional() })` — `ExternalSkillRecord = SkillSource & { id }`.
  - Contract `externalSkillsContract` (prefix `/api`):
    - `scanExternalSkills` POST `/skills/external/scan` `{ url }` → 200 `{ owner, repo, sha, candidates: { path, id, name, desc?, conflict: boolean }[] }` | 400 | 422 | 502
    - `installExternalSkills` POST `/skills/external` `{ url, paths: string[] (min 1) }` → 201 `Skill[]` | 400 | 409 (id conflict) | 422 | 502
    - (Tasks 3 and 5 add routes to this contract.)
  - `ExternalSkillsStore` (JSON array at `dataDir("external-skills.json")`, token `EXTERNAL_SKILLS_FILE`, same shape as `MarketplacesStore`): `list()`, `get(id)`, `upsert(rec)`, `remove(id)`.
  - `externalSkillDir(id: string): string` = `dataDir("skills-external", id)` (token `EXTERNAL_SKILLS_DIR`, overridable in tests).
  - `SkillRepoGit` (injectable, mockable like `MarketplaceCli`): `clone(remote, dest): Promise<string /* HEAD sha */>` (`git clone --depth 1 -- remote dest`), `lsRemoteHead(remote): Promise<string>`, `treeSha(cloneDir, path): Promise<string | null>` (`git rev-parse HEAD:<path>`, `HEAD^{tree}` for root; null when missing). Uses `exec` + `GIT_NETWORK_TIMEOUT_MS`; failures → `SkillRepoGitError` (502).
  - `ExternalSkillsService.scan(url)`, `.install(url, paths)`.
  - `SkillsStorageService.list/get` return own + external skills; external ones carry `source`. `update`/`delete` on an external id throw `ReadOnlySkillError(id)` → 409. `create` with an external id → `SkillConflictError`.

- [ ] **Step 1: Contract test** — routes/paths/methods as above; `SkillSchema.safeParse({ id: "x", instructions: "b", source: {...} }).success === true`.
- [ ] **Step 2: Service tests** (fake `SkillRepoGit` that copies a local fixture dir into `dest`):

```ts
it("installs the chosen folder with provenance", async () => {
  const [s] = await svc.install("https://github.com/cloudflare/security-audit-skill", ["skills/security-audit"]);
  expect(s).toMatchObject({ id: "security-audit", source: { owner: "cloudflare", sha: "abc", path: "skills/security-audit" } });
  expect(existsSync(join(extDir, "security-audit", "HUNTING.md"))).toBe(true);
  expect(existsSync(join(extDir, "security-audit", ".git"))).toBe(false);
});
it("rejects an id clash with an own skill and writes nothing", async () => {
  await skills.create({ id: "security-audit", instructions: "x" });
  await expect(svc.install(url, ["skills/security-audit"])).rejects.toThrow(SkillConflictError);
  expect(existsSync(join(extDir, "security-audit"))).toBe(false);
});
it("scan of a repo without SKILL.md throws NoSkillsFoundError", ...);       // Review Focus 1
it("skips a symlink pointing outside the repo", ...);                       // Review Focus 5
it("external skills are listed and read-only", async () => {
  expect((await skills.list()).map((s) => s.id)).toContain("security-audit");
  await expect(skills.update("security-audit", { desc: "x" })).rejects.toThrow(ReadOnlySkillError);
});
```

- [ ] **Step 3: Run, verify FAIL.**
- [ ] **Step 4: Implement.** Clone into `fs.mkdtemp(os.tmpdir())`, always `rm -rf` it in `finally`. Copy with `fs.cp(src, tmpDest, { recursive: true, verbatimSymlinks: true, filter })` where `filter` drops `.git` and any symlink, then `rename` into place (whole install under `withPathLock("external-skills", …)`). `SkillsStorageService` reads external skills from `ExternalSkillsStore` + `<dir>/SKILL.md` via `parseSkillMd`; a broken external folder is logged and skipped from `list()`, never throws.
- [ ] **Step 5: e2e** (`AppModule`, `EXTERNAL_SKILLS_FILE`/`EXTERNAL_SKILLS_DIR`/`SKILLS_DIR` in mkdtemp, `SkillRepoGit` overridden with the fixture fake): scan → install → `GET /api/skills` contains it → `PATCH /api/skills/security-audit` 409.
- [ ] **Step 6: Run, verify PASS.**
- [ ] **Step 7: Commit** — `feat(external-skills): install skills from a GitHub repo into the library`

---

### Task 3: Sync (per skill, all) + weekly system automation + briefing

**Files:**
- Modify: `libs/contracts/src/skills/external-skills.contract.ts`, `libs/contracts/src/automations/automation.schema.ts` (`TargetSchema` variant), `libs/contracts/src/activity/activity.schema.ts` (`ActivityKindSchema`)
- Modify: `apps/api/src/external-skills/external-skills.service.ts`, `.controller.ts`
- Modify: `apps/api/src/automations/automations.storage.service.ts` (`SYSTEM_AUTOMATIONS`), `apps/api/src/automations/scheduler.service.ts` (`dispatch`), `apps/api/src/automations/automations.module.ts`
- Modify: `apps/api/src/briefing/briefing-assembly.ts` (`DID_KINDS`)
- Test: `external-skills.service.test.ts`, `apps/api/src/automations/scheduler.service.test.ts` (or the existing dispatch test file), contract test

**Interfaces:**
- Consumes: Task 2 store, `SkillRepoGit`, `ActivityLogService.record`.
- Produces:
  - Routes: `syncExternalSkill` POST `/skills/external/:id/sync` → 200 `Skill` | 404 | 502; `syncAllExternalSkills` POST `/skills/external/sync` → 200 `{ checked: number; updated: string[]; failed: string[] }`.
  - `ExternalSkillsService.sync(id): Promise<Skill>`, `.syncAll(): Promise<{ checked; updated; failed }>`.
  - Activity kind `"skill-updated"`, refs `{ itemId: <skill id> }`, summary `Skill <name> aktualizován z <owner>/<repo> (<old7>→<new7>)`.
  - Target `{ type: "external-skills-sync" }`; system automation id `EXTERNAL_DEPS_UPDATE_AUTOMATION_ID = "external-deps-update"`, name `Aktualizace externích závislostí`, cron `0 4 * * 1`, `enabled: true`, `system: true`. Dispatch returns `external-skills:<updated.length>`.

- [ ] **Step 1: Tests**

```ts
it("same remote sha: only checkedAt moves", ...);                     // no clone, no activity
it("new commit, same tree: sha moves, updatedAt and files unchanged, no activity", ...);
it("new tree: folder replaced, updatedAt moves, records skill-updated", ...);
it("unreachable remote: copy untouched, lastError set, syncAll continues", ...); // Review Focus 3
it("folder gone upstream: copy untouched, lastError 'skill folder missing upstream'", ...); // Review Focus 4
it("syncAll clones each repo once for several skills from it", ...);
it("scheduler dispatches external-skills-sync to syncAll", ...);
```

- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.** `sync`: `lsRemoteHead` → set `checkedAt`, `latestSha`; if equal to `sha`, done. Else clone, `treeSha(path)`; null → `lastError`; same tree → just move `sha`; different → replace folder (Task 2 copy routine), set `sha`, `treeSha`, `updatedAt`, clear `lastError`, record activity. `syncAll` groups records by `remote` so one clone serves all its skills; per-group errors go to `failed` and don't stop the loop. `latestSha !== sha` after a failed apply is what the UI shows as "update available".
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(external-skills): weekly sync, manual sync, briefing report`

---

### Task 4: Runs see the skill folder

**Files:**
- Modify: `apps/api/src/runner/claude-run-command.service.ts` (catalog build ~l.700, grant dirs)
- Modify: `apps/api/src/chat/chat-session.service.ts` (`skillSection` ~l.326) — prompt note only; chat stays `--tools ""`
- Test: `apps/api/src/runner/claude-run-command.service.test.ts`

**Interfaces:**
- Consumes: `Skill.source`, `externalSkillDir(id)` (Task 2).
- Produces: `externalSkillPrompt(skill: Skill, dir: string): string` (exported from `apps/api/src/external-skills/skill-repo.ts`) = `Soubory tohoto skillu (reference, skripty) jsou ve složce ${dir}. Relativní cesty v instrukcích se vztahují k ní.\n\n${skill.instructions}`.

- [ ] **Step 1: Test** — with one external skill in the store, the built command's catalog entry `prompt` starts with the folder note and its `--add-dir` args include `externalSkillDir("security-audit")`; an own skill's entry is unchanged.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — in the catalog loop use `externalSkillPrompt` when `skill.source`; collect those dirs into the run's `grantDirs`. In chat use the same helper for `skillSection` (no grant — chat has no tools).
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(external-skills): runs get the installed skill folder`

---

### Task 5: Agent phase custom prompt + `/` skill (backend)

**Files:**
- Modify: `libs/contracts/src/workflows/workflow.schema.ts` (`WorkflowPhaseSchema`, `refineWorkflow`)
- Modify: `apps/api/src/workflows/build-stage-task.ts`, `apps/api/src/workflows/workflow-runner.service.ts` (~l.2968–3030)
- Test: `libs/contracts/src/workflows/workflows.contract.test.ts`, `apps/api/src/workflows/build-stage-task.test.ts`, runner test covering an agent phase

**Interfaces:**
- Produces:
  - `WorkflowPhaseSchema.prompt?: z.string().min(1).max(20_000)`, `.skill?: SkillIdSchema` — agent phase only (refine rejects them on `tool`/`workflow`).
  - `buildStageTask({ …, prompt?: string, skill?: { name: string; body: string } })` appends `## Zadání kroku\n<prompt>` and, with a skill, `## Skill /<name>\n<body>` after the existing handoff text.

- [ ] **Step 1: Tests** — schema: `prompt` on a tool phase → refine error; agent phase with `prompt` + `skill` → valid. `buildStageTask` with prompt + skill contains both sections in that order. Runner: an agent phase with `skill: "security-audit"` (external) passes the skill's folder in `grantDirs` and the skill body (via `externalSkillPrompt`) in `task`; an unknown `skill` id fails the stage with `Skill "<id>" not found` instead of running without it.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — runner does `skills.get(phase.skill)` (reuse injected `SkillsStorageService`), merges the external dir into `grantDirs`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(workflows): agent phase custom prompt with a /skill`

---

### Task 6: Uninstall with usage check

**Files:**
- Modify: `libs/contracts/src/skills/external-skills.contract.ts`
- Modify: `apps/api/src/external-skills/external-skills.service.ts`, `.controller.ts`
- Create: `apps/api/src/workflows/remove-phase.ts` (pure)
- Test: `apps/api/src/workflows/remove-phase.test.ts`, `external-skills.service.test.ts`, e2e

**Interfaces:**
- Consumes: `WorkflowsStorageService.list/update/delete`, Task 5 `phase.skill`.
- Produces:
  - `externalSkillUsages` GET `/skills/external/:id/usages` → 200 `{ workflowId, name, phaseIds: string[] }[]`
  - `uninstallExternalSkill` POST `/skills/external/:id/uninstall` `{ workflows: Record<workflowId, "workflow" | "step"> }` → 200 `{ id }` | 404 | 409 (a usage has no decision) | 422 (step removal leaves an invalid workflow — message names the workflow)
  - `removePhase(phases: WorkflowPhase[], id: string): WorkflowPhase[]` — drops the phase, the next phase inherits its `consumes`, and loop/back-edge references to it are removed.

- [ ] **Step 1: Tests** — `removePhase` on a 3-phase chain rewires `consumes`; on a phase that is a loop target drops that `loop`. Service: usages found by `phase.skill === id`; uninstall with a missing decision → 409 and nothing changed; `"workflow"` deletes it, `"step"` updates it; then folder + manifest record removed. Workflow changes are validated **before** anything is deleted, so a 422 leaves everything intact.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(external-skills): uninstall with workflow usage decisions`

---

### Task 7: Web — install, sync, read-only skill, uninstall

**Files:**
- Create: `apps/web/features/skills/queries/useExternalSkillUsagesQuery.ts`; `apps/web/features/skills/mutations/{useScanExternalSkillsMutation,useInstallExternalSkillsMutation,useSyncExternalSkillMutation,useSyncAllExternalSkillsMutation,useUninstallExternalSkillMutation}.ts` (+ index re-exports; all invalidate `getSkillsQueryKey()`)
- Create: `apps/web/features/skills/components/InstallExternalSkillDialog.tsx`, `UninstallExternalSkillDialog.tsx`, `ExternalSkillSource.tsx`
- Modify: `apps/web/features/registries/screens/RegistriesScreen.tsx` (`SkillsTable` ~l.148, header actions), `apps/web/features/skills/DetailScreen.tsx`, `apps/web/features/skills/components/SkillTile.tsx`
- Modify: `apps/web/i18n/messages/{cs,en}.json`
- Test: `apps/web/features/skills/components/*.test.tsx` (`--project web-components`)

**Interfaces:**
- Consumes: Task 2/3/6 routes, `Skill.source`.
- Produces: `ExternalSkillSource({ source }: ExternalSkillSourceProps)` — renders `owner`, last update (`updatedAt`, relative), and a "Dostupná aktualizace" badge when `latestSha && latestSha !== sha`, `lastError` as a warning line.

- [ ] **Step 1: Tests**
  - Install dialog: paste URL → "Načíst" calls scan → candidates render as checkboxes, a `conflict` one is disabled with a reason → "Instalovat" sends only checked paths → closes on 201; 400/422/502 show `apiErrorMessage`.
  - Skills table: an external row shows `cloudflare`, `security-audit`, last update; header has "Přidat z repozitáře" and "Synchronizovat vše" (the latter shows a toast with `updated`/`failed` counts).
  - Detail of an external skill: fields read-only (no Save), "Zkontrolovat aktualizace" calls sync, "Odinstalovat" opens the uninstall dialog.
  - Uninstall dialog: no usages → plain confirm; with usages → one row per workflow with a required choice "Smazat celý workflow" / "Odebrat jen krok"; submit disabled until each row is decided; "Zrušit" sends nothing.
- [ ] **Step 2: Run, verify FAIL** — `pnpm exec vitest run apps/web/features/skills --project web-components`
- [ ] **Step 3: Implement** — dialogs follow `ConnectMarketplaceDialog` (DS `Dialog`, `TextInputField`); page actions sit top-right per the interaction grammar.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(web): install, sync and uninstall external skills`

---

### Task 8: Web — agent phase prompt with `/` skill

**Files:**
- Modify: `apps/web/features/tasks/components/CommandLine/CommandLine.tsx` (add `initialSkill`)
- Modify: `apps/web/features/workflows/components/WorkflowDialog/{workflow-graph.ts,StepSettings.tsx}`
- Modify: `apps/web/i18n/messages/{cs,en}.json`
- Test: `workflow-graph.test.ts`, `StepSettings.test.tsx`, `CommandLine.test.tsx`

**Interfaces:**
- Consumes: Task 5 `phase.prompt`, `phase.skill`.
- Produces:
  - `CommandLineProps.initialSkill?: { id: string; name: string }` — seeds the `/` tag the same way `initialTarget` seeds `@`.
  - `GraphNode.prompt?: string`, `GraphNode.skill?: string`, round-tripped by `phasesToGraph` / `graphToPhases`.

- [ ] **Step 1: Tests** — graph round-trip keeps `prompt` + `skill`; `StepSettings` renders a `CommandLine` (`chrome={false}`, `allowSkillMentions`, no `@`/`#`/attach) for an agent step only; typing text patches `prompt`; picking `/security-audit` patches `skill`; deleting the `/Name` token clears `skill`; reopening a saved step shows the text with the skill tag (`initialSkill`).
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** — `onSubmit` is a no-op with `resetOnSubmit={false}`. Shift+Enter is a newline, the same as in chat. Empty text saves `prompt: undefined`.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** — `feat(web): custom prompt with /skill on agent workflow steps`

---

### Task 9: Hand-off checks

- [ ] `pnpm check:types`, `pnpm check:lint`, `pnpm test` (expect the known nondeterministic e2e, see memory), `graphify update .`
- [ ] Manual: install `https://github.com/cloudflare/security-audit-skill` via the UI → skill in the library → add it to an agent step of the security-audit workflow → run → the stage log shows the skill folder read (e.g. `HUNTING.md`).
- [ ] Update the vault feature MOC if the private-repo note needs new facts learned here.

## Known ceilings

- One `/skill` per agent step (the composer tracks one skill tag). Several skills per step can come later if needed.
- Sync compares the git tree hash of the skill folder, so a commit that touches other files in the repo does not count as an update.
- Chat stays prompt-only for every skill, external ones included: it gets the folder note but has no tools, so it cannot read references or run scripts.
