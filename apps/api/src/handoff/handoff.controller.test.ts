import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Chain, HandoffRule, HandoffSignalKind } from "@zibby/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChainInUseError, ChainNotFoundError, InvalidChainInputError } from "./chain.errors";
import { ChainsService } from "./chains.service";
import { SignalKindNotFoundError, SystemSignalKindError } from "./handoff-signal-kind.errors";
import { HandoffRuleNotFoundError, SystemHandoffRuleError } from "./handoff-rule.errors";
import { HandoffRuleStore } from "./handoff-rule.store";
import { HandoffSignalKindStore } from "./handoff-signal-kind.store";
import { HandoffController } from "./handoff.controller";
import { SignalKindService } from "./signal-kind.service";

const SYSTEM_RULE: HandoffRule = {
  id: "security-cve-critical",
  from: "sec",
  signalKind: "cve",
  minSeverity: "critical",
  to: { kind: "department", id: "dev" },
  tier: 2,
  enabled: true,
  system: true,
};

const USER_INPUT = {
  from: "inc" as const,
  signalKind: "ask-dev",
  to: { kind: "department" as const, id: "dev" as const },
  tier: 3 as const,
  enabled: true,
};

const SIGNAL_KIND_INPUT = {
  from: "inc" as const,
  label: "Ask Dev",
  description: "Something Incident wants Dev to know about.",
  severityBearing: false,
};

/**
 * HTTP round-trip for `handoffContract`'s CRUD routes (P1 rules + B1 signal
 * kinds). Mirrors `memory.controller.test.ts` — a minimal testing module with
 * `HandoffController` and stubbed `HandoffRuleStore`/`SignalKindService`, so
 * each store/service's own behavior (create/update/delete semantics) stays
 * covered by their own unit suites and this suite only asserts the
 * controller's HTTP status mapping (201/200/404/403).
 */
