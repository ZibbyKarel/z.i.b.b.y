# Task Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator attach files in the New Task dialog; the files are uploaded, stored durably, shown in task/run detail, and granted to the agent/orchestrator/goal run as an `--add-dir` reference dir with a filename manifest in the prompt.

**Architecture:** Two-step upload — files POST to `/api/tasks/attachments` (multipart, multer) → stored under `data/tasks/attachments/<setId>/` → the endpoint returns `{ attachmentSetId, files }`. `createTask` references the set by `attachmentSetId`; the task record stores the metadata list. At dispatch, agent/orchestrator/goal launches receive a dedicated `attachments` param (dir + filenames), granted via `--add-dir` separately from work paths so it never becomes `grantDirs[0]`. Pipeline-target attachment grant is deferred (documented). A DS `FilePreview` component (type icon + name + size) renders each file.

**Tech Stack:** TypeScript, ts-rest 3.53, NestJS + `@nestjs/platform-express` (multer), Zod, Next.js 15 / React 19, TanStack Query, Tailwind v4, vitest, react-dropzone (DS `DropZone`).

## Global Constraints

- pnpm only (never npm/yarn). After any code change run in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Contract-first: `libs/contracts` changes land before the API/web consume them.
- No `forwardRef` (React 19 ref-as-prop). No `any`. `strict` + `noUncheckedIndexedAccess`.
- `apps/web`: no inline `style={{…}}` on DOM elements, no hand-written Tailwind — compose DS primitives.
- DS components: export `<Component>Props`, declare `<Component>TestId` enum, wire `data-testid`, add a `.test.tsx` and Storybook story, export from `libs/design-system/src/index.ts`.
- i18n: add keys to BOTH `apps/web/i18n/messages/cs.json` and `en.json`; default locale `cs`.
- Upload limits (verbatim): **max 10 MB per file**, **max 50 MB per set**, **max 20 files per set**. No file-type restriction.
- Orphan-set TTL (verbatim): **24 hours**.
- Attachments dir MUST be absolute before it reaches the grant resolver (a relative path is silently dropped).
- Under `VITEST`, `resolveDataRoot()` throws unless `ZIBBY_DATA_DIR` is set — the global `vitest.setup.ts` pins it. Never hardcode `.zibby/data` in a test.

---

### Task 1: Contract — Attachment schema, task fields, upload route

**Files:**
- Modify: `libs/contracts/src/tasks/task.schema.ts`
- Modify: `libs/contracts/src/tasks/tasks.contract.ts`
- Test: `libs/contracts/src/tasks/tasks.contract.test.ts`

**Interfaces:**
- Produces: `AttachmentSchema` / `Attachment` (`{ name: string; size: number; mediaType?: string }`); `CreateTaskInput.attachmentSetId?: string`; `ScheduledTask.attachmentSetId?: string`, `ScheduledTask.attachments: Attachment[]`; contract route `tasksContract.uploadTaskAttachments`.

- [ ] **Step 1: Write the failing test** — append to `tasks.contract.test.ts`:

```ts
import { AttachmentSchema, ScheduledTaskSchema, CreateTaskInputSchema } from "./task.schema";

it("round-trips an attachment", () => {
  const parsed = AttachmentSchema.safeParse({ name: "spec.pdf", size: 1234, mediaType: "application/pdf" });
  expect(parsed.success).toBe(true);
});

it("defaults task attachments to [] and accepts attachmentSetId", () => {
  const task = ScheduledTaskSchema.parse({
    id: "t1", text: "do it", scheduledAt: 1, status: "scheduled",
    createdAt: "2026-07-03T00:00:00.000Z", attachmentSetId: "set_1",
  });
  expect(task.attachments).toEqual([]);
  expect(task.attachmentSetId).toBe("set_1");
});

it("accepts attachmentSetId on create input", () => {
  const input = CreateTaskInputSchema.parse({ text: "x", attachmentSetId: "set_1" });
  expect(input.attachmentSetId).toBe("set_1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/contracts/src/tasks/tasks.contract.test.ts`
Expected: FAIL (`AttachmentSchema` not exported / unknown keys).

- [ ] **Step 3: Add schemas** — in `task.schema.ts`, after the imports/`ResolvedPathSchema` block add:

```ts
/**
 * Metadata for one uploaded attachment. The bytes live on disk under the set's dir
 * (`data/tasks/attachments/<setId>/`); this is only what the UI and the run manifest
 * need — original filename (basename), byte size, and the browser-reported MIME.
 */
export const AttachmentSchema = z.object({
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mediaType: z.string().optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;
```

In `ScheduledTaskSchema` (add fields alongside `paths`):

```ts
  /** Phase: the uploaded attachment set this task references (see AttachmentSchema). */
  attachmentSetId: z.string().optional(),
  /** Durable, displayable metadata for the referenced set (empty when none). */
  attachments: z.array(AttachmentSchema).default([]),
```

In `CreateTaskInputSchema` (add alongside `paths`):

```ts
  /** Phase: reference a previously-uploaded attachment set (POST /tasks/attachments). */
  attachmentSetId: z.string().optional(),
```

- [ ] **Step 4: Add the upload route** — in `tasks.contract.ts`, import `AttachmentSchema`, add inside `c.router({ … })`:

```ts
    uploadTaskAttachments: {
      method: "POST",
      path: "/tasks/attachments",
      contentType: "multipart/form-data",
      body: c.type<{ files: File[] }>(),
      responses: {
        201: z.object({ attachmentSetId: z.string(), files: z.array(AttachmentSchema) }),
        413: ErrorSchema,
        422: ErrorSchema,
      },
      summary: "Upload files as a durable attachment set a task can reference",
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run libs/contracts/src/tasks/tasks.contract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/contracts/src/tasks/
git commit -m "feat(contracts): attachment schema, task fields, upload route"
```

