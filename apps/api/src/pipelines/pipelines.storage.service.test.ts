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
const sample = {
  id: "release",
  phases: [phase("a"), phase("b")],
  instructions: "ship it",
  outputs: [],
};
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

  it("round-trips the avatar field", async () => {
    const created = await service.create({
      id: "with-avatar",
      name: "With Avatar",
      avatar: "/avatars/orchestrator.png",
      instructions: "body",
      phases: [
        {
          id: "p1",
          type: "agent",
          agent: "architect",
          model: "opus",
          thinking: "high",
          consumes: "a.md",
          produces: "b.md",
        },
      ],
      outputs: [],
    });
    expect(created.avatar).toBe("/avatars/orchestrator.png");
    const read = await service.get("with-avatar");
    expect(read.avatar).toBe("/avatars/orchestrator.png");
  });

  it("clears the avatar when patched with avatar: null", async () => {
    const created = await service.create({ ...sample, id: "avatar-clear", avatar: "/avatars/x.png" });
    expect(created.avatar).toBe("/avatars/x.png");

    const updated = await service.update(created.id, { avatar: null });
    expect(updated.avatar).toBeUndefined();
    expect((await service.get(created.id)).avatar).toBeUndefined();
  });

  it("preserves the avatar when the patch omits the key entirely (JSON drops `avatar: undefined`)", async () => {
    const created = await service.create({
      ...sample,
      id: "avatar-preserve",
      avatar: "/avatars/x.png",
    });

    // Deliberately no `avatar` key at all — mirrors what the wire produces when the
    // client sends `{ avatar: undefined }` (JSON.stringify drops the key). A literal
    // `avatar: undefined` in a JS object literal is NOT equivalent: it creates an own
    // property that DOES override on spread.
    const updated = await service.update(created.id, { instructions: "unrelated change" });
    expect(updated.avatar).toBe("/avatars/x.png");
    expect((await service.get(created.id)).avatar).toBe("/avatars/x.png");
  });

  it("round-trips the ownerSubsystem tag through frontmatter (Phase 81)", async () => {
    const created = await service.create({ ...sample, id: "owned", ownerSubsystem: "forge" });
    expect(created.ownerSubsystem).toBe("forge");

    const parsed = matter(await fs.readFile(fileFor(dir, "owned"), "utf8"));
    expect(parsed.data.ownerSubsystem).toBe("forge");

    const read = await service.get("owned");
    expect(read.ownerSubsystem).toBe("forge");
  });

  it("leaves an untagged pipeline's ownerSubsystem absent — no phantom field written", async () => {
    await service.create(sample);
    const parsed = matter(await fs.readFile(fileFor(dir, "release"), "utf8"));
    expect(parsed.data).not.toHaveProperty("ownerSubsystem");

    const read = await service.get("release");
    expect(read.ownerSubsystem).toBeUndefined();
  });

  describe("avatar asset externalization (Phase 73)", () => {
    const dataUri = "data:image/png;base64,aGVsbG8gd29ybGQ="; // "hello world"

    it("externalizes an uploaded data-URI avatar to an asset file, not inline in the .md", async () => {
      const created = await service.create({ ...sample, id: "with-uploaded-avatar", avatar: dataUri });
      expect(created.avatar).toBe(dataUri);

      const raw = await fs.readFile(fileFor(dir, "with-uploaded-avatar"), "utf8");
      expect(raw).not.toContain("data:image");
      const parsed = matter(raw);
      expect(parsed.data.avatar).toBe("assets/with-uploaded-avatar.png");

      const assetBytes = await fs.readFile(
        path.join(dir, "assets", "with-uploaded-avatar.png"),
      );
      expect(assetBytes.toString("utf8")).toBe("hello world");

      const read = await service.get("with-uploaded-avatar");
      expect(read.avatar).toBe(dataUri);
    });

    it("stores a bundled /avatars/*.png avatar verbatim, writing no asset file", async () => {
      await service.create({ ...sample, id: "bundled-avatar", avatar: "/avatars/orchestrator.png" });
      const parsed = matter(await fs.readFile(fileFor(dir, "bundled-avatar"), "utf8"));
      expect(parsed.data.avatar).toBe("/avatars/orchestrator.png");
      await expect(
        fs.access(path.join(dir, "assets", "bundled-avatar.png")),
      ).rejects.toBeTruthy();
    });

    it("removes the asset file when an uploaded avatar is cleared", async () => {
      const created = await service.create({ ...sample, id: "avatar-asset-clear", avatar: dataUri });
      const assetFile = path.join(dir, "assets", "avatar-asset-clear.png");
      await expect(fs.access(assetFile)).resolves.toBeUndefined();

      const updated = await service.update(created.id, { avatar: null });
      expect(updated.avatar).toBeUndefined();
      await expect(fs.access(assetFile)).rejects.toBeTruthy();
    });

    it("removes the asset file on delete", async () => {
      const created = await service.create({ ...sample, id: "avatar-asset-delete", avatar: dataUri });
      const assetFile = path.join(dir, "assets", "avatar-asset-delete.png");
      await expect(fs.access(assetFile)).resolves.toBeUndefined();

      await service.delete(created.id);
      await expect(fs.access(assetFile)).rejects.toBeTruthy();
    });
  });

  describe("inline-avatar sweep (Phase 73 migration)", () => {
    it("externalizes a pre-existing inline data: avatar found in raw frontmatter on startup", async () => {
      const dataUri = "data:image/png;base64,aGVsbG8gd29ybGQ=";
      await fs.writeFile(
        fileFor(dir, "legacy-inline"),
        matter.stringify("Legacy body.\n", {
          name: "legacy-inline",
          phases: [phase("a")],
          avatar: dataUri,
        }),
        "utf8",
      );

      const restarted = new PipelinesStorageService(dir);
      await restarted.onModuleInit();

      const raw = await fs.readFile(fileFor(dir, "legacy-inline"), "utf8");
      expect(raw).not.toContain("data:image");
      const parsed = matter(raw);
      expect(parsed.data.avatar).toBe("assets/legacy-inline.png");

      const pipeline = await restarted.get("legacy-inline");
      expect(pipeline.avatar).toBe(dataUri);
    });

    it("leaves a bundled /avatars/*.png avatar byte-for-byte untouched on startup", async () => {
      const original = matter.stringify("Bundled body.\n", {
        name: "bundled-sweep",
        phases: [phase("a")],
        avatar: "/avatars/orchestrator.png",
      });
      await fs.writeFile(fileFor(dir, "bundled-sweep"), original, "utf8");

      const restarted = new PipelinesStorageService(dir);
      await restarted.onModuleInit();

      const raw = await fs.readFile(fileFor(dir, "bundled-sweep"), "utf8");
      expect(raw).toBe(original);
    });
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
        outputs: [],
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
        service.create({ id, phases: [phase("a")], instructions: "i", outputs: [] }),
      ).rejects.toBeInstanceOf(InvalidPipelineIdError);
    }
  });
});
