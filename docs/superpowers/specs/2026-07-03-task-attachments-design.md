# Task attachments — design

**Date:** 2026-07-03
**Status:** approved (brainstorming) — pending implementation plan

## Goal

Let the operator attach files in the **New Task dialog**. The attached files are
uploaded from the operator's machine, persisted durably on disk, and made available
to the agent / pipeline / orchestrator / loop that handles the task — as **reference
material the run can read**, not inlined into the prompt.

## Decisions (and why)

1. **Reuse the existing `paths → resolveGrantDirs → --add-dir` seam.** Attachments
   land in a durable dir; the run gets that dir as an `--add-dir` grant plus a prompt
   line naming the files. Content is **not** inlined into the prompt — that scales to
   PDFs / images / large data and keeps argv + tokens bounded (the API already spills
   the system prompt to a file to avoid `spawn E2BIG`).

2. **Two-step upload, referenced by an attachment *set* (no move).**
   - Step 1: on file-select, the web uploads to `POST /api/tasks/attachments`
     (multipart). The backend writes the bytes to `data/tasks/attachments/<setId>/`
     and returns `{ attachmentSetId, files: Attachment[] }`.
   - Step 2: `createTask` carries `attachmentSetId` in its JSON body. The task record
     just **references** the set — the files are never moved or copied.

   Chosen over a single multipart `createTask` because it gives an immediate list
   (name + size + remove) and early size/count validation **before** submit, and it
   works for a scheduled task (upload now, dispatch hours later — the set is already
   durable). Cost: **orphaned sets** (operator attaches, then closes the dialog
   without submitting) → a cleanup sweep removes attachment sets older than a TTL that
   no persisted task references.

   Chosen over client-generated task ids (the `makeGoalId` precedent) because it keeps
   task-id generation server-owned and untouched; the set id is the only new id.

3. **Durable + visible.** The task record stores the attachment metadata list, so the
   task/run detail can show the attachments after dispatch (files = source of truth).

4. **Attachments are a separate concept from work-paths.** They are threaded to the
   run **distinctly** from `paths` — never allowed to become `grantDirs[0]` (which the
   agent-runner turns into *"Operate on this directory: …"*). They get their own
   `--add-dir` grant and their own prompt line.

## Contract (`libs/contracts`, source of truth)

`libs/contracts/src/tasks/task.schema.ts`:

```ts
export const AttachmentSchema = z.object({
  name: z.string().min(1),        // original filename (basename only, sanitized)
  size: z.number().int().nonnegative(),
  mediaType: z.string().optional(), // browser-reported MIME, best-effort
});
export type Attachment = z.infer<typeof AttachmentSchema>;
```

- `CreateTaskInputSchema` — add `attachmentSetId: z.string().optional()`.
- `ScheduledTaskSchema` — add `attachmentSetId: z.string().optional()` and
  `attachments: z.array(AttachmentSchema).default([])` (the durable, displayable list).

`libs/contracts/src/tasks/tasks.contract.ts` — new route:

```ts
uploadTaskAttachments: {
  method: "POST",
  path: "/tasks/attachments",
  contentType: "multipart/form-data",
  body: c.type<{ files: File[] }>(),   // bytes handled by multer, not zod
  responses: {
    201: z.object({ attachmentSetId: z.string(), files: z.array(AttachmentSchema) }),
    413: ErrorSchema,   // over a size/count limit
    422: ErrorSchema,
  },
  summary: "Upload files as a durable attachment set a task can reference",
}
```

## Backend (`apps/api`)

### Upload endpoint

- Implemented on the tasks controller as a ts-rest handler, with
  `@UseInterceptors(FilesInterceptor("files", MAX_FILES, { limits: … }))` from
  `@nestjs/platform-express` (multer) doing the actual byte parsing. ts-rest 3.53
  supports `contentType: "multipart/form-data"`; the file part degrades to raw
  multer handling (zod does not validate bytes server-side).
- **Hard limits at the multer layer — non-negotiable** (unbounded reads previously
  caused an API OOM; see `project_api_oom_readlog`). Defaults:
  - max **10 MB** per file (`limits.fileSize`),
  - max **20 files** per set (`FilesInterceptor` count),
  - max **50 MB** total per set (checked across the parsed files; reject with 413).
  - No file-type restriction (single operator, local machine).
- Sanitize each filename to its basename (strip any path separators / `..`) before
  writing, to keep the write inside `data/tasks/attachments/<setId>/`.
- `setId` is a server-generated opaque id. Write files under
  `data/tasks/attachments/<setId>/` (a new `AttachmentStorageService`, sibling to
  `scheduled-tasks.storage.service.ts`, rooted via `dataDir("tasks","attachments")`).
- Return the `Attachment[]` metadata (name, size, mediaType).

### Threading into dispatch

- On `createTask`, if `attachmentSetId` is present, resolve the set, copy its
  `Attachment[]` onto the persisted `ScheduledTask` (`attachments`, `attachmentSetId`).