---

### Task 2: DS — `formatFileSize` util

**Files:**
- Create: `libs/design-system/src/utils/formatFileSize.ts`
- Test: `libs/design-system/src/utils/formatFileSize.test.ts`

**Interfaces:**
- Produces: `formatFileSize(bytes: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatFileSize } from "./formatFileSize";

describe("formatFileSize", () => {
  it("formats bytes, KB, MB", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(1_258_291)).toBe("1.2 MB");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/design-system/src/utils/formatFileSize.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/** Human-readable byte size: "512 B", "1.5 KB", "1.2 MB". One decimal, trailing .0 trimmed. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${units[unit]}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run libs/design-system/src/utils/formatFileSize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/design-system/src/utils/formatFileSize.ts libs/design-system/src/utils/formatFileSize.test.ts
git commit -m "feat(ds): formatFileSize util"
```

---

### Task 3: DS — `FilePreview` component

**Files:**
- Create: `libs/design-system/src/components/FilePreview/FilePreview.tsx`
- Create: `libs/design-system/src/components/FilePreview/FilePreview.test.tsx`
- Create: `libs/design-system/src/components/FilePreview/FilePreview.stories.tsx`
- Modify: `libs/design-system/src/index.ts`

**Interfaces:**
- Consumes: `formatFileSize` (Task 2); `Icon`, `IconName`, `Typography`, `Stack` from DS.
- Produces: `FilePreview`, `FilePreviewProps`, `FilePreviewTestId`, `iconForFile(name: string, mediaType?: string): IconName`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../utils/testRender";
import { FilePreview, FilePreviewTestId, iconForFile } from "./FilePreview";

describe("FilePreview", () => {
  it("shows name and formatted size", () => {
    render(<FilePreview name="spec.pdf" size={1_258_291} />);
    expect(screen.getByTestId(FilePreviewTestId.Name)).toHaveTextContent("spec.pdf");
    expect(screen.getByTestId(FilePreviewTestId.Size)).toHaveTextContent("1.2 MB");
  });

  it("fires onRemove", async () => {
    const onRemove = vi.fn();
    const { user } = render(<FilePreview name="a.txt" size={10} onRemove={onRemove} />);
    await user.click(screen.getByTestId(FilePreviewTestId.Remove));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("maps extensions to icons", () => {
    expect(iconForFile("main.ts")).toBe("code");
    expect(iconForFile("clip.mp4")).toBe("film");
    expect(iconForFile("notes.md")).toBe("doc");
    expect(iconForFile("data.bin")).toBe("file");
  });
});
```

> Note: confirm `testRender` returns `{ user }`; if not, use `userEvent.setup()` directly. Check `libs/design-system/src/utils/testRender.tsx` and an existing `*.test.tsx` for the house pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run libs/design-system/src/components/FilePreview/FilePreview.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `FilePreview.tsx`:

```tsx
import type { ReactNode } from "react";
import type { IconName } from "../../assets/icons";
import { formatFileSize } from "../../utils/formatFileSize";
import { Icon } from "../Icon/Icon";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum FilePreviewTestId {
  Root = "file-preview-root",
  Icon = "file-preview-icon",
  Name = "file-preview-name",
  Size = "file-preview-size",
  Remove = "file-preview-remove",
}

const CODE_EXT = new Set(["ts","tsx","js","jsx","json","py","rs","go","java","c","cpp","css","html","sh","yml","yaml"]);
const VIDEO_EXT = new Set(["mp4","mov","webm","mkv","avi"]);
const DOC_EXT = new Set(["md","txt","pdf","doc","docx","rtf","csv","tsv","xls","xlsx"]);

/** Coarse extension/MIME → existing IconName. Default `file`. (Icon union is abstract.) */
export function iconForFile(name: string, mediaType?: string): IconName {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mediaType?.startsWith("video/") || VIDEO_EXT.has(ext)) return "film";
  if (CODE_EXT.has(ext)) return "code";
  if (DOC_EXT.has(ext) || mediaType?.startsWith("text/")) return "doc";
  return "file";
}

export interface FilePreviewProps {
  name: string;
  size: number;
  mediaType?: string;
  /** When set, renders a remove button that calls this. */
  onRemove?: () => void;
  /** Optional trailing status slot (e.g. an uploading spinner or error). */
  status?: ReactNode;
}

/** One attached-file row: type icon + name (truncated) + human size, optional remove/status. */
export function FilePreview({ name, size, mediaType, onRemove, status }: FilePreviewProps) {
  return (
    <Stack align="center" direction="row" gap="75" data-testid={FilePreviewTestId.Root}>
      <Icon aria-hidden name={iconForFile(name, mediaType)} size="sm" tone="faint" data-testid={FilePreviewTestId.Icon} />
      <Typography grow truncate mono size="xs" type="note" variant="secondary" data-testid={FilePreviewTestId.Name}>
        {name}
      </Typography>
      <Typography mono size="2xs" type="note" variant="tertiary" data-testid={FilePreviewTestId.Size}>
        {formatFileSize(size)}
      </Typography>
      {status}
      {onRemove ? (
        <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} data-testid={FilePreviewTestId.Remove}>
          <Icon aria-hidden name="x" size="xs" tone="faint" />
        </button>
      ) : null}
    </Stack>
  );
}
```

> Verify prop names against the real primitives before finalizing: `Icon` accepting `data-testid`, `Typography` supporting `grow`/`truncate`/`type`/`variant`, `Stack` `gap`/`direction`/`align`. Adjust to match (grep an existing component that uses each). Raw `<button>` in DS bespoke controls is the established pattern (see `FilePickerField`); no inline styles.

- [ ] **Step 4: Add Storybook story** `FilePreview.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { FilePreview } from "./FilePreview";

