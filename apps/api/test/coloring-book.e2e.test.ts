import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PipelineRunnerService } from "../src/pipelines/pipeline-runner.service";
import { defaultEmployeesDir, seedEmployeeFixture } from "./fixtures/employee-fixture";

/**
 * P4-03 — the shipped `coloring-book` pipeline end to end, token-free: agent phases
 * run the demo stage fed by PIPELINE_DEMO_FIXTURE_DIR, tool phases run the REAL
 * `product-factory` CLI with the mock image/vision providers. Ends with a book
 * folder holding interior.pdf + cover.pdf.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const FARM = path.join(REPO, "libs", "product-factory", "fixtures", "farm-4");
const AGENTS = [
  "book-creative-director",
  "book-page-planner",
  "book-illustrator",
  "book-visual-qa",
  "listing-specialist",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("coloring-book pipeline (e2e, mock providers)", () => {
  let app: INestApplication;
  const dirs: string[] = [];
  const tmp = async (p: string) => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), p));
    dirs.push(d);
    return d;
  };

  beforeAll(async () => {
    const pipelinesDir = await tmp("cb-pipelines-");
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.PIPELINE_RUNS_DIR = await tmp("cb-runs-");
    process.env.PROJECTS_DIR = await tmp("cb-projects-");
    process.env.VAULT_DIR = await tmp("cb-vault-");
    process.env.AGENT_DEMO_STEPS = "1";
    process.env.AGENT_DEMO_DELAY_MS = "1";

    const fixtures = await tmp("cb-fixtures-");
    const put = async (phase: string, file: string, body: string) => {
      await fs.mkdir(path.join(fixtures, phase), { recursive: true });
      await fs.writeFile(path.join(fixtures, phase, file), body);
    };
    await put("concept", "visual-bible.md", "# Visual Bible\n\nFarm animals, ages 2-4.\n");
    await put(
      "plan",
      "content-plan.md",
      await fs.readFile(path.join(FARM, "content-plan.md"), "utf8"),
    );
    await put("illustrate", "jobs.json", await fs.readFile(path.join(FARM, "jobs.json"), "utf8"));
    await put(
      "visual-audit",
      "visual-audit.md",
      "All pages consistent.\n\n<verdict>pass</verdict>\n",
    );
    await put(
      "listing",
      "listing.md",
      "# Listing — Amazon KDP paperback\n\n## Title\nHappy Farm Friends\n",
    );
    process.env.PIPELINE_DEMO_FIXTURE_DIR = fixtures;

    await fs.copyFile(
      path.join(REPO, ".zibby", "data", "pipelines", "coloring-book.pipeline.md"),
      path.join(pipelinesDir, "coloring-book.pipeline.md"),
    );
    for (const agentId of AGENTS)
      await seedEmployeeFixture(defaultEmployeesDir(), {
        id: `employee_${agentId}`,
        agentId,
        department: "pub",
      });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/departments")
      .send({
        id: "pub",
        code: "PUB",
        name: "Publishing",
        tagline: "Sellable digital products",
        mandate: "x",
        color: "#c084fc",
        division: "business",
        icon: "book",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({
        id: "publishing",
        name: "Publishing",
        path: await tmp("cb-project-"),
        env: {
          PF_IMAGE_PROVIDER: "mock",
          PF_VISION_PROVIDER: "mock",
          PF_CREATED_AT: "2026-10-01T00:00:00.000Z",
        },
      })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.PIPELINE_DEMO_FIXTURE_DIR;
    for (const d of dirs) await fs.rm(d, { recursive: true, force: true, maxRetries: 5 });
  });

  it("runs brief → book folder with interior.pdf and cover.pdf", { timeout: 120_000 }, async () => {
    const runner = app.get(PipelineRunnerService);
    const brief = "theme: farm animals\ntargetAge: {min: 2, max: 4}\npageCount: 4\n";
    const start = await runner.start(
      "coloring-book",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      brief,
    );
    let run = runner.get(start.pipelineRunId);
    for (let t = Date.now(); run.status === "running" && Date.now() - t < 110_000; ) {
      await sleep(100);
      run = runner.get(start.pipelineRunId);
    }
    const trail = run.stageRuns.map((s) => `${s.phaseId}:${s.status}`);
    expect({ status: run.status, trail }).toMatchObject({ status: "done" });
    expect(run.stageRuns.map((s) => s.phaseId)).toEqual([
      "concept",
      "plan",
      "plan-check",
      "illustrate",
      "produce",
      "visual-audit",
      "render",
      "preflight",
      "listing",
      "finalize",
    ]);
    const book = path.join(run.cwd, "book");
    for (const f of ["interior.pdf", "cover.pdf", "listing.md", "README.md", "plan.json"])
      expect((await fs.stat(path.join(book, f))).size).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(run.cwd, "01_concept", "brief.md"), "utf8")).toContain(
      "farm animals",
    );
    expect(run.budget?.maxCostUsd).toBe(15.75);
  });
});
