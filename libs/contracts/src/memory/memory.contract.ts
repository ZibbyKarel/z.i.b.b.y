import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { ErrorSchema } from "../common.schema";
import {
  AppendDailySchema,
  AppendNoteSchema,
  CreateNoteSchema,
  ImportRequestSchema,
  ImportResultSchema,
  IndexEntrySchema,
  MemoryGraphSchema,
  NoteSchema,
  SearchHitSchema,
  UpdateIndexLinkSchema,
  UpdateNoteSchema,
} from "./memory.schema";

const c = initContract();

/**
 * The memory layer (Phase 4): read access to the Obsidian vault, index-first
 * retrieval (no embeddings), the wiki-link graph, and a safe `daily/` append.
 * Curated `MEMORY.md` edits are gated through the approval/gate engine elsewhere;
 * `daily/` append is auto-safe.
 */
export const memoryContract = c.router(
  {
    getIndex: {
      method: "GET",
      path: "/memory/index",
      responses: { 200: z.object({ entries: z.array(IndexEntrySchema) }) },
      summary: "Index/MOC entry points into the vault",
    },
    getNote: {
      method: "GET",
      path: "/memory/note/:id",
      pathParams: z.object({ id: z.string() }),
      responses: { 200: NoteSchema, 404: ErrorSchema },
      summary: "Read a single note (with resolved links + backlinks)",
    },
    getGraph: {
      method: "GET",
      path: "/memory/graph",
      responses: { 200: MemoryGraphSchema },
      summary: "The force-directed wiki-link graph",
    },
    search: {
      method: "GET",
      path: "/memory/search",
      query: z.object({ q: z.string() }),
      responses: { 200: z.object({ results: z.array(SearchHitSchema) }) },
      summary: "Index-first retrieval over the vault (not vector search)",
    },
    appendDaily: {
      method: "POST",
      path: "/memory/daily",
      body: AppendDailySchema,
      responses: { 201: NoteSchema },
      summary: "Append an episodic entry to today's daily note (safe write)",
    },
    createNote: {
      method: "POST",
      path: "/memory/notes",
      body: CreateNoteSchema,
      responses: { 201: NoteSchema, 409: ErrorSchema, 422: ErrorSchema },
      summary: "Create a note in a tier (id unique across the vault)",
    },
    updateNote: {
      method: "PATCH",
      path: "/memory/notes/:id",
      pathParams: z.object({ id: z.string() }),
      body: UpdateNoteSchema,
      responses: { 200: NoteSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Patch a note's title/body/frontmatter (frontmatter merges)",
    },
    appendToNote: {
      method: "POST",
      path: "/memory/notes/:id/append",
      pathParams: z.object({ id: z.string() }),
      body: AppendNoteSchema,
      responses: { 200: NoteSchema, 404: ErrorSchema, 422: ErrorSchema },
      summary: "Append text to an existing note (atomic)",
    },
    updateIndex: {
      method: "POST",
      path: "/memory/index/:id/links",
      pathParams: z.object({ id: z.string() }),
      body: UpdateIndexLinkSchema,
      responses: { 200: NoteSchema, 422: ErrorSchema },
      summary: "Ensure a [[target]] wiki-link exists in a MOC (auto-creates it)",
    },
    import: {
      method: "POST",
      path: "/memory/import",
      body: ImportRequestSchema,
      responses: { 200: ImportResultSchema, 400: ErrorSchema, 422: ErrorSchema },
      summary:
        "Bulk-import .md/.txt files from a server-side folder into the halda queue (phase 112)",
    },
  },
  { pathPrefix: "/api", strictStatusCodes: true },
);
export type MemoryContract = typeof memoryContract;
