import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { RoadmapItem } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { withOperator } from "./operator-token";

const NOW = "2026-10-01T10:00:00.000Z";

function item(id: string, patch: Partial<RoadmapItem>): RoadmapItem {
  return {
    id,
    projectId: "acme",
    level: "task",
    name: id,
    description: "",
    source: {
      kind: "jira",
      integrationId: "acme-jira",
      externalId: id.toUpperCase(),
      externalKey: id.toUpperCase(),
      url: `https://acme.atlassian.net/browse/${id.toUpperCase()}`,
    },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: NOW,
    updatedAt: NOW,
    syncedAt: NOW,
    ...patch,
  };
}

describe("Inbox API (e2e)", () => {
  let app: INestApplication;
  let roadmapDir: string;
  let projectsDir: string;
  let stateDir: string;

  beforeAll(async () => {
    roadmapDir = await fs.mkdtemp(path.join(os.tmpdir(), "inbox-e2e-roadmap-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "inbox-e2e-projects-"));
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "inbox-e2e-state-"));
    process.env.ROADMAP_DIR = roadmapDir;
    process.env.PROJECTS_DIR = projectsDir;
    process.env.INBOX_STATE_FILE = path.join(stateDir, "inbox-state.json");

    const items = [
      item("epic-1", { level: "epic", name: "Rollout" }),
      item("task-mine", { parentId: "epic-1", scopeReasons: ["assigned"] }),
      item("task-other", { parentId: "epic-1", lifecycle: "done", scopeReasons: [] }),
      item("task-archived", {
        parentId: "epic-1",
        lifecycle: "archived",
        scopeReasons: ["assigned"],
      }),
    ];
    await fs.mkdir(path.join(roadmapDir, "acme"), { recursive: true });
    for (const i of items) {
      await fs.writeFile(path.join(roadmapDir, "acme", `${i.id}.json`), JSON.stringify(i));
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "acme", name: "Acme" })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const dir of [roadmapDir, projectsDir, stateDir]) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    delete process.env.ROADMAP_DIR;
    delete process.env.PROJECTS_DIR;
    delete process.env.INBOX_STATE_FILE;
  });

  it("lists live issues only: items synced to disk earlier are not listed, refresh=true is accepted", async () => {
    // No Jira/GitHub integration is configured, so the live list is empty even though
    // roadmap items sit on disk (old sync leftovers are ignored, never shown twice).
    for (const query of ["", "?refresh=true"]) {
      const res = await request(app.getHttpServer()).get(`/api/roadmap/items${query}`).expect(200);
      expect(res.body).toMatchObject({ items: [], epics: [], syncProjectIds: [], errors: [] });
      expect(typeof res.body.syncedAt).toBe("string");
    }
    await request(app.getHttpServer()).get("/api/roadmap/items?refresh=maybe").expect(400);
  });

  it("hides an item via PUT /api/inbox/state and reports it as hidden", async () => {
    const key = { integrationId: "acme-jira", externalId: "TASK-MINE" };
    const put = await withOperator(request(app.getHttpServer()).put("/api/inbox/state"))
      .send({ ...key, hidden: true })
      .expect(200);
    expect(put.body).toEqual({ hidden: [key] });
    expect((await request(app.getHttpServer()).get("/api/inbox/state").expect(200)).body).toEqual({
      hidden: [key],
    });
    await withOperator(request(app.getHttpServer()).put("/api/inbox/state"))
      .send({ ...key, hidden: false, extra: 1 })
      .expect(400); // strict body
  });

  it("POST /api/inbox/items/process is 404 for an item that is not in the live list", async () => {
    await withOperator(request(app.getHttpServer()).post("/api/inbox/items/process"))
      .send({ projectId: "acme", itemId: "task-mine" })
      .expect(404);
  });

  it("GET /api/inbox/prs/:projectId/:number/diff is 404 for an unknown project", async () => {
    await request(app.getHttpServer()).get("/api/inbox/prs/nope/7/diff").expect(404);
  });

  it("GET /api/inbox/prs/:projectId/:number/diff is 422 for a project without a GitHub link", async () => {
    await request(app.getHttpServer()).get("/api/inbox/prs/acme/7/diff").expect(422);
  });
});
