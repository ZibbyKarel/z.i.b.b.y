# Phase 65 — Open attachment files from the run's "Vstup" section (serve endpoint)

> Completes TODO item 8's _"…spolu s možností otevřít všechny přílohové soubory"_ — the "Vstup"
> section (phase 64) currently only LISTS attachments; this phase makes each openable.

## Why a backend endpoint

Attachments are stored on disk by `AttachmentStorageService`
(`apps/api/src/tasks/attachment-storage.service.ts`): files at
`dataDir("tasks","attachments")/<setId>/<name>`, meta at `<setId>.meta.json`. Today `RunView.attachments`
carries only `{ name, size, mediaType }` and there is NO route to fetch a file's bytes and no
`attachmentSetId` on the run. So opening a file needs three things: expose the set id, add a serve route,
link to it.

## 1 — Contract: expose `attachmentSetId` on the run

`libs/contracts/src/tasks/task-run.schema.ts` — add `attachmentSetId: z.string().optional()` to
`TaskRunSchema` (next to the existing `attachments` field, ~line 98). Optional so runs without attachments
(and the many synthetic run literals) are unaffected. Update/extend the schema test
(`task-run.schema.test.ts`) to round-trip it.

## 2 — API: plumb the set id + a file-serve route

- **Plumb `attachmentSetId` into the RunView.** Find where the run is assembled from the task
  (`apps/api/src/tasks/task-runs.service.ts` — grep how `attachments` is populated) and carry the task's
  `attachmentSetId` onto the run alongside `attachments`. (The task/scheduled-task already stores
  `attachmentSetId` — `scheduled-tasks.storage.service.ts`.)
- **Serve route.** Binary file streaming does NOT fit the ts-rest JSON contract, so add a **plain NestJS
  controller route** (precedent: `apps/api/src/chat/chat-mcp.controller.ts` uses raw `@Res()`), e.g.
  `GET /api/tasks/attachments/:setId/:name` in `tasks.controller.ts` (or a small dedicated controller in
  the tasks module):
  - Resolve the file via `AttachmentStorageService`: reuse its `dir(setId)` (already
    `path.basename`-guards the set id) and `path.basename(name)` for the file name — defense-in-depth
    against traversal. Confirm the file exists under that dir; 404 if not (return a NestJS `NotFoundException`
    or set status 404 on the raw response).
  - Stream the bytes with the right headers: `Content-Type` from the meta's `mediaType`
    (via `AttachmentStorageService.list(setId)` lookup by name; fall back to
    `application/octet-stream`), and `Content-Disposition: inline; filename="<name>"` so it opens in the
    browser tab rather than force-downloading. Use `StreamableFile` (`@nestjs/common`) or a raw
    `@Res()` stream — pick one, keep it simple.
  - No auth (matches the existing no-auth upload endpoint `POST /tasks/attachments`; single-operator
    self-hosted threat model). Add an e2e or controller test covering: serves an existing file with the
    right content-type; 404 for an unknown set/name; a traversal attempt (`..`/absolute) is contained to
    the set dir (no escape). Mirror the existing `attachment-storage.service.test.ts` traversal test.
- Register the route/controller in `tasks.module.ts` if a new controller is added.

## 3 — Web: open links in the "Vstup" section

`apps/web/features/runs/components/RunDetail.tsx` — in the `RunInputSection` (phase 64), render each
attachment as an **open affordance** linking to the serve URL:
`${API_URL}/api/tasks/attachments/${run.attachmentSetId}/${encodeURIComponent(name)}`, opening in a new
tab (`target="_blank" rel="noopener"`). Use the existing `API_URL` constant the upload mutation uses
(grep `useUploadTaskAttachmentsMutation` for its `API_URL` import) so base URL handling is consistent.
- Prefer wiring the open affordance through DS `FilePreview` if it supports an `onOpen`/`href` prop; if it
  doesn't, wrap each `FilePreview` (or its name) in a DS `Pressable`/anchor that opens the URL — no raw
  `<a>` with inline style; use a DS primitive or an anchor with DS classes. Decide explicitly.
- Only render the open link when `run.attachmentSetId` is present (older runs may lack it). If absent,
  keep the read-only list (graceful).
- Add a `data-testid` on the open link for the test.

Tests (`RunDetail.test.tsx`): with a run carrying `attachmentSetId` + attachments, expanding "Vstup" shows
open links pointing at the serve URL (assert `href` contains the set id + encoded name). Without
`attachmentSetId`, the list still renders read-only.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean; contracts + api typecheck
  (`npx tsc -p libs/contracts` / the api build) clean.
- `npx eslint apps/web/features/runs apps/api/src/tasks libs/contracts/src/tasks` clean.
- `rtk proxy npx vitest run libs/contracts apps/web/features/runs/components/RunDetail.test.tsx` green
  (RunDetail's only pre-existing red is the cost-cell cs-locale test).
- API tests for the serve route: `rtk proxy npx vitest run apps/api/src/tasks` (or the e2e that covers it)
  green.

## Constraints
- Contract-first: the `attachmentSetId` addition goes in `libs/contracts` first, then the api/web consume
  it. The binary serve route is a deliberate non-ts-rest raw endpoint (like chat-mcp) — note that in a code
  comment.
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web. Node/NestJS server code is
  fine to use `fs`/streams.
- Do NOT run `git stash` (shared tree). Do NOT git commit — the caller commits. Do NOT touch operator WIP:
  `PipelineStageTimeline.tsx`, `.zibby/data/**`, chat internals, `machine.*`, `design/*`, CommandLine,
  EntityHero, MenuButton, TaskCard. Files in scope: `libs/contracts/src/tasks/*`, `apps/api/src/tasks/*`,
  `apps/web/features/runs/components/RunDetail.tsx` (+ its test).
