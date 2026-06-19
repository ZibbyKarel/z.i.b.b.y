import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidSkillIdError, SkillConflictError, SkillNotFoundError } from "./skills.errors";
import { SkillsStorageService } from "./skills.storage.service";

const sample = { id: "summarize", glyph: "spark", desc: "TL;DR", instructions: "Be concise." };
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.md`);

describe("SkillsStorageService", () => {
  let dir: string;
  let service: SkillsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-test-"));
    service = new SkillsStorageService(dir);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes a SKILL.md with frontmatter + instructions body", async () => {
    const skill = await service.create(sample);
    expect(skill).toEqual({ ...sample, name: "summarize" });
    const parsed = matter(await fs.readFile(fileFor(dir, "summarize"), "utf8"));
    expect(parsed.data.glyph).toBe("spark");
    expect(parsed.content.trim()).toBe("Be concise.");
  });

  it("rejects creating a skill with an existing id", async () => {
    await service.create(sample);
    await expect(service.create(sample)).rejects.toBeInstanceOf(SkillConflictError);
  });

  it("404s on get/delete of a missing skill", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(SkillNotFoundError);
    await expect(service.delete("nope")).rejects.toBeInstanceOf(SkillNotFoundError);
  });

  it("drops a single bad frontmatter field rather than discarding the skill", async () => {
    // glyph stored as a number — not a string, so it should be dropped, not fatal.
    await fs.writeFile(
      fileFor(dir, "halfbad"),
      matter.stringify("\nbody\n", { name: "halfbad", glyph: 42 }),
      "utf8",
    );
    const skill = await service.get("halfbad");
    expect(skill.glyph).toBeUndefined();
    expect(skill.instructions).toBe("body");
  });

  it("skips a structurally broken file in list() instead of failing", async () => {
    await service.create(sample);
    // Empty body → fails SkillSchema (instructions min 1) → skipped, not thrown.
    await fs.writeFile(fileFor(dir, "empty"), matter.stringify("\n\n", { name: "empty" }), "utf8");
    const list = await service.list();
    expect(list.map((s) => s.id)).toEqual(["summarize"]);
  });

  it("refuses unsafe ids (path traversal) on create", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(service.create({ id, instructions: "i" })).rejects.toBeInstanceOf(
        InvalidSkillIdError,
      );
    }
  });
});
