import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("Roadmap API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let projectsDir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-e2e-projects-"));
    process.env.ROADMAP_DIR = dir;
    process.env.PROJECTS_DIR = projectsDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(projectsDir, { recursive: true, force: true });
    delete process.env.ROADMAP_DIR;
    delete process.env.PROJECTS_DIR;
  });

  it("starts empty, then create -> get -> list -> patch -> delete", async () => {
    const empty = await request(app.getHttpServer())
      .get("/api/projects/media-vault/roadmap")
      .expect(200);
    expect(empty.body).toEqual([]);

    const created = await request(app.getHttpServer())
      .post("/api/projects/media-vault/roadmap/items")
      .send({ level: "epic", name: "Rollout za flagem", description: "Zapnout novou detekci" })
      .expect(201);
    expect(created.body).toMatchObject({
      projectId: "media-vault",
      level: "epic",
      name: "Rollout za flagem",
      lifecycle: "todo",
      source: { kind: "manual" },
    });
    const itemId = created.body.id as string;

    const got = await request(app.getHttpServer())
      .get(`/api/projects/media-vault/roadmap/items/${itemId}`)
      .expect(200);
    expect(got.body.id).toBe(itemId);

    const list = await request(app.getHttpServer())
      .get("/api/projects/media-vault/roadmap")
      .expect(200);
    expect(list.body.map((i: { id: string }) => i.id)).toEqual([itemId]);

    const patched = await request(app.getHttpServer())
      .patch(`/api/projects/media-vault/roadmap/items/${itemId}`)
      .send({ name: "Rollout za flagem v2" })
      .expect(200);
    expect(patched.body.name).toBe("Rollout za flagem v2");
    // Untouched fields survive the partial patch.
    expect(patched.body.description).toBe("Zapnout novou detekci");

    const deleted = await request(app.getHttpServer())
      .delete(`/api/projects/media-vault/roadmap/items/${itemId}`)
      .expect(200);
    expect(deleted.body).toEqual({ id: itemId });

    await request(app.getHttpServer())
      .get(`/api/projects/media-vault/roadmap/items/${itemId}`)
      .expect(404);
  });

  it("404s a get/patch/delete on an unknown item", async () => {
    await request(app.getHttpServer())
      .get("/api/projects/media-vault/roadmap/items/nonexistent")
      .expect(404);
    await request(app.getHttpServer())
      .patch("/api/projects/media-vault/roadmap/items/nonexistent")
      .send({ name: "x" })
      .expect(404);
    await request(app.getHttpServer())
      .delete("/api/projects/media-vault/roadmap/items/nonexistent")
      .expect(404);
  });

  it("422s a create whose parentId doesn't reference an existing epic", async () => {
    await request(app.getHttpServer())
      .post("/api/projects/media-vault/roadmap/items")
      .send({ level: "task", name: "Orphan task", parentId: "nonexistent-epic" })
      .expect(422);

    const task = await request(app.getHttpServer())
      .post("/api/projects/media-vault/roadmap/items")
      .send({ level: "task", name: "Some task" })
      .expect(201);

    // A task cannot be used as a parent — only an epic can.
    await request(app.getHttpServer())
      .post("/api/projects/media-vault/roadmap/items")
      .send({ level: "task", name: "Nested under a task", parentId: task.body.id })
      .expect(422);
  });

  it("round-trips the per-project roadmap config (both automation toggles)", async () => {
    const initial = await request(app.getHttpServer())
      .get("/api/projects/other-project/roadmap/config")
      .expect(200);
    expect(initial.body).toMatchObject({
      autoPlay: null,
      autoReview: null,
      autoAddressComments: null,
    });
    expect(initial.body.effective).toEqual({
      autoPlay: false,
      autoReview: false,
      autoAddressComments: false,
      source: {
        autoPlay: "global",
        autoReview: "global",
        autoAddressComments: "global",
      },
    });

    const updated = await request(app.getHttpServer())
      .put("/api/projects/other-project/roadmap/config")
      .send({ autoPlay: true })
      .expect(200);
    expect(updated.body).toMatchObject({ autoPlay: true, autoReview: null });
    expect(updated.body.effective.autoPlay).toBe(true);

    const reread = await request(app.getHttpServer())
      .get("/api/projects/other-project/roadmap/config")
      .expect(200);
    expect(reread.body).toMatchObject({ autoPlay: true, autoReview: null });
  });

  it("PUT config MERGES — patching one toggle never resets the other", async () => {
    await request(app.getHttpServer())
      .put("/api/projects/merge-project/roadmap/config")
      .send({ autoPlay: true })
      .expect(200);

    // The regression: a replacing PUT would default `autoPlay` back to false
    // here, silently switching auto-implement off on an auto-review flip.
    const merged = await request(app.getHttpServer())
      .put("/api/projects/merge-project/roadmap/config")
      .send({ autoReview: true })
      .expect(200);
    expect(merged.body).toMatchObject({ autoReview: true, autoPlay: true });
  });

  it("PUT config { autoReview: true } changes only that key; GET returns effective values", async () => {
    await request(app.getHttpServer())
      .put("/api/projects/review-project/roadmap/config")
      .send({ autoPlay: true })
      .expect(200);
    const updated = await request(app.getHttpServer())
      .put("/api/projects/review-project/roadmap/config")
      .send({ autoReview: true })
      .expect(200);
    expect(updated.body).toMatchObject({
      autoPlay: true,
      autoReview: true,
      autoAddressComments: null,
    });
    const reread = await request(app.getHttpServer())
      .get("/api/projects/review-project/roadmap/config")
      .expect(200);
    expect(reread.body.effective).toMatchObject({
      autoPlay: true,
      autoReview: true,
      autoAddressComments: false,
      source: { autoReview: "project", autoAddressComments: "global" },
    });
  });
});
