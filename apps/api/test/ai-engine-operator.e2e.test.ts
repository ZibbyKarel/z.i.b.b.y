import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/** Switching the AI engine / model is operator-only; the rest of the config stays open. */
describe("AI engine switch needs the operator token (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it("PUT /api/system/config: an engine change 401s without the token; an unchanged one saves", async () => {
    const cur = (await request(server()).get("/api/system/config").expect(200)).body as Record<
      string,
      unknown
    >;
    const other = cur.aiEngine === "opencode" ? "claude" : "opencode";
    const res = await request(server())
      .put("/api/system/config")
      .send({ ...cur, aiEngine: other });
    expect(res.status).toBe(401);
    await request(server()).put("/api/system/config").send(cur).expect(200);
  });
});