const meta: Meta<typeof FilePreview> = { title: "Components/FilePreview", component: FilePreview };
export default meta;
type Story = StoryObj<typeof FilePreview>;

export const Pdf: Story = { args: { name: "spec.pdf", size: 1_258_291, mediaType: "application/pdf" } };
export const Removable: Story = { args: { name: "data.csv", size: 49_152, onRemove: () => {} } };
export const Code: Story = { args: { name: "main.ts", size: 8_192 } };
```

- [ ] **Step 5: Export from barrel** — in `libs/design-system/src/index.ts` (near the `DropZone` exports ~line 224):

```ts
export { FilePreview, FilePreviewTestId, iconForFile } from "./components/FilePreview/FilePreview";
export type { FilePreviewProps } from "./components/FilePreview/FilePreview";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run libs/design-system/src/components/FilePreview/FilePreview.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/design-system/src/components/FilePreview/ libs/design-system/src/index.ts
git commit -m "feat(ds): FilePreview component (type icon + name + size)"
```

---

### Task 4: Backend — `AttachmentStorageService`

**Files:**
- Create: `apps/api/src/tasks/attachment-storage.service.ts`
- Test: `apps/api/src/tasks/attachment-storage.service.test.ts`

**Interfaces:**
- Consumes: `dataDir` from `../shared/data-dir`; `Attachment` from `@zibby/contracts`.
- Produces: `AttachmentStorageService` with:
  - `newSetId(): string`
  - `save(files: { originalname: string; size: number; mimetype?: string; buffer: Buffer }[]): Promise<{ attachmentSetId: string; files: Attachment[] }>`
  - `dir(setId: string): string` (absolute set dir)
  - `list(setId: string): Promise<Attachment[]>`
  - `remove(setId: string): Promise<void>`
  - `listSetIds(): Promise<{ id: string; mtimeMs: number }[]>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { AttachmentStorageService } from "./attachment-storage.service";
import * as fs from "node:fs/promises";
import * as path from "node:path";

function file(name: string, body: string) {
  return { originalname: name, size: body.length, mimetype: "text/plain", buffer: Buffer.from(body) };
}

