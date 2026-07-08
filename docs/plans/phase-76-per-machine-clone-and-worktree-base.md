# Phase 76 — Per-machine clone root, project git remote, local-clone resolution + worktree base (backend)

> Starts TODO item 4 (the big multi-machine project item). This phase covers **backend +
> contracts** for its points **1** (per-machine clone root setting), **2** (missing-clone
> detection + clone action + `gitRemote` field) and **4** (worktree cut from `origin/<default>`).
> Points **2-UI/settings-UI** land in phase 77; point **3** (PR overview + merge) in phase 78.

## Model decision — canonical `path` stays; a per-machine resolution layer is added

`Project.path` is the canonical target dir in the SYNCED registry (`_projects.json`). We do NOT
make it machine-specific (that would desync). Instead:

- Add a **machine-local** `cloneRoot` setting (NOT in `_projects.json`, NOT committed/synced).
- Add a canonical `gitRemote` URL to the project (synced — the clone source is the same
  everywhere).
- Add a **local-path resolver**: on THIS machine a project's effective working dir is
  `project.path` if it exists and is a git repo; else `<cloneRoot>/<project.id>` if that exists
  and is a git repo; else **absent → needs clone**. This keeps `path` canonical while letting
  each machine resolve or clone locally.

## 1 — Contracts

