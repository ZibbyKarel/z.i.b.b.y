import { promises as fs } from "node:fs";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);

describe("Project health API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let target: Server;
  let targetUrl: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "project-health-e2e-"));
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.PROJECTS_DIR = path.join(dir, "projects");
    process.env.PROJECT_HEALTH_DIR = path.join(dir, "project-health");

    // A local health endpoint the real `fetch` can reach — always 200.
    target = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
    targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}/health`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => target.close(() => resolve()));
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.PROJECTS_DIR;
    delete process.env.PROJECT_HEALTH_DIR;
    delete process.env.CLAUDE_BIN;
  });

  it("lists nothing before any check", async () => {
    const res = await request(app.getHttpServer()).get("/api/project-health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("analyze on an unknown project → 404", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/project-health/ghost/analyze")
      .send({});
    expect(res.status).toBe(404);
  });

  it("check on a project without a healthCheck → 404", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "plain", name: "Plain" });
    expect(created.status).toBe(201);
    const res = await request(app.getHttpServer()).post("/api/project-health/plain/check").send({});
    expect(res.status).toBe(404);
  });

  it("check on a healthy project → 200 up, listed, and analyze → 409", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "acme", name: "Acme", healthCheck: { url: targetUrl, intervalSec: 60 } });
    expect(created.status).toBe(201);
    expect(created.body.healthCheck).toEqual({ url: targetUrl, intervalSec: 60 });

    const check = await request(app.getHttpServer())
      .post("/api/project-health/acme/check")
      .send({});
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({ projectId: "acme", url: targetUrl, state: "up" });
    expect(check.body.httpStatus).toBe(200);

    const list = await request(app.getHttpServer()).get("/api/project-health?projectId=acme");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    // Durable on disk — one file per project.
    const onDisk = JSON.parse(
      await fs.readFile(path.join(dir, "project-health", "acme.json"), "utf8"),
    );
    expect(onDisk.state).toBe("up");

    const analyze = await request(app.getHttpServer())
      .post("/api/project-health/acme/analyze")
      .send({});
    expect(analyze.status).toBe(409);
    expect(analyze.body.message).toEqual(expect.any(String));
  });

  it("PATCH healthCheck: null clears it from the project", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/projects/acme")
      .send({ healthCheck: null });
    expect(res.status).toBe(200);
    expect(res.body.healthCheck).toBeUndefined();
  });

  it("rejects a non-http health url on create", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "bad", name: "Bad", healthCheck: { url: "javascript:alert(1)" } });
    expect(res.status).toBe(400);
  });
});
