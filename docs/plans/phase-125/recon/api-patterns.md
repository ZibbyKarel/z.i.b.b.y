# Recon — contracts + API + file-storage + attachments (phase 125)

Reference gathered before implementation. Line numbers are as-of the recon commit; treat
them as pointers, not guarantees.

---

## 0. The repo's own checklist

`libs/contracts/README.md:91-116` — "How to add a whole new resource":

1. Contract — `src/<name>/` with `<name>.schema.ts` + `<name>.contract.ts`
   (`c.router({...}, { pathPrefix: "/api", strictStatusCodes: true })`), exported from `src/index.ts`
2. Controller — `apps/api/src/<name>/<name>.controller.ts`, `@Controller()` with one
   `@TsRestHandler(<name>Contract)` returning `tsRestHandler(<name>Contract, {...})`
3. Module — `apps/api/src/<name>/<name>.module.ts`, then register in `app.module.ts` imports
4. Docs — add the contract to `apiContract` in `apps/api/src/main.ts` (OpenAPI at `/docs`)
5. Tests — contract test in `libs/contracts` + e2e in `apps/api/test/`

Path alias: `tsconfig.base.json:24` → `"@zibby/contracts": ["libs/contracts/src/index.ts"]`.

---

## 1. Contracts

### Schema file shape

Every schema is exported alongside its inferred type, always as a pair:

```ts
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";

export const HealthSchema = z.object({ /* … */ });
export type Health = z.infer<typeof HealthSchema>;
```

Id schemas get their own exported schema + regex (`agents/agent.schema.ts:13-19`):

```ts
export const AGENT_ID_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
export const AgentIdSchema = z
  .string().min(1).max(128)
  .regex(AGENT_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");
```

`ProjectIdSchema` is literally `AgentIdSchema` (`projects/project.schema.ts:11`).
Create/Update inputs live in the same schema file, separate from the entity
(`memory/memory.schema.ts:151-174`): `CreateNoteSchema` / `CreateNoteInput`,
`UpdateNoteSchema` / `UpdateNoteInput`.

### Shared primitives — `libs/contracts/src/common.schema.ts`

| Export | Line | Shape |
|---|---|---|
| `ErrorSchema` | 9 | `{ message: string }` — every 4xx |
| `IsoDateTimeSchema` | 18 | `z.string().datetime()` — the **only** timestamp shape |
| `DeleteResponseSchema` | 91 | `{ id: string }` — every `deleteX` 200 body |
| `EmptyBodySchema` | 101 | `z.object({}).optional()` — action routes with no input |

Also `RunArtifactSchema`, `AvatarSchema`, `WorkspaceSchema`, `RunStatusSchema`, `RiskSchema`.

### Contract file shape

```ts
import { initContract } from "@ts-rest/core";
const c = initContract();

export const healthContract = c.router(
  {
    getHealth: {
      method: "GET",
      path: "/health",
      responses: { 200: HealthSchema },
      summary: "Liveness probe — reports the API is up",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type HealthContract = typeof healthContract;
```

CRUD reference: `agents/agents.contract.ts:14-92` — `createAgent` (201/409/422),
`listAgents`, `searchAgents`, `getAgent`, `updateAgent`, `deleteAgent`.

**Route ordering is load-bearing** — static segments must be declared before `:param`
routes, or `/agents/search` gets captured by `/agents/:id` (comment at
`agents.contract.ts:40-41`).

Two path params (exactly the `<projectId>/<itemId>` case) —
`projects/projects.contract.ts:157-173`:

```ts
mergeProjectPr: {
  method: "POST",
  path: "/projects/:id/prs/:number/merge",
  pathParams: z.object({ id: ProjectIdSchema, number: z.coerce.number().int() }),
  body: MergeProjectPrBodySchema.optional(),
  responses: { 200: MergeProjectPrResultSchema, 404: ErrorSchema, 409: ErrorSchema, 422: ErrorSchema },
  summary: "…",
},
```

### Aggregation — three files, all must be edited

1. `libs/contracts/src/index.ts` — flat barrel, schema then contract, **before** the final
   `export * from "./app.contract";`
2. `libs/contracts/src/app.contract.ts:47-97` — add `roadmap: roadmapContract` to `appContract`
   (consumed by `apps/web/state/api.ts:22` → `initTsrReactQuery(appContract, …)`)
3. `apps/api/src/main.ts:31-45` — a separate hand-maintained `apiContract` router for the
   OpenAPI doc at `/docs`

---

## 2. API module

### Controller

