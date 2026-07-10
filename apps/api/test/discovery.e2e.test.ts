import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Proposal } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProposalsStorageService } from "../src/discovery/proposals.storage.service";

/**
 * Discovery proposals API (e2e). The triage scan that used to produce candidates
 * is gone (Phase 116a — the operator now targets a pipeline like `code-audit`
 * directly instead); what remains is the read-only proposals inbox, so this suite
 * seeds a proposal straight through the storage service and asserts the listing
 * endpoint reads it back, newest first.
 */
describe("Discovery proposals API (e2e)", () => {
  let app: INestApplication;
  let proposals: ProposalsStorageService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    proposals = app.get(ProposalsStorageService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists seeded proposals newest first", async () => {
    const older: Proposal = {
      id: proposals.newId(),
      candidate: {
        title: "Fix failing checks in failing-proj",
        text: "The declared checks are failing.",
        rationale: "checks exited non-zero",
        confidence: 0.8,
      },
      state: "proposed",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    const newer: Proposal = {
      id: proposals.newId(),
      candidate: {
        title: "Open item from MEMORY.md",
        text: "Open item text.",
        rationale: "Open item in MEMORY.md",
        confidence: 0.5,
      },
      state: "dispatched",
      createdAt: "2026-06-02T00:00:00.000Z",
    };
    await proposals.create(older);
    await proposals.create(newer);

    const res = await request(app.getHttpServer()).get("/api/discovery/proposals").expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(newer.id);
    expect(res.body[0].state).toBe("dispatched");
    expect(res.body[1].id).toBe(older.id);
    expect(res.body[1].candidate.title).toContain("failing-proj");
  });
});
