import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("Gates API (e2e)", () => {
  let app: INestApplication;
  let agentsDir: string;
  let policyDir: string;

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gates-agents-"));
    policyDir = await fs.mkdtemp(path.join(os.tmpdir(), "gates-policy-"));
    process.env.AGENTS_DIR = agentsDir;
    process.env.POLICY_DIR = policyDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "shopper",
        name: "Shopper",
        instructions: "buys things",
        ownerSubsystem: "forge",
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(agentsDir, { recursive: true, force: true });
    await fs.rm(policyDir, { recursive: true, force: true });
    delete process.env.AGENTS_DIR;
    delete process.env.POLICY_DIR;
  });

  it("exposes the seeded system floor", async () => {
    const res = await request(app.getHttpServer()).get("/api/gates/policy").expect(200);
    const actions = res.body.rules.map((r: { match: { action?: string }[] }) => r.match[0]?.action);
    expect(actions).toContain("purchase");
    expect(res.body.rules.every((r: { locked: boolean }) => r.locked)).toBe(true);
  });

  it("evaluates a threshold rule: gt 500 asks (own rule); under, the own rule doesn't fire and the unmatched action falls back to ask (claim 3)", async () => {
    await request(app.getHttpServer())
      .put("/api/agents/shopper/gates")
      .send({
        gates: [
          {
            match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(200);

    const big = await request(app.getHttpServer())
      .post("/api/gates/evaluate")
      .send({
        agentId: "shopper",
        action: { action: "checkout", metrics: { "purchase.amount": 540 } },
      })
      .expect(200);
    expect(big.body.decision).toBe("ask");

    const small = await request(app.getHttpServer())
      .post("/api/gates/evaluate")
      .send({
        agentId: "shopper",
        action: { action: "checkout", metrics: { "purchase.amount": 120 } },
      })
      .expect(200);
    // Under 500 the threshold rule doesn't fire, and "checkout" has no floor rule
    // either — genuinely unmatched now defaults to `ask` (claim 3), not `allow`.
    expect(small.body.decision).toBe("ask");
  });

  it("refuses to let an agent weaken the locked floor (422)", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/agents/shopper/gates")
      .send({ gates: [{ match: [{ type: "action", action: "purchase" }], decision: "allow" }] })
      .expect(422);
    expect(res.body.ruleIndex).toBe(0);

    // The floor still gates a purchase for this agent.
    const evalRes = await request(app.getHttpServer())
      .post("/api/gates/evaluate")
      .send({ agentId: "shopper", action: { action: "purchase" } })
      .expect(200);
    expect(evalRes.body.decision).toBe("ask");
  });

  it("returns inherited floor + own rules for an agent", async () => {
    const res = await request(app.getHttpServer()).get("/api/agents/shopper/gates").expect(200);
    expect(Array.isArray(res.body.inherited)).toBe(true);
    expect(res.body.inherited.length).toBeGreaterThan(0);
  });

  it("exposes the git-publish floor (git.push ask, pr.merge deny, pr.open notify — Tier-2, never blocks)", async () => {
    const res = await request(app.getHttpServer()).get("/api/gates/policy").expect(200);
    const byAction = new Map<string, string>(
      res.body.rules.map((r: { match: { action?: string }[]; decision: string }) => [
        r.match[0]?.action ?? "",
        r.decision,
      ]),
    );
    expect(byAction.get("git.push")).toBe("ask");
    expect(byAction.get("pr.merge")).toBe("deny");
    // pr.open is Tier-2 (act-then-report) — opened autonomously, never blocks. Task
    // 2's required claim-3 grep found it relying on the implicit "nothing matched"
    // fallback, which this task flips from allow to ask — an implicit ask on every
    // autonomous PR-open would have been a severe regression, so it now has
    // explicit (logged) floor coverage at `notify` instead, same pattern as
    // `agent.delegate`/`channel-reply`: on the record, but non-blocking.
    expect(byAction.get("pr.open")).toBe("notify");
  });

  it("exposes the Phase 5.3 channel-reply floor at notify", async () => {
    const res = await request(app.getHttpServer()).get("/api/gates/policy").expect(200);
    const rule = res.body.rules.find(
      (r: { match: { action?: string }[] }) => r.match[0]?.action === "channel-reply",
    );
    expect(rule?.decision).toBe("notify");
  });

  it("honors an agent rule hardening channel-reply to ask", async () => {
    await request(app.getHttpServer())
      .put("/api/agents/shopper/gates")
      .send({
        gates: [
          {
            match: [{ type: "action", action: "channel-reply" }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(200);
    const evalRes = await request(app.getHttpServer())
      .post("/api/gates/evaluate")
      .send({ agentId: "shopper", action: { action: "channel-reply" } })
      .expect(200);
    expect(evalRes.body.decision).toBe("ask");
  });

  it("rejects an agent rule weakening channel-reply to allow (422)", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/agents/shopper/gates")
      .send({
        gates: [{ match: [{ type: "action", action: "channel-reply" }], decision: "allow" }],
      })
      .expect(422);
    expect(res.body.ruleIndex).toBe(0);
  });

  it("refuses an agent rule that weakens the locked pr.merge deny (422)", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/agents/shopper/gates")
      .send({ gates: [{ match: [{ type: "action", action: "pr.merge" }], decision: "allow" }] })
      .expect(422);
    expect(res.body.ruleIndex).toBe(0);

    // The floor still denies a pr.merge for this agent.
    const evalRes = await request(app.getHttpServer())
      .post("/api/gates/evaluate")
      .send({ agentId: "shopper", action: { action: "pr.merge" } })
      .expect(200);
    expect(evalRes.body.decision).toBe("deny");
  });
});
