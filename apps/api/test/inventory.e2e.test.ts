import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("Inventory API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let claudeDir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "inventory-e2e-"));
    claudeDir = path.join(dir, "claude");
    await fs.mkdir(claudeDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = claudeDir;
    process.env.SKILLS_DIR = path.join(dir, "skills");

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/skills")
      .send({ id: "inv-demo", desc: "Demo", instructions: "Do it." })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.SKILLS_DIR;
  });

  it("GET /api/inventory → 200 with the catalog row not-installed", async () => {
    const res = await request(app.getHttpServer()).get("/api/inventory");
    expect(res.status).toBe(200);
    expect(res.body.catalog).toEqual([
      { skillId: "inv-demo", name: "inv-demo", desc: "Demo", status: "not-installed" },
    ]);
    expect(res.body.mcp).toEqual([]);
  });

  it("install → 200, writes the file, then status is installed", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/inventory/skills/inv-demo/install")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ skillId: "inv-demo", status: "installed" });
    const written = await fs.readFile(
      path.join(claudeDir, "skills", "inv-demo", "SKILL.md"),
      "utf8",
    );
    expect(written).toContain("managed-by: zibby");
    const inv = await request(app.getHttpServer()).get("/api/inventory");
    expect(inv.body.catalog[0].status).toBe("installed");
    expect(inv.body.skills.map((s: { id: string }) => s.id)).toContain("inv-demo");
  });

  it("install of an unknown skill → 404", async () => {
    await request(app.getHttpServer())
      .post("/api/inventory/skills/ghost/install")
      .send({})
      .expect(404);
  });

  it("install over a non-managed skill → 409", async () => {
    await request(app.getHttpServer())
      .post("/api/skills")
      .send({ id: "mine", instructions: "x" })
      .expect(201);
    const dest = path.join(claudeDir, "skills", "mine");
    await fs.mkdir(dest, { recursive: true });
    await fs.writeFile(path.join(dest, "SKILL.md"), "hand written", "utf8");
    await request(app.getHttpServer())
      .post("/api/inventory/skills/mine/install")
      .send({})
      .expect(409);
    expect(await fs.readFile(path.join(dest, "SKILL.md"), "utf8")).toBe("hand written");
  });
});
