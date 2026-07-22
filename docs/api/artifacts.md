# Artifacts (durable artifact registry)

> Root `CLAUDE.md`, "Pipelines & artifacts": _"Every pipeline yields a durable
> artifact — a document in the vault, a git branch, a PR — recorded on disk,
> not discarded when the run ends."_

The artifacts module (N2a) is the concrete storage/API behind that principle:
one plain-JSON provenance record per delivered output, written by the
pipeline delivery sinks at the moment they deliver. It is what makes "where did
this file/PR come from?" always answerable (root `CLAUDE.md`'s Law 5 — always
answerable). It also backed the retired chains feature (N2b), which bound a
downstream pipeline's input to an upstream run's output long after that run had
been evicted from memory; that consumer is gone, but the provenance registry it
relied on remains.

## Pieces

| Piece      | File                                                  | Role                                                                                         |
| ---------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Schema     | `libs/contracts/src/artifacts/artifact.schema.ts`     | `ArtifactKind` (`vault-note` / `project-file` / `pr`), `ArtifactRecord`, `ArtifactListQuery` |
| Contract   | `libs/contracts/src/artifacts/artifacts.contract.ts`  | `artifactsContract` — the read-only `/api/artifacts` router                                  |
| Storage    | `apps/api/src/artifacts/artifacts.storage.service.ts` | `ArtifactsStorageService` — file-backed registry (`EntityFileStore<ArtifactRecord>`)         |
| Controller | `apps/api/src/artifacts/artifacts.controller.ts`      | Implements the contract; no write endpoint                                                   |

## The record

An `ArtifactRecord` is:

```ts
{
  id: string;           // `<runRef>_<kind>_<slug(from)>` — stable per (run, sink kind, handoff name)
  kind: "vault-note" | "project-file" | "pr";
  locator: string;      // kind-dependent address: note id, project-relative path, or PR URL
  from: string;         // the phase handoff name the sink drew from (the pipeline's `produces`)
  producedBy: {
    runRef: string;      // the producing pipeline run's id
    pipelineId: string;
    taskId?: string;
    projectId?: string;
  };
  createdAt: string;    // ISO datetime
}
```

The id is derived by the pure `artifactRecordId(runRef, kind, from)` helper
(slugified `from`, defaulting to `artifact` when it slugifies to empty) so an
**idempotent re-delivery of the same run replaces its record** instead of
duplicating it, while a `pr` sink and a `file` sink drawing from the same
handoff name keep distinct records (the kind is part of the id).

## Flow

1. A pipeline run reaches a terminal output (a `file` delivery to the
   project, a vault-note write, or a `pr` open) inside
   `apps/api/src/pipelines/pipeline-runner.service.ts`.
2. The runner's private `recordArtifact(run, kind, from, locator)` builds the
   record (resolving the run's project id, when the project isn't
   `"unregistered"`) and calls `ArtifactsStorageService.record()`.
3. Writing is **best-effort by contract**: a registry write failure is logged
   and swallowed — the delivery itself (the file/PR/note) has already landed
   and must not be undone or reported as failed just because the provenance
   write hiccuped.
4. `ArtifactsStorageService.listFiltered({ projectId?, pipelineId? })` is the
   read path: newest-first (`compare` sorts by `createdAt` descending),
   optionally scoped to a project and/or pipeline. (The retired chains feature
   read the full unfiltered list to resolve a chain's upstream binding; that
   consumer is gone, the read path remains.)

## Endpoints (`/api/artifacts`)

- `GET /artifacts` — list records, newest-first, filtered by optional
  `projectId` / `pipelineId` query params.
- `GET /artifacts/:id` — one record by id; `404` for unknown, corrupt, or
  malformed ids (all read as "not found" — never a 500).

**Read-only on purpose.** Records are born only inside the API process — the
pipeline delivery sinks are the only writer — so there is deliberately no
`POST`/`PUT` here: a client can never forge provenance for a run that didn't
actually happen.