`libs/contracts/src/projects/project.schema.ts`:
- Add `gitRemote: z.string().min(1).optional()` to `ProjectSchema` (a clone URL —
  `https://…` or `git@…`; keep it a plain non-empty string, don't over-validate). It flows
  through `CreateProjectSchema` (already omits only `hasSecrets`) and `UpdateProjectSchema`
  (already `.partial()`), so no extra wiring — just confirm both accept it. Round-trip test.
- Add a `ProjectLocalStateSchema` = `{ present: boolean, isGitRepo: boolean, resolvedPath: z.string().nullable(), source: z.enum(["path","cloneRoot","none"]), cloneRoot: z.string() }`
  describing THIS machine's view. Export from the projects barrel.

New machine-config contract — reuse the existing `machine` resource
(`libs/contracts/src/machine/machine.contract.ts` + `machine.schema.ts`):
- `MachineConfigSchema = z.object({ cloneRoot: z.string().min(1) }).strict()` (extensible later).
- `UpdateMachineConfigSchema = MachineConfigSchema.partial()`.
- Routes on the machine contract:
  - `getMachineConfig: GET /machine/config → 200: MachineConfigSchema`
  - `updateMachineConfig: PUT /machine/config` body `UpdateMachineConfigSchema` → `200: MachineConfigSchema`
- Contract tests (round-trip + the two routes typecheck).

Projects contract (`projects.contract.ts`):
- `getProjectLocalState: GET /projects/:id/local-state → 200: ProjectLocalStateSchema, 404: ErrorSchema`
- `cloneProject: POST /projects/:id/clone → 200: ProjectLocalStateSchema, 404, 409` (409 when
  already present, or 422 `ErrorSchema` when the project has no `gitRemote`). Choose 422 for
  "no gitRemote", 409 for "already cloned"; document in the route.

## 2 — Machine-local config store + service

`apps/api/src/machine/machine-config.store.ts` (+ test): a tiny JSON store at
`dataDir("machine", "config.json")` (a new DI token `MACHINE_CONFIG_FILE`, defaulting via a
factory in `machine.module.ts`, overridable by env for tests — mirror `MACHINE_ACTIONS_DIR`).
- `read(): Promise<MachineConfig>` — parse the file; if missing/invalid, return the DEFAULT:
  `{ cloneRoot: defaultCloneRoot() }`.
- `write(patch): Promise<MachineConfig>` — merge patch over current, atomic `writeFileAtomic`.
- `defaultCloneRoot()` = the parent folder of the ZIBBY install root. The install root is the
  repo root = `resolveDataRoot()`'s grandparent (`.zibby/data` → up two). So
  `path.resolve(resolveDataRoot(), "..", "..", "..")` is the parent of the repo root. Add a
  small helper in `shared/data-dir.ts`: `export function installRoot()` = `path.resolve(resolveDataRoot(), "..", "..")` (the repo root, parent of `.zibby`), and `defaultCloneRoot = path.resolve(installRoot(), "..")`. Unit-test `installRoot`/`defaultCloneRoot` shape.
- **Gitignore** the config: add `.zibby/data/machine/config.json` to `.gitignore` (it is
  per-machine, must never be committed/synced). Verify the machine dir's existing ignore rules.

Add `getConfig`/`updateConfig` to `MachineService` (or a thin `MachineConfigService`) delegating
to the store, and controller handlers in `machine.controller.ts` for the two new routes.

## 3 — Local-clone resolution + clone action (projects)

New `apps/api/src/projects/project-local.service.ts` (+ test). Injects
`WorkspaceService` (for `isGitRepo`) and the machine-config store:
- `async resolve(project): Promise<ProjectLocalState>` — check `project.path` (exists +
  `isGitRepo`) → `{present:true,isGitRepo:true,resolvedPath:path,source:"path",cloneRoot}`; else
  the `<cloneRoot>/<project.id>` candidate the same way (`source:"cloneRoot"`); else
  `{present:false,isGitRepo:false,resolvedPath:null,source:"none",cloneRoot}`. Use `fs.stat` for
  existence; tolerate ENOENT.
- `async clone(project): Promise<ProjectLocalState>` — reject (throw a typed error → 422) if no
  `gitRemote`; reject (→409) if `resolve()` already reports present. Else `git clone <gitRemote>
  <cloneRoot>/<project.id>` (via `execFile`, bounded timeout; `ensureDir(cloneRoot)` first), then
  return the fresh `resolve()`. NEVER touch `project.path` or the registry — the clone is a local
  side effect. Add a `WorkspaceService.clone(remote, dir)` helper (git clone, timeout, throws
  `WorkspaceSetupError` on failure) and call it from here so all git lives in one service.
- Controller: `getProjectLocalState` (load project → 404, return `resolve`), `cloneProject`
  (load → 404, `clone`, map typed errors to 422/409). Wire the service into `ProjectsModule`
  (it needs `WorkspaceModule` — add the import; watch for cycles, none expected).

## 4 — `createWorktree`: fetch origin, cut from `origin/<default-branch>` (point 4)

`apps/api/src/workspace/workspace.service.ts` `createWorktree`:
- Change the signature so the caller passes the RESOLVED local path (it already passes
  `projectPath`; the caller — the runner — must now resolve via `ProjectLocalService` first, and
  if `absent && gitRemote` present, clone first, per point 4; if absent and no remote, fail with a
  clear `WorkspaceSetupError`). Find the caller (grep `createWorktree(` — likely the runner
  service) and thread the resolution/clone-if-missing there, OR give `createWorktree` an optional
  `gitRemote` and have it resolve+clone internally. **Prefer** resolving in the runner (keep
  `createWorktree` git-only) — but the minimum for THIS phase is the fetch-origin base change;
  clone-if-missing can be wired where the run is dispatched. Document which you chose.
- Inside `createWorktree`, BEFORE cutting: `git fetch origin` (bounded, longer timeout — network;
  raise a dedicated `GIT_FETCH_TIMEOUT_MS` ~60s). Determine the default branch:
  `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` → strip `origin/`; fallback to
  `git remote show origin` parse, final fallback `main`. Set `base = origin/<default>`.
- `baseRef` = `git rev-parse <base>` (the origin tip sha, NOT local HEAD).
- `git worktree add -b <branch> <dir> <base>` — cut from the origin ref. This does NOT modify the
  operator's checkout/branch (no `checkout`/`reset`; worktree add is isolated). Keep the existing
  `WorkspaceSetupError` wrapping.
- If `git fetch` fails (offline), degrade gracefully: log a warning and fall back to local `HEAD`
  (so an offline machine still runs), rather than failing the run. Note this in the code comment.
- Update `workspace.service.test.ts`: assert fetch is invoked and the worktree is cut from
  `origin/<default>` (mock `execFile`); assert offline fallback to HEAD; assert the operator's
  checkout is never `checkout`/`reset`.

## Files

- `libs/contracts/src/projects/project.schema.ts`, `projects.contract.ts`, barrel + tests
- `libs/contracts/src/machine/machine.schema.ts`, `machine.contract.ts`, barrel + tests
- `apps/api/src/shared/data-dir.ts` (installRoot/defaultCloneRoot) + test
- `apps/api/src/machine/machine-config.store.ts` (+ test), `machine.module.ts`, `machine.controller.ts`, `machine.service.ts`
- `apps/api/src/projects/project-local.service.ts` (+ test), `projects.controller.ts`, `projects.module.ts`
- `apps/api/src/workspace/workspace.service.ts` (+ test) — clone helper + fetch-origin base
- the run-dispatch caller of `createWorktree` (resolve/clone-if-missing) — grep it
- `.gitignore` — ignore `.zibby/data/machine/config.json`

## Tests (must add/extend)

- Contract round-trips for `gitRemote`, `ProjectLocalStateSchema`, `MachineConfigSchema`.
- `machine-config.store`: default cloneRoot when file absent; write→read round-trip; atomic.
- `project-local.service`: present-at-path; present-at-cloneRoot; absent; clone rejects without
  gitRemote (422) and when present (409); clone runs `git clone` into `<cloneRoot>/<id>` (mock
  WorkspaceService.clone).
- `workspace.service`: fetch-origin + cut-from-origin base; offline fallback; no checkout/reset.
- Controller/e2e for the four new routes (machine config GET/PUT, project local-state, clone) —
  mirror an existing controller test (e.g. the projects controller tests).

## Verification (run, paste real output; `rtk` unavailable → plain npx)

- `npx tsc -p libs/contracts/tsconfig.json --noEmit` / `-p apps/api/tsconfig.json` (only the 2
  known pre-existing machine.service errors — and if your change touches machine.service, make
  sure you don't add new ones).
- `npx eslint <touched files>` — clean.
- `npx vitest run libs/contracts apps/api/src/machine apps/api/src/projects apps/api/src/workspace`
  — green modulo documented pre-existing reds (self-knowledge drift; pipelines.e2e; the
  root-user chmod produces test). Any NEW red is yours.

## Constraints

- Contract-first (contract → api). No web changes in this phase.
- No `any`; strict TS; atomic writes; bounded git timeouts; fetch is the ONLY network git call
  and must degrade gracefully offline.
- Law 1/3 respected: cloning and fetching are safe reads/creates; NEVER `checkout`/`reset`/`push`
  the operator's main working tree; the worktree stays isolated. `path`/registry never mutated by
  a local clone.