describe("handoffContract CRUD routes", () => {
  let app: INestApplication;
  const create = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const skList = vi.fn();
  const skCreate = vi.fn();
  const skUpdate = vi.fn();
  const skDelete = vi.fn();
  const list = vi.fn(async (): Promise<HandoffRule[]> => []);
  const signalKindStoreList = vi.fn(
    async (): Promise<Pick<HandoffSignalKind, "id" | "chain">[]> => [],
  );
  const chainsList = vi.fn();
  const chainsGet = vi.fn();
  const chainsPut = vi.fn();
  const chainsDelete = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HandoffController],
      providers: [
        {
          provide: HandoffRuleStore,
          useValue: { list, create, update, delete: del },
        },
        {
          provide: SignalKindService,
          useValue: { list: skList, create: skCreate, update: skUpdate, delete: skDelete },
        },
        {
          provide: HandoffSignalKindStore,
          useValue: { list: signalKindStoreList },
        },
        {
          provide: ChainsService,
          useValue: {
            list: chainsList,
            get: chainsGet,
            put: chainsPut,
            delete: chainsDelete,
          },
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
    skList.mockReset();
    skCreate.mockReset();
    skUpdate.mockReset();
    skDelete.mockReset();
    create.mockReset();
    update.mockReset();
    del.mockReset();
    list.mockReset().mockResolvedValue([]);
    signalKindStoreList.mockReset().mockResolvedValue([]);
    chainsList.mockReset();
    chainsGet.mockReset();
    chainsPut.mockReset();
    chainsDelete.mockReset();
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

  it("GET /api/handoff-signal-kinds returns 200 with the list", async () => {
    skList.mockResolvedValue([]);
    const res = await request(app.getHttpServer()).get("/api/handoff-signal-kinds");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST /api/handoff-signal-kinds returns 201 with {signalKind, buildTaskId}", async () => {
    const signalKind = { ...SIGNAL_KIND_INPUT, id: "ask-dev", status: "pending", system: false };
    skCreate.mockResolvedValue({ signalKind, buildTaskId: "task-1" });
    const res = await request(app.getHttpServer())
      .post("/api/handoff-signal-kinds")
      .send(SIGNAL_KIND_INPUT);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ signalKind, buildTaskId: "task-1" });
    expect(skCreate).toHaveBeenCalledWith(SIGNAL_KIND_INPUT);
  });

  it("PATCH /api/handoff-signal-kinds/:id returns 200 with the updated kind", async () => {
    const updated = { ...SIGNAL_KIND_INPUT, id: "ask-dev", status: "pending", system: false };
    skUpdate.mockResolvedValue(updated);
    const res = await request(app.getHttpServer())
      .patch("/api/handoff-signal-kinds/ask-dev")
      .send(SIGNAL_KIND_INPUT);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });

  it("PATCH /api/handoff-signal-kinds/:id returns 404 for an unknown id", async () => {
    skUpdate.mockRejectedValue(new SignalKindNotFoundError("does-not-exist"));
    const res = await request(app.getHttpServer())
      .patch("/api/handoff-signal-kinds/does-not-exist")
      .send(SIGNAL_KIND_INPUT);
    expect(res.status).toBe(404);
  });

  it("PATCH /api/handoff-signal-kinds/:id returns 403 for a built-in kind", async () => {
    skUpdate.mockRejectedValue(new SystemSignalKindError("cve"));
    const res = await request(app.getHttpServer())
      .patch("/api/handoff-signal-kinds/cve")
      .send(SIGNAL_KIND_INPUT);
    expect(res.status).toBe(403);
  });

  it("DELETE /api/handoff-signal-kinds/:id returns 200 {id} for an operator kind", async () => {
    skDelete.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer()).delete("/api/handoff-signal-kinds/ask-dev");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "ask-dev" });
  });

  it("DELETE /api/handoff-signal-kinds/:id returns 404 for an unknown id", async () => {
    skDelete.mockRejectedValue(new SignalKindNotFoundError("does-not-exist"));
    const res = await request(app.getHttpServer()).delete(
      "/api/handoff-signal-kinds/does-not-exist",
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/handoff-signal-kinds/:id returns 403 for a built-in kind", async () => {
    skDelete.mockRejectedValue(new SystemSignalKindError("cve"));
    const res = await request(app.getHttpServer()).delete("/api/handoff-signal-kinds/cve");
    expect(res.status).toBe(403);
  });

  it("GET /api/handoff-rules filters out chain-kind rules by default", async () => {
    const chainRule = { ...USER_INPUT, id: "c1:0", signalKind: "c1" };
    const plainRule = { ...USER_INPUT, id: "hrule-1", signalKind: "ask-dev" };
    list.mockResolvedValue([chainRule, plainRule]);
    signalKindStoreList.mockResolvedValue([{ id: "c1", chain: true }]);
    const res = await request(app.getHttpServer()).get("/api/handoff-rules");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([plainRule]);
  });

  it("GET /api/handoff-rules?includeChains=true returns every rule, chain-kind included", async () => {
    const chainRule = { ...USER_INPUT, id: "c1:0", signalKind: "c1" };
    list.mockResolvedValue([chainRule]);
    const res = await request(app.getHttpServer()).get("/api/handoff-rules?includeChains=true");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([chainRule]);
    expect(signalKindStoreList).not.toHaveBeenCalled();
  });

  const CHAIN: Chain = {
    id: "c1",
    label: "Test chain",
    description: "A test chain.",
    entry: "rnd",
    steps: [{ department: "dev", gate: "auto", ruleId: "c1:0" }],
    enabled: true,
  };

  it("GET /api/handoff/chains returns 200 with the list", async () => {
    chainsList.mockResolvedValue([CHAIN]);
    const res = await request(app.getHttpServer()).get("/api/handoff/chains");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([CHAIN]);
  });

  it("GET /api/handoff/chains/:id returns 200 with the chain", async () => {
    chainsGet.mockResolvedValue(CHAIN);
    const res = await request(app.getHttpServer()).get("/api/handoff/chains/c1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(CHAIN);
  });

  it("GET /api/handoff/chains/:id returns 404 for an unknown id", async () => {
    chainsGet.mockRejectedValue(new ChainNotFoundError("does-not-exist"));
    const res = await request(app.getHttpServer()).get("/api/handoff/chains/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("PUT /api/handoff/chains/:id returns 200 with the upserted chain", async () => {
    chainsPut.mockResolvedValue(CHAIN);
    const res = await request(app.getHttpServer())
      .put("/api/handoff/chains/c1")
      .send({
        label: "Test chain",
        description: "A test chain.",
        entry: "rnd",
        steps: [{ department: "dev", gate: "auto" }],
        enabled: true,
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(CHAIN);
  });

  it("PUT /api/handoff/chains/:id returns 400 for an invalid chain input", async () => {
    chainsPut.mockRejectedValue(
      new InvalidChainInputError('Chain has a cycle at department "rnd".'),
    );
    const res = await request(app.getHttpServer())
      .put("/api/handoff/chains/c1")
      .send({
        label: "Test chain",
        description: "A test chain.",
        entry: "rnd",
        steps: [{ department: "rnd", gate: "auto" }],
        enabled: true,
      });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/handoff/chains/:id returns 200 {id}", async () => {
    chainsDelete.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer()).delete("/api/handoff/chains/c1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "c1" });
  });

  it("DELETE /api/handoff/chains/:id returns 404 for an unknown id", async () => {
    chainsDelete.mockRejectedValue(new ChainNotFoundError("does-not-exist"));
    const res = await request(app.getHttpServer()).delete("/api/handoff/chains/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("DELETE /api/handoff/chains/:id returns 409 while a parent task still references it", async () => {
    chainsDelete.mockRejectedValue(new ChainInUseError("c1"));
    const res = await request(app.getHttpServer()).delete("/api/handoff/chains/c1");
    expect(res.status).toBe(409);
  });
});
