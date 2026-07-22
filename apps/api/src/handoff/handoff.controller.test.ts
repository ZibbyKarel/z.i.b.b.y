import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { HandoffRule } from "@zibby/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HandoffRuleNotFoundError, SystemHandoffRuleError } from "./handoff-rule.errors";
import { HandoffRuleStore } from "./handoff-rule.store";
import { HandoffController } from "./handoff.controller";

const SYSTEM_RULE: HandoffRule = {
  id: "sentinel-cve-critical",
  from: "sentinel",
  signalKind: "cve",
  minSeverity: "critical",
  to: { kind: "subsystem", id: "forge" },
  tier: 2,
  enabled: true,
  system: true,
};

const USER_INPUT = {
  from: "beacon" as const,
  signalKind: "ask-forge",
  to: { kind: "subsystem" as const, id: "forge" as const },
  tier: 3 as const,
  enabled: true,
};

/**
 * HTTP round-trip for `handoffContract`'s CRUD routes (P1). Mirrors
 * `memory.controller.test.ts` — a minimal testing module with `HandoffController`
 * and a stubbed `HandoffRuleStore`, so the store's own behavior (create/update/
 * delete semantics) stays covered by `handoff-rule.store.test.ts` and this suite
 * only asserts the controller's HTTP status mapping (201/200/404/403).
 */
describe("handoffContract CRUD routes", () => {
  let app: INestApplication;
  const create = vi.fn();
  const update = vi.fn();
  const del = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HandoffController],
      providers: [
        {
          provide: HandoffRuleStore,
          useValue: { list: vi.fn(), create, update, delete: del },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    create.mockReset();
    update.mockReset();
    del.mockReset();
  });

  it("POST /api/handoff-rules returns 201 with the created rule", async () => {
    create.mockResolvedValue({ ...USER_INPUT, id: "hrule-1", system: false });
    const res = await request(app.getHttpServer()).post("/api/handoff-rules").send(USER_INPUT);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ...USER_INPUT, id: "hrule-1", system: false });
    expect(create).toHaveBeenCalledWith(USER_INPUT);
  });

  it("PUT /api/handoff-rules/:id returns 200 with the updated rule", async () => {
    update.mockResolvedValue({ ...SYSTEM_RULE, tier: 1, enabled: false });
    const res = await request(app.getHttpServer())
      .put(`/api/handoff-rules/${SYSTEM_RULE.id}`)
      .send({ ...USER_INPUT, tier: 1, enabled: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...SYSTEM_RULE, tier: 1, enabled: false });
  });

  it("PUT /api/handoff-rules/:id returns 404 for an unknown id", async () => {
    update.mockRejectedValue(new HandoffRuleNotFoundError("does-not-exist"));
    const res = await request(app.getHttpServer())
      .put("/api/handoff-rules/does-not-exist")
      .send(USER_INPUT);
    expect(res.status).toBe(404);
  });

  it("DELETE /api/handoff-rules/:id returns 200 {id} for a user rule", async () => {
    del.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer()).delete("/api/handoff-rules/hrule-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "hrule-1" });
  });

  it("DELETE /api/handoff-rules/:id returns 404 for an unknown id", async () => {
    del.mockRejectedValue(new HandoffRuleNotFoundError("does-not-exist"));
    const res = await request(app.getHttpServer()).delete("/api/handoff-rules/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/handoff-rules/:id returns 403 for a system rule", async () => {
    del.mockRejectedValue(new SystemHandoffRuleError(SYSTEM_RULE.id));
    const res = await request(app.getHttpServer()).delete(`/api/handoff-rules/${SYSTEM_RULE.id}`);
    expect(res.status).toBe(403);
  });
});
