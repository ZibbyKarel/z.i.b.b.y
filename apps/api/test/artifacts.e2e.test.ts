import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ArtifactsStorageService } from "../src/artifacts/artifacts.storage.service";

/**
 * N2a — the durable artifact registry over HTTP. Read-only: records are seeded
 * through the storage service (the same seam the pipeline delivery sinks use);
 * the contract exposes only list + get.
 */
describe("Artifacts API (e2e)", () => {
  let app: INestApplication;
  let artifactsDir: string;

  beforeAll(async () => {
    artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifacts-e2e-"));
    process.env.ARTIFACTS_DIR = artifactsDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const store = app.get(ArtifactsStorageService);
    await store.record({
      id: "research_1_vault-note_report-md",
      kind: "vault-note",
      locator: "research/topic-x",
      from: "report.md",
      producedBy: { runRef: "research_1", pipelineId: "nightly-research", projectId: "acme" },
      createdAt: "2026-07-01T08:00:00.000Z",
    });
    await store.record({
      id: "delivery_2_pr_docs-md",
      kind: "pr",
      locator: "https://example.test/pr/7",
      from: "docs.md",
      producedBy: { runRef: "delivery_2", pipelineId: "delivery" },
      createdAt: "2026-07-01T09:00:00.000Z",
    });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(artifactsDir, { recursive: true, force: true });
    delete process.env.ARTIFACTS_DIR;
  });

  it("lists records newest-first", async () => {
    const res = await request(app.getHttpServer()).get("/api/artifacts").expect(200);
    expect(res.body.map((r: { id: string }) => r.id)).toEqual([
      "delivery_2_pr_docs-md",
      "research_1_vault-note_report-md",
    ]);
  });

  it("filters by projectId / pipelineId", async () => {
    const byProject = await request(app.getHttpServer())
      .get("/api/artifacts?projectId=acme")
      .expect(200);
    expect(byProject.body).toHaveLength(1);
    expect(byProject.body[0].producedBy.pipelineId).toBe("nightly-research");

    const byPipeline = await request(app.getHttpServer())
      .get("/api/artifacts?pipelineId=delivery")
      .expect(200);
    expect(byPipeline.body.map((r: { kind: string }) => r.kind)).toEqual(["pr"]);
  });

  it("gets one record by id; unknown id → 404", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/artifacts/delivery_2_pr_docs-md")
      .expect(200);
    expect(res.body.locator).toBe("https://example.test/pr/7");

    await request(app.getHttpServer()).get("/api/artifacts/ghost").expect(404);
  });
});
