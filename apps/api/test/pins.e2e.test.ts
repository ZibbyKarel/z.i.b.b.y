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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pins-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.AGENT_RUNS_DIR = path.join(dir, "runs");
  process.env.PINS_FILE = path.join(dir, "pins.json");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, dir };
}

describe("Pins API (e2e)", () => {
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
    delete process.env.PINS_FILE;
    delete process.env.CLAUDE_BIN;
  });

  it("starts empty, persists a PUT, and reads it back on GET", async () => {
    const empty = await request(app.getHttpServer()).get("/api/pins");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);

    const pins = [
      { kind: "agent", id: "researcher" },
      { kind: "pipeline", id: "research-then-build" },
    ];
    const put = await request(app.getHttpServer()).put("/api/pins").send(pins);
    expect(put.status).toBe(200);
    expect(put.body).toEqual(pins);

    const get = await request(app.getHttpServer()).get("/api/pins");
    expect(get.body).toEqual(pins);
    // Durable on disk.
    const onDisk = JSON.parse(await fs.readFile(path.join(dir, "pins.json"), "utf8"));
    expect(onDisk).toEqual(pins);
  });

  it("dedupes a repeated (kind, id) on write", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/pins")
      .send([
        { kind: "pipeline", id: "delivery" },
        { kind: "pipeline", id: "delivery" },
      ]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ kind: "pipeline", id: "delivery" }]);
  });
});
