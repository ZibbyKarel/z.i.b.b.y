import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors";
import { PipelinesStorageService } from "./pipelines.storage.service";

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "agent" as const,
  agent: "writer",
  consumes: "in.md",
  produces: "out.md",
  model: "sonnet" as const,
  thinking: "medium" as const,
  ...extra,
});
const sample = { id: "release", phases: [phase("a"), phase("b")], instructions: "ship it" };
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.pipeline.md`);

describe("PipelinesStorageService", () => {
  let dir: string;
  let service: PipelinesStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipelines-test-"));
    service = new PipelinesStorageService(dir);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes a .pipeline.md with phases in frontmatter + instructions body", async () => {
    const created = await service.create(sample);
    expect(created.phases.map((p) => p.id)).toEqual(["a", "b"]);
    const parsed = matter(await fs.readFile(fileFor(dir, "release"), "utf8"));
    expect(Array.isArray(parsed.data.phases)).toBe(true);
    expect(parsed.content.trim()).toBe("ship it");
  });

  it("round-trips a pipeline through get()", async () => {
    await service.create(sample);
    const got = await service.get("release");
    expect(got.phases).toHaveLength(2);
    expect(got.instructions).toBe("ship it");
    expect(got.outputs).toEqual([]); // default when none declared
  });

  it("round-trips output sinks through the .pipeline.md frontmatter", async () => {
    await service.create({
      ...sample,
      id: "delivery",
      outputs: [
        { type: "pr", from: "out.md" },
        { type: "file", from: "out.md", dest: "vault", to: "note-1" },
      ],
    });
    const parsed = matter(await fs.readFile(fileFor(dir, "delivery"), "utf8"));
    expect(Array.isArray(parsed.data.outputs)).toBe(true);
    const got = await service.get("delivery");
    expect(got.outputs).toEqual([
      { type: "pr", from: "out.md" },
      { type: "file", from: "out.md", dest: "vault", to: "note-1" },
    ]);
  });

  it("rejects a duplicate id and a dangling loop target", async () => {
    await service.create(sample);
    await expect(service.create(sample)).rejects.toBeInstanceOf(PipelineConflictError);
    await expect(
      service.create({
        id: "bad",
        phases: [
          phase("x", { loop: { to: "ghost", maxRetries: 1, escalate: false, then: "fail" } }),
        ],
        instructions: "y",
      }),
    ).rejects.toBeInstanceOf(InvalidPipelineError);
  });

  it("404s on get/delete of a missing pipeline", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(PipelineNotFoundError);
    await expect(service.delete("nope")).rejects.toBeInstanceOf(PipelineNotFoundError);
  });

  it("skips a structurally broken pipeline file in list()", async () => {
    await service.create(sample);
    // No phases → fails schema (min 1) → skipped, not thrown.
    await fs.writeFile(
      fileFor(dir, "broken"),
      matter.stringify("\nbody\n", { name: "broken" }),
      "utf8",
    );
    const list = await service.list();
    expect(list.map((p) => p.id)).toEqual(["release"]);
  });

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../evil", "a/b", ".."]) {
      await expect(
        service.create({ id, phases: [phase("a")], instructions: "i" }),
      ).rejects.toBeInstanceOf(InvalidPipelineIdError);
    }
  });
});
