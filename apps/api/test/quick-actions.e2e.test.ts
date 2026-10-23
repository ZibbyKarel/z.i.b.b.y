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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "quick-actions-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.AGENT_RUNS_DIR = path.join(dir, "runs");
  process.env.QUICK_ACTIONS_FILE = path.join(dir, "quick-actions.json");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, dir };
}

describe("Quick actions API (e2e)", () => {
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
    delete process.env.QUICK_ACTIONS_FILE;
    delete process.env.CLAUDE_BIN;
  });

  it("starts empty, persists a PUT, and reads it back on GET", async () => {
    const empty = await request(app.getHttpServer()).get("/api/quick-actions");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const actions = [
      { id: "a", label: "Deploy", text: "Run deploy" },
      {
        id: "b",
        label: "Review",
        text: "Review PRs",
        target: { kind: "agent", id: "coder", name: "Kodér" },
      },
    ];
    const put = await request(app.getHttpServer()).put("/api/quick-actions").send(actions);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(actions);

    const get = await request(app.getHttpServer()).get("/api/quick-actions");
    expect(get.body).toEqual(actions);
  });

  it("rejects an empty label", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/quick-actions")
      .send([{ id: "a", label: "", text: "x" }]);
    expect(res.status).toBe(400);
  });
});
