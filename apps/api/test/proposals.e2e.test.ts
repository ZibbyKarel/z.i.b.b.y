import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProposalsService } from "../src/proposals/proposals.service";

describe("Proposals API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let proposals: ProposalsService;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "proposals-e2e-"));
    process.env.PROPOSALS_DIR = path.join(dir, "proposals");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    proposals = app.get(ProposalsService);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.PROPOSALS_DIR;
  });

  it("a corrupt proposals.json lists as [] with 200", async () => {
    await fs.mkdir(path.join(dir, "proposals"), { recursive: true });
    await fs.writeFile(path.join(dir, "proposals", "proposals.json"), "{ garbage");
    const res = await request(app.getHttpServer()).get("/api/proposals");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("lists, edits, dismisses; 404 unknown; 409 on dismissed / agent-factory edit", async () => {
    const gap = await proposals.upsert({
      source: "gap-detect",
      key: "deploy to staging",
      text: "Automate deploy?",
      occurrences: 7,
      minOccurrences: 3,
      provenance: { noteId: "suggestions/automation-gaps" },
    });
    const agent = await proposals.upsert({
      source: "agent-factory",
      key: "agent-x",
      text: 'New agent "X"',
      occurrences: 3,
      minOccurrences: 3,
      provenance: { agentId: "agent-x" },
    });

    const list = await request(app.getHttpServer()).get("/api/proposals");
    expect(list.status).toBe(200);
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([gap.id, agent.id]);

    const edited = await request(app.getHttpServer())
      .patch(`/api/proposals/${gap.id}`)
      .send({ action: "edit", text: "  Automate the staging deploy  " });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id: gap.id, editedText: "Automate the staging deploy" });

    const agentEdit = await request(app.getHttpServer())
      .patch(`/api/proposals/${agent.id}`)
      .send({ action: "edit", text: "nope" });
    expect(agentEdit.status).toBe(409);

    const dismissed = await request(app.getHttpServer())
      .patch(`/api/proposals/${gap.id}`)
      .send({ action: "dismiss" });
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.status).toBe("dismissed");

    const again = await request(app.getHttpServer())
      .patch(`/api/proposals/${gap.id}`)
      .send({ action: "dismiss" });
    expect(again.status).toBe(409);

    const missing = await request(app.getHttpServer())
      .patch("/api/proposals/prop_000000000000")
      .send({ action: "dismiss" });
    expect(missing.status).toBe(404);

    const after = await request(app.getHttpServer()).get("/api/proposals");
    expect(after.body.map((p: { id: string }) => p.id)).toEqual([agent.id]);

    const activity = await request(app.getHttpServer()).get("/api/activity?kinds=proposal-decided");
    expect(activity.status).toBe(200);
    const summaries = (activity.body as Array<{ summary: string }>).map((e) => e.summary);
    expect(summaries).toEqual(
      expect.arrayContaining(["edited gap-detect proposal", "dismissed gap-detect proposal"]),
    );
  });

  it("rejects an invalid body (empty edit text)", async () => {
    const res = await request(app.getHttpServer())
      .patch("/api/proposals/prop_000000000000")
      .send({ action: "edit", text: "   " });
    expect(res.status).toBe(400);
  });
});
