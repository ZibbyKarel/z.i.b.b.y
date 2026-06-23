import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunnerService } from "../agents/agent-runner.service";
import type { GoalRunnerService } from "../goals/goal-runner.service";
import type { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import type { ProjectsStorageService } from "../projects/projects.storage.service";
import type { ChatTranscriptStore } from "../chat/chat-transcript.store";
import type { ClaudeCliDistiller, Learning } from "./claude-cli-distiller";
import { MemoryDistillerService } from "./memory-distiller.service";
import { DuplicateNoteError, type VaultService } from "./vault.service";

/** A vault double that records the writes the distiller makes. */
function makeVault() {
  const notes = new Map<string, { body: string }>();
  const indexed: Array<{ moc: string; target: string }> = [];
  const daily: string[] = [];
  return {
    indexed,
    daily,
    notes,
    createNote: vi.fn(async (input: { id: string; body: string }) => {
      if (notes.has(input.id)) throw new DuplicateNoteError(input.id);
      notes.set(input.id, { body: input.body });
      return {};
    }),
    appendToNote: vi.fn(async (id: string, text: string) => {
      const existing = notes.get(id);
      if (existing) existing.body += `\n${text}`;
      return {};
    }),
    updateIndex: vi.fn(async (moc: string, target: string) => {
      indexed.push({ moc, target });
      return {};
    }),
    appendDaily: vi.fn(async (text: string) => {
      daily.push(text);
      return {};
    }),
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
}) {
  const distiller = {
    distill: vi.fn(async () => over.learnings ?? []),
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
      learnings: [{ title: "pnpm is canonical", body: "Use pnpm, never npm." }],
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
      learnings: [{ title: "t", body: "b" }],
      pipelines,
    });
    expect(await first.distill(now)).toBe("memory-distill:1");

    const secondVault = makeVault();
    const second = makeService({
      vault: secondVault,
      learnings: [{ title: "t", body: "b" }],
      pipelines,
    });
    expect(await second.distill(now)).toBe("memory-distill:0");
    expect(secondVault.createNote).not.toHaveBeenCalled();
  });

  it("excludes non-terminal runs and files nothing", async () => {
    const vault = makeVault();
    const service = makeService({
      vault,
      learnings: [{ title: "t", body: "b" }],
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
      learnings: [{ title: "operator prefers pnpm", body: "Always pnpm." }],
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
      learnings: [{ title: "t", body: "b" }],
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
});
