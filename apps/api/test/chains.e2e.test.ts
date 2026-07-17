import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T>, timeoutMs = 25000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(40);
  }
}

/**
 * N2b — the REFERENCE CHAIN, end to end in demo mode: the north-star's
 * "research topic X overnight, then build an app from the result".
 * `nightly-research` delivers its report as a vault-note artifact (N2a record);
 * the chain hands that note's CONTENT to `build-feature` as its first phase's
 * `consumes` handoff; the chain lands `done`.
 */
describe("Chains API (e2e)", () => {
  let app: INestApplication;
  const dirs: Record<string, string> = {};

  const ENV = [
    "AGENTS_DIR",
    "PIPELINES_DIR",
    "PIPELINE_RUNS_DIR",
    "PROJECTS_DIR",
    "VAULT_DIR",
    "ARTIFACTS_DIR",
    "CHAINS_DIR",
    "CHAIN_RUNS_DIR",
    "AGENT_DEMO_STEPS",
    "AGENT_DEMO_DELAY_MS",
  ] as const;

  beforeAll(async () => {
    for (const key of [
      "agents",
      "pipelines",
      "runs",
      "projects",
      "vault",
      "artifacts",
      "chains",
      "chainRuns",
    ]) {
      dirs[key] = await fs.mkdtemp(path.join(os.tmpdir(), `chains-${key}-`));
    }
    process.env.AGENTS_DIR = dirs.agents;
    process.env.PIPELINES_DIR = dirs.pipelines;
    process.env.PIPELINE_RUNS_DIR = dirs.runs;
    process.env.PROJECTS_DIR = dirs.projects;
    process.env.VAULT_DIR = dirs.vault;
    process.env.ARTIFACTS_DIR = dirs.artifacts;
    process.env.CHAINS_DIR = dirs.chains;
    process.env.CHAIN_RUNS_DIR = dirs.chainRuns;
    process.env.AGENT_DEMO_STEPS = "2";
    process.env.AGENT_DEMO_DELAY_MS = "20";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Seed the roster the two pipelines reference.
    await request(app.getHttpServer()).post("/api/agents").send({
      id: "writer",
      name: "Writer",
      category: "Dev",
      description: "Writes things",
      instructions: "Write.",
      ownerSubsystem: "forge",
    });
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "nightly-research",
        name: "Nightly research",
        phases: [
          {
            id: "research",
            agent: "writer",
            consumes: "brief.md",
            produces: "report.md",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        outputs: [{ type: "file", from: "report.md", dest: "vault", to: "research-topic-x" }],
        instructions: "Research the topic.",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "build-feature",
        name: "Build feature",
        phases: [
          {
            id: "build",
            agent: "writer",
            consumes: "brief.md",
            produces: "app.md",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        instructions: "Build from the brief.",
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const dir of Object.values(dirs)) await fs.rm(dir, { recursive: true, force: true });
    for (const k of ENV) delete process.env[k];
  });

  it("createChain validates step pipelines (422 on a dangling step)", async () => {
    await request(app.getHttpServer())
      .post("/api/chains")
      .send({ id: "bad-chain", steps: [{ pipeline: "does-not-exist" }] })
      .expect(422);
  });

  it("runs the reference chain: research → artifact → build, landing done", async () => {
    await request(app.getHttpServer())
      .post("/api/chains")
      .send({
        id: "research-then-build",
        name: "Research → Build",
        steps: [{ pipeline: "nightly-research" }, { pipeline: "build-feature" }],
        instructions: "Research topic X overnight, then build an app from the result.",
      })
      .expect(201);

    const started = await request(app.getHttpServer())
      .post("/api/chains/run".replace("/run", "/research-then-build/run"))
      .send({})
      .expect(201);
    const chainRunId = started.body.chainRunId as string;
    expect(started.body.status).toBe("running");

    // The chain advances on its own: research finishes, delivers the vault note,
    // the runner hands the note content to build-feature, build finishes → done.
    const done = await until(async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/chains/runs/${chainRunId}`)
        .expect(200);
      return res.body.status === "done" ? res.body : null;
    });

    // Step 0 bound its artifact record — the durable provenance the handoff used.
    const artifactId = done.steps[0].artifactId as string;
    expect(artifactId).toBeTruthy();
    const artifact = await request(app.getHttpServer())
      .get(`/api/artifacts/${artifactId}`)
      .expect(200);
    expect(artifact.body.kind).toBe("vault-note");
    expect(artifact.body.locator).toBe("research-topic-x");

    // The handoff really happened: build-feature's first stage consumed the
    // research report's content (the vault note body), copied into its sandbox
    // (stage sandboxes are numbered in dispatch order — P1-T1).
    const buildRunRef = done.steps[1].runRef as string;
    const consumed = await fs.readFile(
      path.join(dirs.runs as string, buildRunRef, "01_build", "brief.md"),
      "utf8",
    );
    expect(consumed).toContain("output of research"); // the demo stage's report body
    // And step 0's own input was the chain instructions.
    const researchRunRef = done.steps[0].runRef as string;
    const seeded = await fs.readFile(
      path.join(dirs.runs as string, researchRunRef, "01_research", "brief.md"),
      "utf8",
    );
    expect(seeded).toContain("Research topic X overnight");
  }, 30_000);

  it("lists chain runs and 404s an unknown run/chain", async () => {
    const list = await request(app.getHttpServer()).get("/api/chains/runs").expect(200);
    expect(list.body.length).toBeGreaterThan(0);
    await request(app.getHttpServer()).get("/api/chains/runs/ghost").expect(404);
    await request(app.getHttpServer()).post("/api/chains/ghost/run").send({}).expect(404);
  });
});
