import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { ChainsStorageService } from "../chains/chains.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { OwnerBackfillService } from "./owner-backfill.service";

describe("OwnerBackfillService (NS2 F1b)", () => {
  let root: string;
  let pipelines: PipelinesStorageService;
  let chains: ChainsStorageService;
  let agents: AgentsStorageService;
  let integrations: IntegrationsStorageService;
  let backfill: OwnerBackfillService;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "owner-backfill-test-"));
    pipelines = new PipelinesStorageService(path.join(root, "pipelines"));
    chains = new ChainsStorageService(path.join(root, "chains"));
    agents = new AgentsStorageService(path.join(root, "agents"));
    integrations = new IntegrationsStorageService(
      path.join(root, "integrations"),
      path.join(root, "integration-state"),
    );
    await Promise.all([
      pipelines.onModuleInit(),
      chains.onModuleInit(),
      agents.onModuleInit(),
      integrations.onModuleInit(),
    ]);
    backfill = new OwnerBackfillService(pipelines, chains, agents, integrations);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("tags an untagged delivery pipeline forge, and its phase agents forge", async () => {
    await pipelines.create({
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
    });
    await agents.create({ id: "architect", instructions: "plan the work" });

    await backfill.onModuleInit();

    expect((await pipelines.get("delivery")).ownerSubsystem).toBe("forge");
    expect((await agents.get("architect")).ownerSubsystem).toBe("forge");
  });

  it("tags an untagged research-shaped pipeline scout, and a chain scout", async () => {
    await pipelines.create({
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
    });
    await chains.create({
      id: "audit-develop",
      steps: [{ pipeline: "code-audit" }],
      instructions: "audit then develop",
    });

    await backfill.onModuleInit();

    expect((await pipelines.get("research")).ownerSubsystem).toBe("scout");
    expect((await chains.get("audit-develop")).ownerSubsystem).toBe("scout");
  });

  it("tags every untagged integration puls", async () => {
    await integrations.create({
      id: "team-slack",
      kind: "slack",
      projectId: "acme",
      config: { kind: "slack", channels: [] },
    });

    await backfill.onModuleInit();

    expect((await integrations.get("team-slack")).ownerSubsystem).toBe("puls");
  });

  it("skips an already-owned entity (idempotent — never overwrites an existing owner)", async () => {
    await pipelines.create({
      id: "delivery",
      phases: [{ id: "a", type: "verify" }],
      outputs: [],
      instructions: "x",
      ownerSubsystem: "loom", // deliberately NOT what the seed table would pick
    });

    await backfill.onModuleInit();

    expect((await pipelines.get("delivery")).ownerSubsystem).toBe("loom");
  });

  it("running onModuleInit twice is a no-op the second time (idempotent)", async () => {
    await integrations.create({
      id: "team-slack",
      kind: "slack",
      projectId: "acme",
      config: { kind: "slack", channels: [] },
    });

    await backfill.onModuleInit();
    const firstPass = await integrations.get("team-slack");
    await backfill.onModuleInit();
    const secondPass = await integrations.get("team-slack");

    expect(firstPass.ownerSubsystem).toBe("puls");
    expect(secondPass).toEqual(firstPass);
  });

  it("leaves an unmatched pipeline untagged (no rule → undefined → skipped, never fatal)", async () => {
    await pipelines.create({
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
    });

    await expect(backfill.onModuleInit()).resolves.toBeUndefined();

    expect((await pipelines.get("demo-pipe")).ownerSubsystem).toBeUndefined();
  });

  it("a corrupt entity file is skipped, never fatal to boot", async () => {
    const pipelinesDir = path.join(root, "pipelines");
    await fs.mkdir(pipelinesDir, { recursive: true });
    await fs.writeFile(
      path.join(pipelinesDir, "broken.pipeline.md"),
      "not: [valid yaml frontmatter",
    );
    await pipelines.create({
      id: "delivery",
      phases: [{ id: "a", type: "verify" }],
      outputs: [],
      instructions: "x",
    });

    await expect(backfill.onModuleInit()).resolves.toBeUndefined();
    expect((await pipelines.get("delivery")).ownerSubsystem).toBe("forge");
  });
});
