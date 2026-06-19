import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CorruptGoalFileError, GoalConflictError, GoalNotFoundError } from "./goals.errors";
import { GoalsStorageService } from "./goals.storage.service";

const sampleInput = {
  id: "ship-feature",
  objective: "Ship feature Y green",
  maker: { kind: "pipeline" as const, id: "delivery" },
  verifier: { kind: "checks" as const, commands: ["pnpm test"] },
  maxIterations: 4,
  instructions: "Iterate until the checks pass.",
};

const fileFor = (dir: string, id: string) => path.join(dir, `${id}.goal.md`);

describe("GoalsStorageService", () => {
  let dir: string;
  let service: GoalsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "goals-test-"));
    service = new GoalsStorageService(dir);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes a .goal.md file with maker/verifier/maxIterations in frontmatter", async () => {
    const goal = await service.create(sampleInput);
    expect(goal.name).toBe("ship-feature");
    expect(goal.maker).toEqual({ kind: "pipeline", id: "delivery" });

    const raw = await fs.readFile(fileFor(dir, "ship-feature"), "utf8");
    const parsed = matter(raw);
    expect(parsed.data.objective).toBe("Ship feature Y green");
    expect(parsed.data.maxIterations).toBe(4);
    expect(parsed.data.maker).toEqual({ kind: "pipeline", id: "delivery" });
    expect(parsed.data.verifier).toEqual({ kind: "checks", commands: ["pnpm test"] });
    expect(parsed.content.trim()).toBe("Iterate until the checks pass.");
  });

  it("round-trips through get (frontmatter ↔ Goal)", async () => {
    await service.create(sampleInput);
    const fetched = await service.get("ship-feature");
    expect(fetched).toEqual({ ...sampleInput, name: "ship-feature" });
  });

  it("round-trips a claude verifier", async () => {
    await service.create({
      ...sampleInput,
      id: "claude-goal",
      verifier: { kind: "claude", agent: "reviewer", model: "haiku" },
    });
    const fetched = await service.get("claude-goal");
    expect(fetched.verifier).toEqual({ kind: "claude", agent: "reviewer", model: "haiku" });
  });

  it("rejects a duplicate id", async () => {
    await service.create(sampleInput);
    await expect(service.create(sampleInput)).rejects.toBeInstanceOf(GoalConflictError);
  });

  it("throws not-found for an unknown id", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(GoalNotFoundError);
  });

  it("treats a file with no maker as corrupt (the loop can't run without it)", async () => {
    const raw = matter.stringify("\nbody\n", {
      objective: "x",
      maxIterations: 2,
      verifier: { kind: "checks" },
    });
    await fs.writeFile(fileFor(dir, "broken"), raw, "utf8");
    await expect(service.get("broken")).rejects.toBeInstanceOf(CorruptGoalFileError);
  });

  it("lists goals sorted by id, skipping corrupt files", async () => {
    await service.create(sampleInput);
    await service.create({ ...sampleInput, id: "another" });
    await fs.writeFile(fileFor(dir, "garbage"), "not: [valid", "utf8");
    const list = await service.list();
    expect(list.map((g) => g.id)).toEqual(["another", "ship-feature"]);
  });
});