Only two imports are ever used: `TsRestHandler` (method decorator) and `tsRestHandler`.
`@Controller()` takes **no path argument** — the contract's `pathPrefix: "/api"` owns the URL.

```ts
@Controller()
export class PinsController {
  constructor(private readonly pins: PinsStore) {}

  @TsRestHandler(pinsContract)
  handler() {
    return tsRestHandler(pinsContract, {
      getPins: async () => ({ status: 200, body: await this.pins.read() }),
      putPins: async ({ body }) => ({ status: 200, body: await this.pins.write(body) }),
    });
  }
}
```

CRUD + error mapper (`agents/agents.controller.ts`):

```ts
const errors = makeErrorMapper("Agent", {
  missing: [AgentNotFoundError, InvalidAgentIdError],
  conflict: [AgentConflictError],
});
const unprocessable = (message: string) => ({ status: 422 as const, body: { message } });

// …
getAgent: ({ params: { id } }) => errors.or404(id, () => this.storage.get(id)),
updateAgent: ({ params: { id }, body }) => errors.or404(id, () => this.storage.update(id, body)),
deleteAgent: ({ params: { id } }) =>
  errors.or404(id, async () => { await this.storage.delete(id); return { id }; }),
createAgent: ({ body }) => errors.created(() => this.storage.create(body)),
```

Multi-param destructuring: `projects.controller.ts:185` →
`mergeProjectPr: async ({ params: { id, number }, body }) => {`.

