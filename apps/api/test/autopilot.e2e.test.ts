import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { GateEvaluatorService } from "../src/gates/gate-evaluator.service";
import { withOperator } from "./operator-token";

describe("Autopilot API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "autopilot-e2e-"));
    process.env.AUTOPILOT_DIR = dir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.AUTOPILOT_DIR;
  });

  const server = () => app.getHttpServer();
  const evalComment = async () => {
    const gates = app.get(GateEvaluatorService);
    return gates.evaluate(await gates.rulesForAgent({}), { action: "gh.pr_comment" });
  };

  it("defaults to off with the pending count", async () => {
    const res = await request(server()).get("/api/autopilot").expect(200);
    expect(res.body).toMatchObject({ level: "off" });
    expect(typeof res.body.pendingApprovals).toBe("number");
  });

  it("turning ON without the operator token is 401 and changes nothing", async () => {
    await request(server()).put("/api/autopilot").send({ level: "full" }).expect(401);
    expect((await request(server()).get("/api/autopilot")).body.level).toBe("off");
    await expect(fs.readFile(path.join(dir, "autopilot.json"), "utf8")).rejects.toThrow();
  });

  it("rejects unknown keys with 400/422", async () => {
    const res = await withOperator(request(server()).put("/api/autopilot")).send({
      level: "full",
      extra: 1,
    });
    expect([400, 422]).toContain(res.status);
  });

  it("ON with the token lifts a covered gate; OFF needs no token and restores it", async () => {
    expect((await evalComment()).decision).toBe("ask");

    const on = await withOperator(request(server()).put("/api/autopilot"))
      .send({ level: "full" })
      .expect(200);
    expect(on.body).toMatchObject({ level: "full", by: "operator" });
    expect(await evalComment()).toMatchObject({ decision: "notify", via: "autopilot" });
    expect(JSON.parse(await fs.readFile(path.join(dir, "autopilot.json"), "utf8"))).toMatchObject({
      level: "full",
    });

    const off = await request(server()).put("/api/autopilot").send({ level: "off" }).expect(200);
    expect(off.body.level).toBe("off");
    expect((await evalComment()).decision).toBe("ask");
  });
});
