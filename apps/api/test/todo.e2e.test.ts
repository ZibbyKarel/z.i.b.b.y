import { promises as fs } from "node:fs";
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

async function boot(): Promise<{ app: INestApplication; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "todo-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.AGENT_RUNS_DIR = path.join(dir, "runs");
  process.env.TODO_FILE = path.join(dir, "todo/items.json");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, dir };
}

describe("TODO API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    ({ app, dir } = await boot());
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.AGENTS_DIR;
    delete process.env.AGENT_RUNS_DIR;
    delete process.env.TODO_FILE;
    delete process.env.CLAUDE_BIN;
  });

  it("POST 201, GET oldest first, DELETE 204 then 404", async () => {
    const http = app.getHttpServer();
    expect((await request(http).get("/api/todo")).body).toEqual({ items: [] });

    const a = await request(http).post("/api/todo").send({ text: "  first @Kodér  " });
    expect(a.status).toBe(201);
    expect(a.body.text).toBe("first @Kodér");
    expect(a.body.id).toMatch(/^todo_/);
    const b = await request(http).post("/api/todo").send({ text: "second" });

    const list = await request(http).get("/api/todo");
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([a.body.id, b.body.id]);

    expect((await request(http).delete("/api/todo/" + a.body.id)).status).toBe(204);
    expect((await request(http).delete("/api/todo/" + a.body.id)).status).toBe(404);
  });

  it("a task created with todoId removes that note", async () => {
    const http = app.getHttpServer();
    const note = await request(http).post("/api/todo").send({ text: "ship the thing" });
    expect(note.status).toBe(201);
    const keep = await request(http).post("/api/todo").send({ text: "leave me" });

    const task = await request(http)
      .post("/api/tasks")
      .send({ title: "Ship", text: "ship the thing", todoId: note.body.id });
    expect(task.status).toBe(201);

    const ids = (await request(http).get("/api/todo")).body.items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(note.body.id);
    expect(ids).toContain(keep.body.id);
  });

  it("rejects blank text with 400", async () => {
    const res = await request(app.getHttpServer()).post("/api/todo").send({ text: "   " });
    expect(res.status).toBe(400);
  });

  it("answers 409 past the 200-note cap", async () => {
    const http = app.getHttpServer();
    const have = (await request(http).get("/api/todo")).body.items.length as number;
    for (let i = have; i < 200; i++)
      await request(http)
        .post("/api/todo")
        .send({ text: `n${i}` });
    expect((await request(http).post("/api/todo").send({ text: "too many" })).status).toBe(409);
  });
});
