import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@zibby/contracts";
import type { AgentRunnerService } from "../agents/agent-runner.service";
import type { GoalRunnerService } from "../goals/goal-runner.service";
import type { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import type { ProjectsStorageService } from "../projects/projects.storage.service";
import type { ChatTranscriptStore } from "../chat/chat-transcript.store";
import type { ClaudeCliDistiller, Learning, NoteTriage } from "./claude-cli-distiller";
import {
  MemoryDistillerService,
  mergeLearningTags,
  mergeLearningType,
} from "./memory-distiller.service";
import { DuplicateNoteError, SimilarNoteError, type VaultService } from "./vault.service";

/**
 * A vault double that records the writes the distiller makes. `similarTo` scripts
 * `findSimilar`-style dedupe: a `createNote({ id, dedupe: true })` call for an id
 * present as a `similarTo` key throws `SimilarNoteError` at that mapped existing id,
 * mirroring `VaultService.createNote`'s opt-in dedupe path. `raw` seeds the pool
 * `rawNotes()` returns (Fáze 107 triage candidates).
 */
function makeVault(
  opts: { similarTo?: Record<string, string>; raw?: Note[] } = {},
) {
  const notes = new Map<
    string,
    { body: string; type?: string; tags?: string[]; frontmatter?: Record<string, unknown> }
  >();
  const indexed: Array<{ moc: string; target: string }> = [];
  const daily: string[] = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  return {
    indexed,
    daily,
    notes,
    updates,
    createNote: vi.fn(
      async (input: {
        id: string;
        body: string;
        type?: string;
        tags?: string[];
        dedupe?: boolean;
      }) => {
        if (notes.has(input.id)) throw new DuplicateNoteError(input.id);
        const similar = opts.similarTo?.[input.id];
        if (input.dedupe && similar) throw new SimilarNoteError(similar);
        notes.set(input.id, { body: input.body, type: input.type, tags: input.tags });
        return {};
      },
    ),
    appendToNote: vi.fn(async (id: string, text: string) => {
      const existing = notes.get(id);
      if (existing) existing.body += `\n${text}`;
      return {};
    }),
    updateNote: vi.fn(
      async (id: string, patch: { title?: string; body?: string; frontmatter?: Record<string, unknown> }) => {
        updates.push({ id, patch });
        const existing = notes.get(id) ?? { body: "" };
        if (patch.body !== undefined) existing.body = patch.body;
        existing.frontmatter = { ...existing.frontmatter, ...patch.frontmatter };
        notes.set(id, existing);
        return {};
      },
    ),
    updateIndex: vi.fn(async (moc: string, target: string) => {
      indexed.push({ moc, target });
      return {};
    }),
    appendDaily: vi.fn(async (text: string) => {
      daily.push(text);
      return {};
    }),
    rawNotes: vi.fn(async () => opts.raw ?? []),
    index: vi.fn(async () => []),
    search: vi.fn(async () => []),
  };
}

function makeService(over: {
  vault: ReturnType<typeof makeVault>;
  pipelines?: Partial<PipelineRunnerService>;
  agents?: Partial<AgentRunnerService>;
  goals?: Partial<GoalRunnerService>;
  projects?: Partial<ProjectsStorageService>;
  chat?: Partial<ChatTranscriptStore>;
  learnings?: Learning[];
  triage?: NoteTriage | null | ((note: { id: string; title: string; body: string }) => Promise<NoteTriage | null>);
}) {
  const triageImpl =
    typeof over.triage === "function" ? over.triage : async () => over.triage ?? null;
  const distiller = {
    distill: vi.fn(async () => over.learnings ?? []),
    triageNote: vi.fn(triageImpl),
  } as unknown as ClaudeCliDistiller;
  const projects =
    over.projects ??
    ({
      list: async () => [],
      get: async () => {
        throw new Error("none");
      },
    } as unknown as ProjectsStorageService);
  const chat =
    over.chat ??
    ({
      listConversationIds: async () => [],
      distilledCount: async () => 0,
      readTranscript: async () => ({ conversationId: "", sessionId: null, messages: [] }),
      markDistilled: async () => undefined,
    } as unknown as ChatTranscriptStore);
  return new MemoryDistillerService(
    over.vault as unknown as VaultService,
    distiller,
    (over.agents ?? { listAll: async () => [] }) as unknown as AgentRunnerService,
    (over.pipelines ?? { listAll: async () => [] }) as unknown as PipelineRunnerService,
    (over.goals ?? { listAll: async () => [] }) as unknown as GoalRunnerService,
    projects as ProjectsStorageService,
    chat as ChatTranscriptStore,
  );
}

describe("MemoryDistillerService", () => {
  let dir: string;
  const now = new Date("2026-06-16T03:00:00.000Z");
  const marker = (cwd: string) => path.join(cwd, "memory-distilled.json");

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "distiller-test-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("distils a terminal pipeline run into a digest note linked from its project MOC", async () => {
    const vault = makeVault();
    const service = makeService({
      vault,
      learnings: [
        { title: "pnpm is canonical", body: "Use pnpm, never npm.", type: "preference", tags: ["pnpm"] },
      ],
      pipelines: {
        listAll: async () => [
          {
            status: "done",
            pipelineRunId: "p1",
            pipelineId: "delivery",
            cwd: dir,
            projectPath: "/proj",
          },
        ],
        readArtifact: async () => ({ name: "docs.md", content: "Changed X for Y." }),
      } as unknown as PipelineRunnerService,
      projects: {
        list: async () => [{ id: "proj", path: "/proj", name: "Proj" }],
        get: async () => {
          throw new Error("none");
        },
      } as unknown as ProjectsStorageService,
    });

    const ref = await service.distill(now);

    expect(ref).toBe("memory-distill:1");
    expect(vault.createNote).toHaveBeenCalledTimes(1);
    expect(vault.notes.has("distilled-2026-06-16")).toBe(true);
    // The single learning's type/tags thread through onto the digest note (Fáze 3).
    expect(vault.notes.get("distilled-2026-06-16")?.type).toBe("preference");
    expect(vault.notes.get("distilled-2026-06-16")?.tags).toEqual(["pnpm"]);
    expect(vault.indexed).toEqual([{ moc: "proj", target: "distilled-2026-06-16" }]);
    expect(vault.daily).toHaveLength(1);
    // The run is marked so the next pass skips it.
    await expect(fs.access(marker(dir))).resolves.toBeUndefined();
  });

  it("is idempotent: a marked run is not distilled again", async () => {
    const pipelines = {
      listAll: async () => [
        {
          status: "done",
          pipelineRunId: "p1",
          pipelineId: "delivery",
          cwd: dir,
          projectPath: undefined,
        },
      ],
      readArtifact: async () => ({ name: "docs.md", content: "x" }),
    } as unknown as PipelineRunnerService;

    const first = makeService({
      vault: makeVault(),
      learnings: [{ title: "t", body: "b", type: "fact", tags: [] }],
      pipelines,
    });
    expect(await first.distill(now)).toBe("memory-distill:1");

    const secondVault = makeVault();
    const second = makeService({
      vault: secondVault,
      learnings: [{ title: "t", body: "b", type: "fact", tags: [] }],
      pipelines,
    });
    expect(await second.distill(now)).toBe("memory-distill:0");
    expect(secondVault.createNote).not.toHaveBeenCalled();
  });

  it("excludes non-terminal runs and files nothing", async () => {
    const vault = makeVault();
    const service = makeService({
      vault,
      learnings: [{ title: "t", body: "b", type: "fact", tags: [] }],
      pipelines: {
        listAll: async () => [
          { status: "running", pipelineRunId: "p1", pipelineId: "delivery", cwd: dir },
        ],
        readArtifact: async () => null,
      } as unknown as PipelineRunnerService,
    });

    expect(await service.distill(now)).toBe("memory-distill:0");
    expect(vault.createNote).not.toHaveBeenCalled();
    await expect(fs.access(marker(dir))).rejects.toBeTruthy();
  });

  it("marks runs but files no digest when the model returns no learnings", async () => {
    const vault = makeVault();
    const service = makeService({
      vault,
      learnings: [],
      pipelines: {
        listAll: async () => [
          { status: "done", pipelineRunId: "p1", pipelineId: "delivery", cwd: dir },
        ],
        readArtifact: async () => ({ name: "docs.md", content: "x" }),
      } as unknown as PipelineRunnerService,
    });

    expect(await service.distill(now)).toBe("memory-distill:1");
    expect(vault.createNote).not.toHaveBeenCalled();
    await expect(fs.access(marker(dir))).resolves.toBeUndefined();
  });

  it("distils a chat conversation's fresh tail and advances its marker", async () => {
    const vault = makeVault();
    const marked: Array<{ id: string; count: number }> = [];
    const service = makeService({
      vault,
      learnings: [
        { title: "operator prefers pnpm", body: "Always pnpm.", type: "preference", tags: ["pnpm"] },
      ],
      chat: {
        listConversationIds: async () => ["conv-1"],
        distilledCount: async () => 1, // first message already distilled
        readTranscript: async () => ({
          conversationId: "conv-1",
          sessionId: "s",
          messages: [
            { id: "m1", role: "user", text: "ahoj", at: "2026-06-16T01:00:00.000Z" },
            { id: "m2", role: "user", text: "vždycky používej pnpm", at: "2026-06-16T02:00:00.000Z" },
          ],
        }),
        markDistilled: async (id: string, count: number) => {
          marked.push({ id, count });
        },
      } as unknown as ChatTranscriptStore,
    });

    expect(await service.distill(now)).toBe("memory-distill:1");
    expect(vault.notes.has("distilled-2026-06-16")).toBe(true);
    // marker advanced to the full message count (2), not the cwd path
    expect(marked).toEqual([{ id: "conv-1", count: 2 }]);
  });

  it("skips a chat conversation with no new messages since the marker", async () => {
    const vault = makeVault();
    const service = makeService({
      vault,
      learnings: [{ title: "t", body: "b", type: "fact", tags: [] }],
      chat: {
        listConversationIds: async () => ["conv-1"],
        distilledCount: async () => 2,
        readTranscript: async () => ({
          conversationId: "conv-1",
          sessionId: "s",
          messages: [
            { id: "m1", role: "user", text: "a", at: "2026-06-16T01:00:00.000Z" },
            { id: "m2", role: "assistant", text: "b", at: "2026-06-16T02:00:00.000Z" },
          ],
        }),
        markDistilled: async () => undefined,
      } as unknown as ChatTranscriptStore,
    });

    expect(await service.distill(now)).toBe("memory-distill:0");
    expect(vault.createNote).not.toHaveBeenCalled();
  });

  it("is fail-open: a throwing runner does not break the pass", async () => {
    const vault = makeVault();
    const service = makeService({
      vault,
      pipelines: {
        listAll: async () => {
          throw new Error("disk gone");
        },
      } as unknown as PipelineRunnerService,
    });
    expect(await service.distill(now)).toBe("memory-distill:0");
  });

  it("merges into an existing similar digest note (SimilarNoteError) instead of duplicating (Fáze 3)", async () => {
    const vault = makeVault({ similarTo: { "distilled-2026-06-16": "distilled-2026-06-15" } });
    // Seed the "existing" note the fresh id would collide-by-similarity with.
    vault.notes.set("distilled-2026-06-15", { body: "yesterday's digest" });
    const service = makeService({
      vault,
      learnings: [{ title: "t", body: "b", type: "fact", tags: [] }],
      pipelines: {
        listAll: async () => [
          { status: "done", pipelineRunId: "p1", pipelineId: "delivery", cwd: dir, projectPath: "/proj" },
        ],
        readArtifact: async () => ({ name: "docs.md", content: "x" }),
      } as unknown as PipelineRunnerService,
      projects: {
        list: async () => [{ id: "proj", path: "/proj", name: "Proj" }],
        get: async () => {
          throw new Error("none");
        },
      } as unknown as ProjectsStorageService,
    });

    expect(await service.distill(now)).toBe("memory-distill:1");
    // No fresh note filed — the fresh id was never created…
    expect(vault.notes.has("distilled-2026-06-16")).toBe(false);
    // …the batch's sections were appended to the EXISTING similar note instead…
    expect(vault.notes.get("distilled-2026-06-15")?.body).toContain("yesterday's digest");
    expect(vault.notes.get("distilled-2026-06-15")?.body).toContain("## t");
    // …and the MOC link + daily line point at the existing note's id.
    expect(vault.indexed).toEqual([{ moc: "proj", target: "distilled-2026-06-15" }]);
    expect(vault.daily[0]).toContain("[[distilled-2026-06-15]]");
  });
});