describe("AttachmentStorageService", () => {
  let svc: AttachmentStorageService;
  beforeEach(() => { svc = new AttachmentStorageService(); });

  it("saves files and returns an absolute set dir + metadata", async () => {
    const { attachmentSetId, files } = await svc.save([file("a.txt", "hello"), file("b.csv", "x,y")]);
    expect(files).toEqual([
      { name: "a.txt", size: 5, mediaType: "text/plain" },
      { name: "b.csv", size: 3, mediaType: "text/plain" },
    ]);
    const dir = svc.dir(attachmentSetId);
    expect(path.isAbsolute(dir)).toBe(true);
    expect(await fs.readFile(path.join(dir, "a.txt"), "utf8")).toBe("hello");
  });

  it("sanitizes filenames to a basename", async () => {
    const { attachmentSetId, files } = await svc.save([file("../../etc/passwd", "x")]);
    expect(files[0]?.name).toBe("passwd");
    const entries = await fs.readdir(svc.dir(attachmentSetId));
    expect(entries).toEqual(["passwd"]);
  });

  it("lists and removes a set", async () => {
    const { attachmentSetId } = await svc.save([file("a.txt", "hi")]);
    expect(await svc.list(attachmentSetId)).toHaveLength(1);
    await svc.remove(attachmentSetId);
    expect(await svc.list(attachmentSetId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/tasks/attachment-storage.service.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`@Injectable`). Store metadata in a `meta.json` per set so `list` doesn't re-`stat` bytes; sanitize with `path.basename`. Root: `dataDir("tasks", "attachments")`.

```ts
import { Injectable } from "@nestjs/common";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type { Attachment } from "@zibby/contracts";
import { dataDir } from "../shared/data-dir";

interface UploadedFile { originalname: string; size: number; mimetype?: string; buffer: Buffer }

@Injectable()
export class AttachmentStorageService {
  private root(): string { return dataDir("tasks", "attachments"); }

  newSetId(): string { return `set_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`; }

  dir(setId: string): string { return path.join(this.root(), path.basename(setId)); }

  async save(files: UploadedFile[]): Promise<{ attachmentSetId: string; files: Attachment[] }> {
    const attachmentSetId = this.newSetId();
    const dir = this.dir(attachmentSetId);
    await fs.mkdir(dir, { recursive: true });
    const metas: Attachment[] = [];
    for (const f of files) {
      const name = path.basename(f.originalname);
      await fs.writeFile(path.join(dir, name), f.buffer);
      metas.push({ name, size: f.size, ...(f.mimetype ? { mediaType: f.mimetype } : {}) });
    }
    await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(metas), "utf8");
    return { attachmentSetId, files: metas };
  }

  async list(setId: string): Promise<Attachment[]> {
    const raw = await fs.readFile(path.join(this.dir(setId), "meta.json"), "utf8").catch(() => null);
    return raw ? (JSON.parse(raw) as Attachment[]) : [];
  }

  async remove(setId: string): Promise<void> {
    await fs.rm(this.dir(setId), { recursive: true, force: true });
  }

  async listSetIds(): Promise<{ id: string; mtimeMs: number }[]> {
    const entries = await fs.readdir(this.root(), { withFileTypes: true }).catch(() => []);
    const out: { id: string; mtimeMs: number }[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const stat = await fs.stat(path.join(this.root(), e.name)).catch(() => null);
      if (stat) out.push({ id: e.name, mtimeMs: stat.mtimeMs });
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/tasks/attachment-storage.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the provider** — add `AttachmentStorageService` to `providers` (and `exports`) of `apps/api/src/tasks/tasks.module.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks/attachment-storage.service.ts apps/api/src/tasks/attachment-storage.service.test.ts apps/api/src/tasks/tasks.module.ts
git commit -m "feat(api): AttachmentStorageService (durable per-set storage)"
```

---

### Task 5: Backend — upload endpoint with hard multer limits

**Files:**
- Modify: `apps/api/src/tasks/tasks.controller.ts`
- Test (e2e): `apps/api/src/tasks/tasks-attachments.e2e.ts` (or extend the existing tasks e2e — match the repo's e2e location/pattern)

**Interfaces:**
- Consumes: `AttachmentStorageService.save` (Task 4); `tasksContract.uploadTaskAttachments` (Task 1).
- Produces: `POST /api/tasks/attachments` → `201 { attachmentSetId, files }`, `413` over a limit.

- [ ] **Step 1: Write the failing e2e** (Nest test app + supertest; mirror an existing `*.e2e.ts` bootstrap in the repo):

```ts
it("uploads files and returns a set id + metadata", async () => {
  const res = await request(app.getHttpServer())
    .post("/api/tasks/attachments")
    .attach("files", Buffer.from("hello"), "a.txt")
    .attach("files", Buffer.from("x,y"), "b.csv");
  expect(res.status).toBe(201);
  expect(res.body.attachmentSetId).toMatch(/^set_/);
  expect(res.body.files).toHaveLength(2);
  expect(res.body.files[0]).toMatchObject({ name: "a.txt", size: 5 });
});

it("rejects a file over the per-file size limit with 413", async () => {
  const big = Buffer.alloc(11 * 1024 * 1024, 1); // 11 MB > 10 MB
  const res = await request(app.getHttpServer())
    .post("/api/tasks/attachments").attach("files", big, "big.bin");
  expect(res.status).toBe(413);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm api:test -- tasks-attachments` (or the repo's e2e command)
Expected: FAIL (404 — route not implemented).

- [ ] **Step 3: Implement the handler.** ts-rest's single `@TsRestHandler(tasksContract)` can't own the multipart parse; add a dedicated method on `TasksController` for the multipart boundary and keep the rest in the ts-rest handler. Add the limit constants + interceptor:

```ts
import { Controller, Post, UploadedFiles, UseInterceptors, PayloadTooLargeException } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { AttachmentStorageService } from "./attachment-storage.service";

const MAX_FILES = 20;
const MAX_FILE_BYTES = 10 * 1024 * 1024;   // 10 MB
const MAX_SET_BYTES = 50 * 1024 * 1024;    // 50 MB

// inject in the constructor: private readonly attachments: AttachmentStorageService

@Post("/api/tasks/attachments")
@UseInterceptors(FilesInterceptor("files", MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES } }))
async uploadAttachments(@UploadedFiles() files: Express.Multer.File[]) {
  const total = (files ?? []).reduce((n, f) => n + f.size, 0);
  if (total > MAX_SET_BYTES) throw new PayloadTooLargeException("Attachment set exceeds 50 MB");
  const result = await this.attachments.save(files ?? []);
  return result; // { attachmentSetId, files }
}
```

> Multer's own `fileSize`/`files` overflow surfaces as a `413`/`400` via Nest's `MulterError` mapping. Confirm the status is `413` for `LIMIT_FILE_SIZE`; if Nest maps it to `400`/`500`, add an exception filter translating `MulterError` → `PayloadTooLargeException` so the contract's `413` holds. Ensure `@nestjs/platform-express` `MulterModule`/global config doesn't set a smaller default limit.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm api:test -- tasks-attachments`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tasks/tasks.controller.ts apps/api/src/tasks/tasks-attachments.e2e.ts
git commit -m "feat(api): task attachment upload endpoint with hard size/count limits"
```

---

### Task 6: Backend — persist `attachmentSetId` + `attachments` on the task

**Files:**
- Modify: `apps/api/src/tasks/task-scheduler.service.ts` (`createTask`, ~line 217–283)
- Modify: `apps/api/src/tasks/scheduled-tasks.storage.service.ts` (`create` — persist the new fields)
- Test: `apps/api/src/tasks/task-scheduler.service.test.ts`

**Interfaces:**
- Consumes: `AttachmentStorageService.list` (Task 4); `CreateTaskInput.attachmentSetId` (Task 1).
- Produces: a persisted `ScheduledTask` carrying `attachmentSetId` + resolved `attachments`.

- [ ] **Step 1: Write the failing test** (unit-level; inject a fake/real `AttachmentStorageService`):

```ts
it("resolves and persists attachments from the set id on create", async () => {
  const setId = (await attachmentStorage.save([{ originalname: "a.txt", size: 2, mimetype: "text/plain", buffer: Buffer.from("hi") }])).attachmentSetId;
  const res = await scheduler.createTask({ text: "use it", attachmentSetId: setId, scheduledAt: Date.now() + 60_000 }, undefined, undefined, undefined, false);
  expect(res.outcome).toBe("scheduled");
  const task = (res as { task: { attachments: unknown[]; attachmentSetId?: string } }).task;
  expect(task.attachmentSetId).toBe(setId);
  expect(task.attachments).toEqual([{ name: "a.txt", size: 2, mediaType: "text/plain" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/tasks/task-scheduler.service.test.ts -t "resolves and persists attachments"`
Expected: FAIL (`attachments` empty / field dropped).

- [ ] **Step 3: Implement.** In `createTask`, after `input` is available and before both the scheduled `storage.create` and the immediate `attemptCreate`, resolve the set once:

```ts
const attachments = input.attachmentSetId
  ? await this.attachmentStorage.list(input.attachmentSetId)
  : [];
```

Thread `attachments` into the persisted record. In `scheduled-tasks.storage.service.ts` `create(...)`, since it already spreads `input`, ensure `attachmentSetId` passes through and set `attachments: input.attachments ?? attachmentsArg ?? []`. Simplest: pass a merged object `{ ...input, attachments }` into `storage.create` and into `attemptCreate`'s persisted task so both scheduled and immediate paths store it. Add `AttachmentStorageService` to the scheduler constructor (it's exported from `tasks.module.ts`).

> Verify the `ScheduledTask` written by `storage.create` includes `attachments`/`attachmentSetId`; if `create` builds the record field-by-field rather than spreading, add the two fields explicitly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/tasks/task-scheduler.service.test.ts -t "resolves and persists attachments"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tasks/task-scheduler.service.ts apps/api/src/tasks/scheduled-tasks.storage.service.ts apps/api/src/tasks/task-scheduler.service.test.ts
git commit -m "feat(api): persist attachmentSetId + resolved attachments on the task"
```

---

### Task 7: Backend — agent-runner attachments grant + prompt manifest

**Files:**
- Modify: `apps/api/src/agents/agent-runner.service.ts` (`start` ~135, `startOrchestrator` ~165, `launch` ~177, `buildCommand` ~536)
- Test: `apps/api/src/agents/agent-runner.service.test.ts` (or the nearest existing runner test; if none unit-tests `buildCommand`, add a focused test)

**Interfaces:**
- Produces: an optional trailing param `attachments?: RunAttachments` on `start`, `startOrchestrator`, `launch`, and `buildCommand`, where `RunAttachments = { dir: string; names: string[] }`.
- Behavior: `dir` is added to the `--add-dir` grants (via `grantDirs` passed to `buildClaudeCommand`) but is NEVER used as the "Operate on this directory" target; a manifest line listing `names` is appended to the task text.

- [ ] **Step 1: Write the failing test** — assert the built command grants the attachments dir and the task text names the files, and that a work path stays the "operate on" dir:

```ts
it("grants the attachments dir and lists filenames without making it the operate target", async () => {
  const built = await (runner as any).buildCommand(
    agentFixture, "do the thing", ["/work/proj"], "", "/sandbox",
    { dir: "/data/tasks/attachments/set_1", names: ["spec.pdf", "data.csv"] },
  );
  const joined = built.args.join(" ");
  expect(joined).toContain("--add-dir");
  expect(joined).toContain("/data/tasks/attachments/set_1");
  const taskArg = built.args[built.args.indexOf("-p") + 1] ?? built.args.join("\n");
  expect(taskArg).toContain("Operate on this directory: /work/proj");
  expect(taskArg).toContain("attached reference files in /data/tasks/attachments/set_1: spec.pdf, data.csv");
});
```

> Adjust the assertion to how `buildClaudeCommand` emits the task/`--add-dir` (grep `claude-run-command` for the flag order). The invariant to prove: attachments dir is `--add-dir`'d, the manifest names appear, and the work path — not the attachments dir — follows "Operate on this directory:".

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/agents/agent-runner.service.test.ts -t "grants the attachments dir"`
Expected: FAIL (param not accepted / manifest absent).

- [ ] **Step 3: Implement.** Add the type near the top of the file:

```ts
/** A run's attachment reference dir (already absolute) plus the filenames inside it. */
export interface RunAttachments { dir: string; names: string[] }
```

Thread the optional param through `start`, `startOrchestrator`, and `launch` (append as the last optional arg; existing callers unaffected). In `launch`, pass it to `buildCommand`. Rewrite `buildCommand`'s task/grant assembly:

```ts
private buildCommand(
  agent: Agent, prompt: string, grantDirs: string[],
  grounding?: string, sandboxCwd?: string, attachments?: RunAttachments,
): Promise<{ command: string; args: string[] }> {
  const operate = grantDirs.length ? `${prompt}\n\nOperate on this directory: ${grantDirs[0]}` : prompt;
  const manifest = attachments && attachments.names.length
    ? `${operate}\n\nThe operator attached reference files in ${attachments.dir}: ${attachments.names.join(", ")}`
    : operate;
  const task = manifest.trim();
  const grants = attachments?.dir ? [...grantDirs, attachments.dir] : grantDirs;
  return this.claude.buildClaudeCommand({
    instructions: agent.instructions, task, tools: agent.tools, model: agent.model,
    thinking: agent.thinking, grantDirs: grants, grounding, streamTranscript: true,
    ...(sandboxCwd ? { systemPromptDir: sandboxCwd } : {}),
  });
}
```

> The attachments `dir` is passed already-absolute by the caller (Task 8). If defensive, drop it when `!path.isAbsolute(dir)` so a bad dir never produces a manifest line pointing at an ungranted path.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/agents/agent-runner.service.test.ts -t "grants the attachments dir"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/agents/agent-runner.service.ts apps/api/src/agents/agent-runner.service.test.ts
git commit -m "feat(api): agent-runner attachments --add-dir grant + prompt manifest"
```

---

### Task 8: Backend — thread attachments through dispatch (agent, orchestrator, goal/loop)

**Files:**
- Modify: `apps/api/src/tasks/task-scheduler.service.ts` (`dispatch`, ~700–777)
- Modify: `apps/api/src/goals/goal-runner.service.ts` (`start` ~191 → `drive` ~292 → `dispatchMaker` ~345 → `agentRunner.start`)
- Test: `apps/api/src/tasks/task-scheduler.service.test.ts`

**Interfaces:**
- Consumes: `RunAttachments` + the new params on `agentRunner.start`/`startOrchestrator` (Task 7); `AttachmentStorageService.dir`/`list` (Task 4).
- Produces: agent, orchestrator, and goal dispatches receive `{ dir, names }` for a task with an `attachmentSetId`.

- [ ] **Step 1: Write the failing test** — spy that `agentRunner.start` receives the attachments arg for an attachment-carrying agent task:

```ts
it("passes attachments to the agent dispatch", async () => {
  const startSpy = vi.spyOn(agentRunner, "start");
  const { attachmentSetId } = await attachmentStorage.save([{ originalname: "a.txt", size: 2, mimetype: "text/plain", buffer: Buffer.from("hi") }]);
  await scheduler.createTask({ text: "use it", attachmentSetId, target: { kind: "agent", id: someAgentId, name: "A" } }, undefined, undefined, undefined, false);
  const lastArg = startSpy.mock.calls.at(-1)?.at(-1);
  expect(lastArg).toMatchObject({ names: ["a.txt"] });
  expect(String((lastArg as any).dir)).toContain(attachmentSetId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/tasks/task-scheduler.service.test.ts -t "passes attachments to the agent dispatch"`
Expected: FAIL (arg undefined).

- [ ] **Step 3: Implement.** `dispatch(...)` currently takes `(text, paths, projectId, title, taskId, explicitTarget, output)` — thread the task's `attachmentSetId` in (or pass the already-resolved `attachments` list + setId). Build the run attachments once:

```ts
const runAttachments = attachmentSetId
  ? { dir: this.attachmentStorage.dir(attachmentSetId), names: attachments.map((a) => a.name) }
  : undefined;
```

Pass `runAttachments` as the new trailing arg to `agentRunner.start(...)`, `agentRunner.startOrchestrator(...)`, and `goalRunner.start(...)`. `this.attachmentStorage.dir()` returns an absolute path (rooted at `dataDir`), satisfying the absolute-path constraint. In `goal-runner.service.ts`, add the optional `attachments?: RunAttachments` param to `start`, carry it through `drive` → `dispatchMaker`, and forward it to `agentRunner.start(...)` for the agent-maker branch. (Pipeline-maker branch: leave unpassed — documented gap, Task-scope note below.)

> Confirm how `dispatch` is invoked from `attemptCreate`/the scheduled tick so the `attachmentSetId` + resolved `attachments` reach it (they are on the task record — read them from `task`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/tasks/task-scheduler.service.test.ts -t "passes attachments to the agent dispatch"`
Expected: PASS.

- [ ] **Step 5: Verify the full API suite is green**

Run: `pnpm api:test`
Expected: PASS (no regressions in existing dispatch tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tasks/task-scheduler.service.ts apps/api/src/goals/goal-runner.service.ts apps/api/src/tasks/task-scheduler.service.test.ts
git commit -m "feat(api): thread attachments through agent/orchestrator/goal dispatch"
```

---

### Task 9: Backend — orphan attachment-set sweep

**Files:**
- Modify: `apps/api/src/tasks/task-scheduler.service.ts` (add a sweep, called from the existing scheduler tick)
- Test: `apps/api/src/tasks/task-scheduler.service.test.ts`

**Interfaces:**
- Consumes: `AttachmentStorageService.listSetIds`/`remove` (Task 4); `ScheduledTasksStorageService.list` (referenced set ids).
- Produces: `sweepOrphanAttachmentSets(now: number): Promise<number>` (count removed). TTL = 24 h.

- [ ] **Step 1: Write the failing test**

```ts
it("removes attachment sets older than 24h that no task references", async () => {
  const orphan = (await attachmentStorage.save([{ originalname: "o.txt", size: 1, buffer: Buffer.from("x") }])).attachmentSetId;
  const referenced = (await attachmentStorage.save([{ originalname: "r.txt", size: 1, buffer: Buffer.from("y") }])).attachmentSetId;
  await scheduler.createTask({ text: "keep", attachmentSetId: referenced, scheduledAt: Date.now() + 60_000 }, undefined, undefined, undefined, false);
  const removed = await scheduler.sweepOrphanAttachmentSets(Date.now() + 25 * 60 * 60 * 1000);
  expect(removed).toBe(1);
  expect(await attachmentStorage.list(orphan)).toEqual([]);
  expect(await attachmentStorage.list(referenced)).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/tasks/task-scheduler.service.test.ts -t "removes attachment sets older than 24h"`
Expected: FAIL (method missing).

- [ ] **Step 3: Implement.** Best-effort, never throws:

```ts
private static readonly ATTACHMENT_TTL_MS = 24 * 60 * 60 * 1000;

async sweepOrphanAttachmentSets(now: number): Promise<number> {
  const tasks = await this.storage.list().catch(() => []);
  const referenced = new Set(tasks.map((t) => t.attachmentSetId).filter(Boolean) as string[]);
  const sets = await this.attachmentStorage.listSetIds().catch(() => []);
  let removed = 0;
  for (const s of sets) {
    if (referenced.has(s.id)) continue;
    if (now - s.mtimeMs < TaskSchedulerService.ATTACHMENT_TTL_MS) continue;
    await this.attachmentStorage.remove(s.id).then(() => { removed += 1; }).catch(() => {});
  }
  return removed;
}
```

Call `void this.sweepOrphanAttachmentSets(Date.now())` from the existing scheduler tick (fire-and-forget alongside the other periodic work).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/tasks/task-scheduler.service.test.ts -t "removes attachment sets older than 24h"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tasks/task-scheduler.service.ts apps/api/src/tasks/task-scheduler.service.test.ts
git commit -m "feat(api): sweep orphan attachment sets past 24h TTL"
```

---

### Task 10: Web — upload mutation

**Files:**
- Create: `apps/web/features/tasks/mutations/useUploadTaskAttachmentsMutation.ts`
- Modify: `apps/web/features/tasks/mutations/index.ts` (re-export)
- Test: `apps/web/features/tasks/mutations/useUploadTaskAttachmentsMutation.test.ts` (jsdom web project)

**Interfaces:**
- Produces: `useUploadTaskAttachmentsMutation()` → a `useMutation` returning `{ attachmentSetId, files }`; `mutate(files: File[])`.

- [ ] **Step 1: Write the failing test** — render the hook with the web test providers, mock `fetch`, assert it POSTs FormData to `/api/tasks/attachments` and returns the body. Follow the existing mutation-test pattern in `features/tasks/mutations/` (look at a sibling `.test.ts` for `renderHook`/provider setup).

```ts
it("posts files as multipart and returns the set", async () => {
  const body = { attachmentSetId: "set_1", files: [{ name: "a.txt", size: 2 }] };
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 201 }));
  const { result } = renderHook(() => useUploadTaskAttachmentsMutation(), { wrapper });
  await act(async () => { await result.current.mutateAsync([new File(["hi"], "a.txt")]); });
  expect(result.current.data).toEqual(body);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm web:test -- useUploadTaskAttachmentsMutation`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** The ts-rest client may accept `FormData` directly for the multipart route (per ts-rest docs, `body: formData`); if the generated client is awkward with multipart, POST via `fetch` with `FormData` (no `Content-Type` header — the browser sets the boundary):

```ts
import { useMutation } from "@tanstack/react-query";
import type { Attachment } from "@zibby/contracts";

export interface UploadedSet { attachmentSetId: string; files: Attachment[] }

export function useUploadTaskAttachmentsMutation() {
  return useMutation<UploadedSet, Error, File[]>({
    mutationFn: async (files) => {
      const form = new FormData();
      for (const f of files) form.append("files", f, f.name);
      const res = await fetch("/api/tasks/attachments", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      return (await res.json()) as UploadedSet;
    },
  });
}
```

> Prefer the ts-rest react-query client if it cleanly supports the multipart route (consistency with sibling hooks); fall back to raw `fetch` only if not. Match the base-URL handling used by the other hooks.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm web:test -- useUploadTaskAttachmentsMutation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/tasks/mutations/
git commit -m "feat(web): useUploadTaskAttachmentsMutation"
```

---

### Task 11: Web — `TaskAttachments` composite

**Files:**
- Create: `apps/web/features/tasks/components/TaskAttachments.tsx`
- Test: `apps/web/features/tasks/components/TaskAttachments.test.tsx`

**Interfaces:**
- Consumes: DS `DropZone`, `FilePreview` (Task 3); `useUploadTaskAttachmentsMutation` (Task 10).
- Produces: `TaskAttachments({ value, onChange })` where `value: { attachmentSetId?: string; files: Attachment[] }` and `onChange(next)` bubbles the current set to the composer.

- [ ] **Step 1: Write the failing test** — drop a file, assert upload fires and a `FilePreview` row + `attachmentSetId` surface via `onChange`; remove clears it.

```tsx
it("uploads dropped files and reports the set; remove clears it", async () => {
  const onChange = vi.fn();
  // mock the upload mutation to resolve { attachmentSetId: "set_1", files: [{name:"a.txt",size:2}] }
  render(<TaskAttachments value={{ files: [] }} onChange={onChange} />);
  // simulate DropZone onDrop([File]) — fire via the DropZone test input
  // assert onChange called with attachmentSetId "set_1" and one file
  // click FilePreview remove -> onChange called with { files: [] }
});
```

> Fill in the drop simulation to match how DS `DropZone` exposes its input (`DropZoneTestId.Input`) and how sibling web-component tests drive react-dropzone.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm web:test -- TaskAttachments`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `DropZone` (`maxSize={10*1024*1024}`, `multiple`) + a `Stack` of `FilePreview` rows with `onRemove`, an upload-busy indicator via `FilePreview`'s `status` slot, and an error message on rejection/failure. On `onDrop`, call the upload mutation, then `onChange({ attachmentSetId, files })`. On remove, `onChange({ files: [] })` (single-set model: v1 replaces the set rather than merging). Use `useTranslations("tasks.attachments")` for copy. No inline styles / raw Tailwind.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm web:test -- TaskAttachments`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/tasks/components/TaskAttachments.tsx apps/web/features/tasks/components/TaskAttachments.test.tsx
git commit -m "feat(web): TaskAttachments composite (DropZone + FilePreview list)"
```

---

### Task 12: Web — wire into the composer + thread `attachmentSetId` to submit

**Files:**
- Modify: `apps/web/features/tasks/components/NewTaskDialog.tsx` (mount `TaskAttachments`, hold set state)
- Modify: `apps/web/features/tasks/hooks/useTaskSubmit.ts` (add `attachmentSetId` to both create bodies)
- Test: `apps/web/features/tasks/components/NewTaskDialog.test.tsx`

**Interfaces:**
- Consumes: `TaskAttachments` (Task 11).
- Produces: `useTaskSubmit` includes `attachmentSetId` in `submitSingle` and `submitLoop` create bodies.

- [ ] **Step 1: Write the failing test** — in `NewTaskDialog.test.tsx`, assert the create mutation is called with `attachmentSetId` when an attachment set is present. Mock the upload + create mutations; simulate attaching, then submit; assert `createTask` body includes `attachmentSetId: "set_1"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm web:test -- NewTaskDialog`
Expected: FAIL (body has no `attachmentSetId`).

- [ ] **Step 3: Implement.** Add `attachmentSetId?: string` to `UseTaskSubmitArgs`; include `...(attachmentSetId ? { attachmentSetId } : {})` in both `submitSingle` and `submitLoop` bodies, and add it to both `useCallback` dep arrays. In `NewTaskDialog.tsx`, hold `const [attachments, setAttachments] = useState<{ attachmentSetId?: string; files: Attachment[] }>({ files: [] })`, render `<TaskAttachments value={attachments} onChange={setAttachments} />` in the composer, and pass `attachmentSetId: attachments.attachmentSetId` into `useTaskSubmit`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm web:test -- NewTaskDialog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/tasks/components/NewTaskDialog.tsx apps/web/features/tasks/hooks/useTaskSubmit.ts apps/web/features/tasks/components/NewTaskDialog.test.tsx
git commit -m "feat(web): attach files in New Task dialog; thread attachmentSetId to submit"
```

---

### Task 13: Web — show attachments in task/run detail

**Files:**
- Modify: the run/task detail surface that renders a task's metadata (find via `grep -rl "TaskContextPanel\|task.paths\|ScheduledTask" apps/web/features/runs apps/web/features/tasks`)
- Test: the corresponding detail test

**Interfaces:**
- Consumes: `FilePreview` (Task 3); the task record's `attachments: Attachment[]`.
- Produces: a read-only "Attachments" section (no remove) listing `attachments` when non-empty.

- [ ] **Step 1: Write the failing test** — render the detail with a task carrying two attachments; assert both `FilePreview` names render and no remove button is present.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm web:test -- <detail-test-name>`
Expected: FAIL (section absent).

- [ ] **Step 3: Implement** — a `Panel`/`Stack` "Attachments" section that maps `attachments` to `<FilePreview name size mediaType />` (omit `onRemove`), shown only when `attachments.length > 0`. Use `useTranslations` for the header.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm web:test -- <detail-test-name>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/
git commit -m "feat(web): show task attachments in detail (read-only)"
```

---

### Task 14: i18n + full verification

**Files:**
- Modify: `apps/web/i18n/messages/cs.json`, `apps/web/i18n/messages/en.json`
- Modify: any component using a not-yet-added key

**Interfaces:**
- Produces: `tasks.attachments.*` keys (e.g. `label`, `dropHint`, `uploading`, `error`, `sectionTitle`, `remove`) in both catalogs.

- [ ] **Step 1: Add keys** under the existing `"tasks"` object in BOTH catalogs (cs is default — write natural Czech; en the English mirror). Example (cs):

```json
"attachments": {
  "label": "Přílohy",
  "dropHint": "Přetáhněte soubory nebo klikněte pro výběr",
  "uploading": "Nahrávám…",
  "error": "Nahrání selhalo",
  "sectionTitle": "Přílohy",
  "remove": "Odebrat přílohu"
}
```

- [ ] **Step 2: Run the whole suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS. (If `rtk` is used, call `tsc`/vitest directly — `rtk pnpm typecheck` can mask errors for `apps/web`; `rtk` also mangles `playwright`/`next typegen`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/i18n/messages/cs.json apps/web/i18n/messages/en.json
git commit -m "feat(web): i18n for task attachments (cs/en)"
```

---

## Self-Review

**Spec coverage:**
- Contract (`Attachment`, task fields, upload route) → Task 1. ✅
- Two-step upload / set-by-reference / storage → Tasks 4, 5, 6. ✅
- Hard multer limits (10/50 MB, 20 files) → Task 5 (+ Global Constraints). ✅
- Durable + visible in detail → Tasks 6, 13. ✅
- Dispatch threading, collision-safe, absolute dir, filename manifest, agent/orchestrator/goal → Tasks 7, 8. ✅
- Pipeline deferred (documented) → spec + Task 8 note. ✅
- Orphan sweep (24h TTL) → Task 9. ✅
- DS `FilePreview` (icon + name + size) + `formatFileSize` → Tasks 2, 3. ✅
- Web composer + submit threading + upload mutation → Tasks 10, 11, 12. ✅
- i18n cs/en → Task 14. ✅
- Testing across contract/backend/DS/web → each task's TDD steps. ✅

**Placeholder scan:** Tasks 5, 7, 11, 13 carry explicit "verify against the real seam" notes (multer status mapping, `buildClaudeCommand` flag order, DropZone drop simulation, the detail host file). These are grounded verification steps against named files, not open-ended TODOs — each has concrete fallback instructions.

**Type consistency:** `Attachment` (Task 1) is the single metadata shape used by storage (4), persistence (6), mutation (10), composite (11), detail (13). `RunAttachments = { dir; names }` (Task 7) is consumed unchanged by dispatch (8). `attachmentSetId: string` naming is identical across contract, task record, create body, and submit hook.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-task-attachments.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
