import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { RoadmapItem } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

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

  it("lists only scoped, non-archived tasks with their epic's progress over all children", async () => {
    const res = await request(app.getHttpServer()).get("/api/roadmap/items").expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(["task-mine"]);
    expect(res.body.items[0]).toMatchObject({
      parentId: "epic-1",
      project: { id: "acme", name: "Acme" },
      hidden: false,
    });
    expect(res.body.epics).toEqual([
      {
        id: "epic-1",
        projectId: "acme",
        key: "EPIC-1",
        title: "Rollout",
        source: "jira",
        url: "https://acme.atlassian.net/browse/EPIC-1",
        done: 1,
        total: 2,
      },
    ]);
    expect(res.body.syncProjectIds).toEqual([]); // no Jira/GitHub integration configured
    expect(res.body.errors).toEqual([]);
  });

  it("hides an item via PUT /api/inbox/state and reports it as hidden", async () => {
    const key = { integrationId: "acme-jira", externalId: "TASK-MINE" };
    const put = await request(app.getHttpServer())
      .put("/api/inbox/state")
      .send({ ...key, hidden: true })
      .expect(200);
    expect(put.body).toEqual({ hidden: [key] });
    expect((await request(app.getHttpServer()).get("/api/inbox/state").expect(200)).body).toEqual({
      hidden: [key],
    });
    const res = await request(app.getHttpServer()).get("/api/roadmap/items").expect(200);
    expect(res.body.items[0].hidden).toBe(true);

    await request(app.getHttpServer())
      .put("/api/inbox/state")
      .send({ ...key, hidden: false, extra: 1 })
      .expect(400); // strict body
  });
});
