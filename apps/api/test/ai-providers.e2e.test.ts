import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { withOperator } from "./operator-token";

describe("AI providers API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  const key = "sk-test-abcdefghijklmnopqrstuvwxyz-a1b2";

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-providers-e2e-"));
    process.env.AI_PROVIDERS_DIR = dir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.AI_PROVIDERS_DIR;
  });

  const server = () => app.getHttpServer();

  it("starts unconfigured", async () => {
    const res = await request(server()).get("/api/ai-providers").expect(200);
    expect(res.body).toEqual({ openai: { configured: false } });
  });

  it("PUT needs the operator token", async () => {
    await request(server()).put("/api/ai-providers/openai").send({ apiKey: key }).expect(401);
  });

  it("PUT validates the key (422/400) and stores nothing", async () => {
    for (const apiKey of ["sk-short", "x".repeat(30)]) {
      const res = await withOperator(request(server()).put("/api/ai-providers/openai")).send({
        apiKey,
      });
      expect([400, 422]).toContain(res.status);
    }
    await expect(fs.readFile(path.join(dir, "openai.json"), "utf8")).rejects.toThrow();
  });

  it("PUT stores, GET never contains the key, DELETE clears", async () => {
    const put = await withOperator(request(server()).put("/api/ai-providers/openai"))
      .send({ apiKey: ` ${key} ` })
      .expect(200);
    expect(put.body).toEqual({ openai: { configured: true, keyHint: "…a1b2" } });
    const get = await request(server()).get("/api/ai-providers").expect(200);
    expect(JSON.stringify(get.body)).not.toContain(key);
    expect(JSON.parse(await fs.readFile(path.join(dir, "openai.json"), "utf8"))).toEqual({
      apiKey: key,
    });
    const del = await withOperator(request(server()).delete("/api/ai-providers/openai")).expect(
      200,
    );
    expect(del.body).toEqual({ openai: { configured: false } });
  });
});
