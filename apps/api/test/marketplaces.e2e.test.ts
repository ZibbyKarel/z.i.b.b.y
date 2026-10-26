import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

// Read-only routes + input validation only: nothing here reaches the `claude` CLI.
describe("Marketplaces API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "marketplaces-e2e-"));
    process.env.MARKETPLACES_FILE = path.join(dir, "marketplaces.json");
    process.env.CLAUDE_PLUGINS_DIR = path.join(dir, "plugins");
    process.env.MARKETPLACES_CLONE_DIR = path.join(dir, "clones");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.MARKETPLACES_FILE;
    delete process.env.CLAUDE_PLUGINS_DIR;
    delete process.env.MARKETPLACES_CLONE_DIR;
  });

  it("starts with no marketplaces and no marketplace skills", async () => {
    const list = await request(app.getHttpServer()).get("/api/marketplaces");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const skills = await request(app.getHttpServer()).get("/api/marketplace-skills");
    expect(skills.body).toEqual([]);
  });

  it("404s an unknown marketplace", async () => {
    const res = await request(app.getHttpServer()).get("/api/marketplaces/nope");
    expect(res.status).toBe(404);
  });

  it("400s an empty source and a dev source that is neither a path nor a git URL", async () => {
    const empty = await request(app.getHttpServer())
      .post("/api/marketplaces")
      .send({ source: " ", devMode: false });
    expect(empty.status).toBe(400);
    const relative = await request(app.getHttpServer())
      .post("/api/marketplaces")
      .send({ source: "owner/repo", devMode: true });
    expect(relative.status).toBe(400);
    expect(relative.body.message).toMatch(/absolute local path or a git URL/);
  });
});