describe("MemoryDistillerService — raw-note triage (Fáze 107)", () => {
  const now = new Date("2026-06-16T03:00:00.000Z");

  function rawNote(id: string, overrides: Partial<Note> = {}): Note {
    return {
      id,
      path: `knowledge/${id}.md`,
      tier: "knowledge",
      title: id,
      frontmatter: {},
      links: [],
      body: "raw body dump",
      raw: true,
      ...overrides,
    };
  }

  it("durable verdict: condenses the note, clears raw, stamps triagedAt, files/links, and logs one daily line", async () => {
    const note = rawNote("halda-1", { title: "Halda 1", body: "long raw dump" });
    const vault = makeVault({ raw: [note] });
    const service = makeService({
      vault,
      triage: {
        verdict: "durable",
        title: "Condensed title",
        body: "Condensed body.",
        type: "fact",
        tags: ["infra"],
      },
    });

    const ref = await service.distill(now);

    expect(ref).toBe("memory-distill:1");
    expect(vault.updates).toHaveLength(1);
    const [update] = vault.updates;
    expect(update?.id).toBe("halda-1");
    expect(update?.patch.title).toBe("Condensed title");
    expect(update?.patch.body).toBe("Condensed body.");
    const frontmatter = update?.patch.frontmatter as Record<string, unknown>;
    expect(frontmatter.raw).toBe(false);
    expect(frontmatter.triagedAt).toBe(now.toISOString());
    expect(frontmatter.type).toBe("fact");
    expect(frontmatter.tags).toEqual(["infra"]);
    expect(vault.daily).toHaveLength(1);
    expect(vault.daily[0]).toContain("[[halda-1]]");
  });

  it("noise verdict: clears raw, tags triaged-noise, logs one daily line, never deletes the note", async () => {
    const note = rawNote("halda-2");
    const vault = makeVault({ raw: [note] });
    const service = makeService({
      vault,
      triage: { verdict: "noise", title: "dup", body: "already known", tags: [] },
    });

    const ref = await service.distill(now);

    expect(ref).toBe("memory-distill:1");
    expect(vault.updates).toHaveLength(1);
    const [update] = vault.updates;
    const frontmatter = update?.patch.frontmatter as Record<string, unknown>;
    expect(frontmatter.raw).toBe(false);
    expect(frontmatter.tags).toContain("triaged-noise");
    expect(vault.daily).toHaveLength(1);
    // Only ever patched via updateNote — createNote (which could "replace") is
    // never invoked for an existing raw note.
    expect(vault.createNote).not.toHaveBeenCalled();
  });

  it("skips a raw note that already carries triagedAt (idempotent)", async () => {
    const note = rawNote("halda-3", { frontmatter: { triagedAt: "2026-06-15T00:00:00.000Z" } });
    const vault = makeVault({ raw: [note] });
    const service = makeService({
      vault,
      triage: { verdict: "durable", title: "t", body: "b", tags: [] },
    });

    expect(await service.distill(now)).toBe("memory-distill:0");
    expect(vault.updates).toHaveLength(0);
  });

  it("a triage failure on one note does not abort the pass or the other candidates", async () => {
    const failing = rawNote("halda-fail");
    const ok = rawNote("halda-ok");
    const vault = makeVault({ raw: [failing, ok] });
    const service = makeService({
      vault,
      triage: async (n) => {
        if (n.id === "halda-fail") throw new Error("model exploded");
        return { verdict: "durable", title: "ok title", body: "ok body", tags: [] };
      },
    });

    const ref = await service.distill(now);

    expect(ref).toBe("memory-distill:2");
    expect(vault.updates).toHaveLength(1);
    expect(vault.updates[0]?.id).toBe("halda-ok");
    expect(vault.daily).toHaveLength(1);
  });
});

describe("mergeLearningTags / mergeLearningType", () => {
  it("mergeLearningTags: unions and sorts tags across the batch", () => {
    expect(
      mergeLearningTags([
        { title: "a", body: "a", type: "fact", tags: ["b", "a"] },
        { title: "b", body: "b", type: "fact", tags: ["a", "c"] },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("mergeLearningTags: empty batch yields an empty list", () => {
    expect(mergeLearningTags([])).toEqual([]);
  });

  it("mergeLearningType: a uniform batch keeps its type", () => {
    expect(
      mergeLearningType([
        { title: "a", body: "a", type: "decision", tags: [] },
        { title: "b", body: "b", type: "decision", tags: [] },
      ]),
    ).toBe("decision");
  });

  it("mergeLearningType: a mixed batch has no single honest type", () => {
    expect(
      mergeLearningType([
        { title: "a", body: "a", type: "decision", tags: [] },
        { title: "b", body: "b", type: "fact", tags: [] },
      ]),
    ).toBeUndefined();
  });
});