Serving only a **subset** of a contract (needed when a route is multipart/binary and ts-rest
can't own it) — `tasks/tasks.controller.ts:43-54` builds a `scheduledTaskRoutes` object and
passes that to `@TsRestHandler`.

### `makeErrorMapper` — `apps/api/src/shared/http/error-mapping.ts`

```ts
export interface ErrorMapperOptions {
  missing: ErrorCtor[];    // NotFound + InvalidId → 404
  conflict?: ErrorCtor[];  // → 409 on create
}
export function makeErrorMapper(entity: string, opts: ErrorMapperOptions): {
  isMissing(error: unknown): boolean;
  notFound(id: string): { status: 404; body: { message: string } };
  or404<T, E = never>(id: string, fn: () => Promise<T>, extra?: (e: unknown) => E | undefined):
    Promise<{ status: 200; body: T } | { status: 404; body: { message: string } } | E>;
  created<T, E = never>(fn: () => Promise<T>, extra?: (e: unknown) => E | undefined):
    Promise<{ status: 201; body: T } | { status: 409; body: { message: string } } | E>;
};
```

404 message format: `` `${entity} "${id}" not found` ``.

### Domain errors — `apps/api/src/<name>/<name>.errors.ts`

Four-class template (`agents/agents.errors.ts`): `XNotFoundError`, `XConflictError`,
`InvalidXIdError`, `CorruptXFileError` — each sets `this.name` and keeps the id as a
`public readonly` field.

### Module

```ts
export function resolvePinsFile(): string {
  return process.env.PINS_FILE ?? dataDir("pins.json");
}

@Module({
  controllers: [PinsController],
  providers: [{ provide: PINS_FILE, useFactory: resolvePinsFile }, PinsStore],
})
export class PinsModule {}
```

Convention: `process.env.<RESOURCE>_DIR ?? dataDir("<resource>")`. For roadmap:
`process.env.ROADMAP_DIR ?? dataDir("roadmap")`.

**Controller declaration order inside `controllers: []` decides route-matching order**
(`agents.module.ts` declares Categories/AgentRuns/Gates before Agents so their static routes
beat `GET /agents/:id`).

Then register in `apps/api/src/app.module.ts` — import block (lines 3-45) + `imports: [...]`
(lines 48-99).

---

## 3. File storage

Barrel: `apps/api/src/shared/file-storage/index.ts` — import relatively
(`import { … } from "../shared/file-storage"`); there is no `@zibby/api` alias.

### `file-utils.ts` signatures

```ts
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException
export function safeJson(raw: string): unknown                                   // null on malformed
export async function ensureDir(dir: string): Promise<void>
export async function fileExists(file: string): Promise<boolean>
export async function writeFileAtomic(file: string, content: string | Buffer): Promise<void>
export function resolveSafeFile(dir: string, id: string, ext: string, idRegex: RegExp): string | null
export function collisionResistantId(prefix: string): string                     // `<prefix>_<ms>_<hex>`
```

`writeFileAtomic` = temp file + rename, temp cleaned up on failure.
`resolveSafeFile` applies **two** independent guards (regex, then
`path.dirname(file) !== dir`); `ext: ""` makes it resolve a *directory*.

`withPathLock<T>(key: string, fn: () => Promise<T>): Promise<T>` — per-key FIFO in-process
serialization, **reentrant** via `AsyncLocalStorage`, not cross-process. Never re-enter the
same key from detached/unawaited work.

### `EntityFileStore<T>` — flat-dir only

Abstract members a subclass supplies: `fileExt`, `idRegex`, `idOf`, `serialize`, `tryParse`,
`compare`, `notFound`, `invalidId` (+ optional `corruptError`). Provided:
`parseJson`, `ensureDir`, `onModuleInit`, `resolveFile`, `fileExists`, `writeEntity`,
`updateEntity` (atomic RMW), `createEntity` (null on duplicate), `get`, `list` (skips corrupt
files), `delete`.

### ⭐ Two-level `<root>/<key>/<id>.json` — the exact roadmap precedent

`apps/api/src/channels/channel-item.store.ts`. `EntityFileStore` is flat-dir only, so
**copy `ChannelItemStore`, not `EntityFileStore`**, for `roadmap/<projectId>/<itemId>.json`.

Resolution is **two steps** — a single-step resolve against the root would be a traversal hole:

```ts
private integrationDir(integrationId: string): string | null {
  // ext "" → the path IS the directory; containment (dirname === root) still applies.
  return resolveSafeFile(this.root, integrationId, "", AGENT_ID_REGEX);
}
private itemFile(integrationId: string, itemId: string): string | null {
  const dir = this.integrationDir(integrationId);
  if (dir === null) return null;
  return resolveSafeFile(dir, itemId, ".json", AGENT_ID_REGEX);
}
```

Listing enumerates directories via `fs.readdir(this.root, { withFileTypes: true })` filtered
to `isDirectory()`, tolerates unreadable files (`.catch(() => [])`), and `safeParse`s each.

### Data root — `apps/api/src/shared/data-dir.ts`

`resolveDataRoot()`, `dataDir(...segments)`, `installRoot()`, `defaultCloneRoot()`.
`ZIBBY_DATA_DIR` wins; **under `VITEST` with no `ZIBBY_DATA_DIR` it throws on purpose**.

---

## 4. Attachments

`AttachmentSchema` (`tasks/task.schema.ts:8-18`): `{ name, size, mediaType? }`.

`AttachmentStorageService` (`apps/api/src/tasks/attachment-storage.service.ts`), provided and
exported by `TasksModule`:

```ts
interface UploadedFile { originalname: string; size: number; mimetype?: string; buffer: Buffer }

newSetId(): string                       // `set_<ms36>_<hex>`
dir(setId: string): string               // <dataRoot>/tasks/attachments/<setId>/
save(files: UploadedFile[]): Promise<{ attachmentSetId: string; files: Attachment[] }>
list(setId: string): Promise<Attachment[]>          // [] when missing
remove(setId: string): Promise<void>
listSetIds(): Promise<{ id: string; mtimeMs: number }[]>
```

`save()` is the sanctioned path to create a set + write bytes — an `Express.Multer.File`
structurally satisfies `UploadedFile`, and so does a hand-built
`{ originalname, size, mimetype, buffer }`. Sets are **never** per-project; always
`<dataRoot>/tasks/attachments/<setId>/`, root resolved lazily per call.

### ⚠️ Orphan sweep — the trap

`TaskSchedulerService.sweepOrphanAttachmentSets` (`task-scheduler.service.ts:545-567`, called
fire-and-forget from `tick()`) deletes any set not claimed by a task or a registered
`AttachmentSetRefProvider` once past `ATTACHMENT_TTL_MS`. **A roadmap item referencing an
`attachmentSetId` MUST contribute a provider or its files get reaped.**

### Registering a provider — there is no `multi: true`

Token + interface (`apps/api/src/tasks/attachment-set-ref-provider.ts:18-23`):

```ts
export const ATTACHMENT_SET_REF_PROVIDER = "ATTACHMENT_SET_REF_PROVIDER";
export interface AttachmentSetRefProvider { referencedSetIds(): Promise<string[]>; }
```

NestJS has no Angular-style `multi: true`, so the registry is a `@Global()` module whose
factory assembles the **array** — `apps/api/src/tasks/attachment-set-refs.module.ts`:

```ts
@Global()
@Module({
  imports: [AutomationsModule],
  providers: [
    AutomationAttachmentRefProvider,
    {
      provide: ATTACHMENT_SET_REF_PROVIDER,
      useFactory: (automationRefs: AutomationAttachmentRefProvider): AttachmentSetRefProvider[] => [
        automationRefs,
      ],
      inject: [AutomationAttachmentRefProvider],
    },
  ],
  exports: [ATTACHMENT_SET_REF_PROVIDER],
})
export class AttachmentSetRefsModule {}
```

A second contributor is added **to this same factory's array + `inject`** — a second
`provide: ATTACHMENT_SET_REF_PROVIDER` entry would just shadow the first.

Contributor class shape (`automations/automation-attachment-ref.provider.ts`): `@Injectable()`
implementing `AttachmentSetRefProvider`, `referencedSetIds()` lists the store and collects ids.

---

## 5. Testing

### Runners

`vitest.workspace.ts` lists 6 project configs. `apps/api/vitest.config.ts`: `name: "api"`,
node env, `globals: true`, `include: ["src/**/*.test.ts", "test/**/*.test.ts"]`,
30 s timeouts, **`unplugin-swc` is required** (esbuild does not emit
`emitDecoratorMetadata`, so NestJS DI breaks without it).
`libs/contracts/vitest.config.ts`: `name: "contracts"`, `include: ["src/**/*.test.ts"]`.

Run: `pnpm exec vitest run --project api` / `--project contracts`.

### Naming

- Unit tests co-located: `apps/api/src/<mod>/<thing>.test.ts`
- e2e: `apps/api/test/<name>.e2e.test.ts`
- Contract tests: `libs/contracts/src/<name>/<name>.contract.test.ts`

### Setup — `apps/api/vitest.setup.ts`

Runs once per forked test file. Sets (overridably) `ZIBBY_DATA_DIR` → fresh `mkdtempSync`
seeded from `apps/api/data-test`, plus `ZIBBY_WORKTREE_ROOT`, `SYSTEM_CONFIG_FILE`,
`CHANNEL_FAKE_DIR`, `AGENT_RUNNER_MODE=demo`, `CLAUDE_BIN` → `test/fixtures/fake-claude.mjs`,
`ACTIVITY_DIR`. Volatile segments never copied: `runs, goals, tasks, activity, approvals,
channels, proposals, credentials, budget-ledger`.

### Store unit test template

`mkdtemp` in `beforeEach`, `fs.rm` in `afterEach`, construct the store directly with the temp
dir, call `onModuleInit()` explicitly (Nest isn't booting), assert by reading the file back
and with `rejects.toBeInstanceOf(XConflictError)`.

### Controller unit test

`Test.createTestingModule({ controllers: [X], providers: [{ provide: Dep, useValue: mock }] })`
→ `createNestApplication()` → `supertest(app.getHttpServer())`.

### e2e

`Test.createTestingModule({ imports: [AppModule] })`, with `process.env.ROADMAP_DIR` set to a
temp dir **before** compiling, and `delete process.env.…` in teardown.

---

## 6. Concrete file list for the roadmap resource

| File | Model on |
|---|---|
| `libs/contracts/src/roadmap/roadmap-item.schema.ts` | `memory/memory.schema.ts` |
| `libs/contracts/src/roadmap/level-mapping.schema.ts` | same |
| `libs/contracts/src/roadmap/roadmap.contract.ts` | `agents/agents.contract.ts` + `projects.contract.ts:157` |
| `libs/contracts/src/roadmap/roadmap.contract.test.ts` | `health/health.contract.test.ts` |
| edit `libs/contracts/src/index.ts` | 2 `export *` lines before `./app.contract` |
| edit `libs/contracts/src/app.contract.ts` | add `roadmap: roadmapContract` |
| edit `apps/api/src/main.ts` | add `roadmap: roadmapContract` to `apiContract` |
| `apps/api/src/roadmap/roadmap.errors.ts` | `agents/agents.errors.ts` |
| `apps/api/src/roadmap/roadmap.store.ts` | **`channels/channel-item.store.ts`** |
| `apps/api/src/roadmap/roadmap.controller.ts` | `agents/agents.controller.ts` |
| `apps/api/src/roadmap/roadmap.module.ts` | `pins/pins.module.ts` |
| edit `apps/api/src/app.module.ts` | import + `imports: [...]` |
| edit `tools/docs-sync/manifest.mjs` + new `docs/api/roadmap.md` | blocking pre-commit gate |
| `apps/api/src/roadmap/roadmap.store.test.ts` | `pins/pins.store.test.ts` |
| `apps/api/test/roadmap.e2e.test.ts` | `test/health.e2e.test.ts` |
| `apps/api/src/roadmap/roadmap-attachment-ref.provider.ts` + edit `tasks/attachment-set-refs.module.ts` | `automations/automation-attachment-ref.provider.ts` |