- Thread a dedicated optional `attachments?: { dir: string; names: string[] }` param
  through the launch chain — **separate** from `files`/`paths` so it never lands as
  `grantDirs[0]` (the agent-runner turns `grantDirs[0]` into *"Operate on this
  directory: …"*, which must stay the work target, not the attachments folder):
  - `agent-runner.service.ts`: `start()`, `startOrchestrator()`, `launch()`,
    `buildCommand()`.
  - `goal-runner.service.ts`: `start()` → `drive()` → `dispatchMaker()` →
    `agentRunner.start()`, so a **loop/goal** maker's agent iterations get it too
    (`files` already flows this chain; the new param rides alongside).
  - The scheduler's `dispatch()` builds the `attachments` object from the task's
    `attachmentSetId` and passes it to `agentRunner.start` / `startOrchestrator` /
    `goalRunner.start`.
- In `buildCommand()`: compute the **absolute** dir `data/tasks/attachments/<setId>/`,
  grant it via `--add-dir` **in addition to** the work `grantDirs`, and append a
  prompt line listing **filenames**, not just the dir:
  `Operator attached reference files in <dir>: spec.pdf, data.csv, shot.png`.
  Assert the dir is absolute — a relative path is silently dropped by the grant
  resolver and would grant nothing while the prompt still claims the dir exists.

### Pipeline target — deferred (documented)

A **pipeline**-routed task (`target.kind === "pipeline"`) does not receive
attachments in v1. `pipelineRunner.start(id, taskId, projectId, matchedTerms, …)`
takes neither the free text nor `paths` — pipeline stage prompts come from the
pipeline definition — so there is no existing seam to grant the dir or inject the
manifest. Wiring it needs new plumbing into the pipeline runner and each stage's
prompt, a materially larger change. **Not silent:** attachments are still uploaded,
stored, and shown in the task/run detail for a pipeline-routed task; only the run's
`--add-dir` grant + manifest are absent. Follow-up spec.

### Cleanup

- A bounded sweep (reuse the scheduler tick or a small periodic hook) deletes
  attachment-set dirs whose `setId` is referenced by **no** persisted task and whose
  mtime is older than a TTL (default **24 h**). Best-effort, never throws.

## Web (`apps/web/features/tasks`)

- **`TaskAttachments`** composite in the composer:
  - Uses the existing DS **`DropZone`** for the drop / click-to-pick affordance
    (`onDrop(File[])`, `maxSize`, `multiple`), plus a rejection message on
    `onDropRejected`.
  - Renders a list of **`FilePreview`** rows (new DS component, below), one per
    attached file, each with a remove action.
  - Manages upload state: on drop, upload via `useUploadTaskAttachmentsMutation`
    (FormData), show per-set busy/error, hold the returned `attachmentSetId` + list.
    Remove clears the pending set (and, if already uploaded, best-effort deletes it).
- **`useUploadTaskAttachmentsMutation`** in `features/tasks/mutations/`.
- Thread `attachmentSetId` through `useTaskSubmit` into both `submitSingle` and
  `submitLoop` create bodies.
- **Task / run detail**: an "Attachments" section listing the task's stored
  `attachments` via `FilePreview` (read-only, no remove).
- Conventions: no raw Tailwind / inline styles in `apps/web` — compose DS primitives.

## Design system (`libs/design-system`)

New **`FilePreview`** component (presentational, reusable — belongs in DS, not the app):

- Props: `name: string`, `size: number` (bytes), `mediaType?: string`, optional
  `onRemove?: () => void`, optional `status?` (e.g. `uploading | ready | error`).
- Shows a **file-type icon** (mapped from extension / mediaType to an existing
  `IconName`), the **name** (truncated), and the **formatted size**.
- Icon map is coarse — the icon union is abstract (`doc`, `file`, `code`, `film`, …):
  source/code → `code`, video → `film`, docs/pdf/text → `doc`, everything else →
  `file` (default). No new icons in scope; map only to existing `IconName`s.
- Byte formatting via a small `formatFileSize(bytes)` util (none exists today) →
  `libs/design-system/src/utils/` (e.g. `1.2 MB`, `48 KB`).
- Follows DS conventions: `FilePreviewProps` exported, `FilePreviewTestId` enum
  wiring `data-testid` onto icon / name / size / remove, a `.test.tsx`, and a
  Storybook story. Ref-as-prop (no `forwardRef`).

## Testing

- **Contract**: round-trip `Attachment` / updated `ScheduledTask` / `CreateTaskInput`;
  old-shaped task still parses (`attachments` defaults to `[]`).
- **Backend**: multer limits reject oversize / too-many files (413); filename
  sanitization; the grant dir is absolute and the prompt manifest lists filenames;
  attachments thread into the **agent, orchestrator, and goal/loop** launch paths;
  orphan sweep deletes unreferenced sets past TTL and keeps referenced ones.
- **DS**: `FilePreview` renders icon/name/size, remove fires `onRemove`,
  `formatFileSize` boundaries (bytes/KB/MB); testid-driven selectors.
- **Web**: `TaskAttachments` upload + remove flow; `attachmentSetId` reaches both
  single and loop create bodies; detail shows stored attachments; i18n cs/en keys.

## Out of scope (YAGNI)

- **Pipeline-target attachment grant/manifest** (see "Pipeline target — deferred").
- Inlining file content into the prompt.
- Image thumbnails / rich previews (icon + name + size only).
- New file-type icons beyond the existing union.
- File-type allow/deny lists.

## Resolved risks

- **Multipart in ts-rest/Nest 3.53** — supported via `contentType:
  "multipart/form-data"` + `c.type<File[]>()`; bytes handled by multer
  `FilesInterceptor` on the Nest handler. If the ts-rest handler + multer
  composition proves brittle in practice, the fallback is a **raw Nest controller**
  for the binary boundary only (metadata + create body stay contract-first) — a
  defensible contract-first exception.
- **OOM** — bounded by multer `limits` (per-file + count) and a total-size check.
- **Silent no-grant** — enforced by asserting the attachments dir is absolute before
  it reaches `resolveGrantDirs`.
