import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { WorkflowsStorageService } from "../workflows/workflows.storage.service";
import { OwnerBackfillService } from "./owner-backfill.service";

describe("OwnerBackfillService (NS2 F1b)", () => {
  let root: string;
  let workflows: WorkflowsStorageService;
  let agents: AgentsStorageService;
  let backfill: OwnerBackfillService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "owner-backfill-test-"));
    workflows = new WorkflowsStorageService(path.join(root, "workflows"));
    agents = new AgentsStorageService(path.join(root, "agents"));
    await Promise.all([workflows.onModuleInit(), agents.onModuleInit()]);
    backfill = new OwnerBackfillService(workflows, agents);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("tags an untagged delivery workflow dev, and its phase agents dev", async () => {
    await workflows.create({
      id: "delivery",
      phases: [
        {
          id: "architekt",
          type: "agent",
          agent: "architect",
          consumes: "task.md",
          produces: "plan.md",
          model: "opus",
          thinking: "high",
        },
      ],
      outputs: [],
      instructions: "do delivery",
      complexity: "standard",
    });
    await agents.create({ id: "architect", instructions: "plan the work" });

    await backfill.onModuleInit();

    expect((await workflows.get("delivery")).department).toBe("dev");
    expect((await agents.get("architect")).department).toBe("dev");
  });

  it("tags an untagged research-shaped workflow research", async () => {
    await workflows.create({
      id: "research",
      phases: [
        {
          id: "scan",
          type: "agent",
          agent: "search-specialist",
          consumes: "task.md",
          produces: "sources.md",
          model: "haiku",
          thinking: "low",
        },
      ],
      outputs: [],
      instructions: "do research",
      complexity: "standard",
    });

    await backfill.onModuleInit();

    expect((await workflows.get("research")).department).toBe("rnd");
  });

  it("skips an already-owned entity (idempotent — never overwrites an existing owner)", async () => {
    await workflows.create({
      id: "delivery",
      phases: [{ id: "a", type: "verify" }],
      outputs: [],
      instructions: "x",
      department: "qa", // deliberately NOT what the seed table would pick
      complexity: "standard",
    });

    await backfill.onModuleInit();

    expect((await workflows.get("delivery")).department).toBe("qa");
  });

  it("running onModuleInit twice is a no-op the second time (idempotent)", async () => {
    await workflows.create({
      id: "delivery",
      phases: [{ id: "a", type: "verify" }],
      outputs: [],
      instructions: "x",
      complexity: "standard",
    });

    await backfill.onModuleInit();
    const firstPass = await workflows.get("delivery");
    await backfill.onModuleInit();
    const secondPass = await workflows.get("delivery");

    expect(firstPass.department).toBe("dev");
    expect(secondPass).toEqual(firstPass);
  });

  it("leaves an unmatched workflow untagged (no rule → undefined → skipped, never fatal)", async () => {
    await workflows.create({
      id: "demo-pipe",
      phases: [
        {
          id: "a",
          type: "agent",
          agent: "demo-skill",
          consumes: "a.in",
          produces: "a.out",
          model: "sonnet",
          thinking: "medium",
        },
      ],
      outputs: [],
      instructions: "x",
      complexity: "standard",
    });

    await expect(backfill.onModuleInit()).resolves.toBeUndefined();

    expect((await workflows.get("demo-pipe")).department).toBeUndefined();
  });

  it("a corrupt entity file is skipped, never fatal to boot", async () => {
    const workflowsDir = path.join(root, "workflows");
    await fs.mkdir(workflowsDir, { recursive: true });
    await fs.writeFile(
      path.join(workflowsDir, "broken.workflow.md"),
      "not: [valid yaml frontmatter",
    );
    await workflows.create({
      id: "delivery",
      phases: [{ id: "a", type: "verify" }],
      outputs: [],
      instructions: "x",
      complexity: "standard",
    });

    await expect(backfill.onModuleInit()).resolves.toBeUndefined();
    expect((await workflows.get("delivery")).department).toBe("dev");
  });
});
