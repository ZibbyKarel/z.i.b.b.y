import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const BASE = "/api/teams";
const PROJECTS_BASE = "/api/projects";

describe("Teams API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let projectsDir: string;

  const team = { id: "devrel", name: "DevRel", desc: "A test team" };

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-projects-"));
    process.env.TEAMS_DIR = dir;
    process.env.PROJECTS_DIR = projectsDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(projectsDir, { recursive: true, force: true });
    delete process.env.TEAMS_DIR;
    delete process.env.PROJECTS_DIR;
  });

  it("starts empty", async () => {
    expect((await request(app.getHttpServer()).get(BASE)).body).toEqual([]);
  });

  it("creates, reads, updates and deletes a team", async () => {
    const created = await request(app.getHttpServer()).post(BASE).send(team);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject(team);

    await request(app.getHttpServer()).get(`${BASE}/devrel`).expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/devrel`)
      .send({ desc: "renamed" });
    expect(updated.body.desc).toBe("renamed");

    await request(app.getHttpServer()).delete(`${BASE}/devrel`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/devrel`).expect(404);
  });

  it("serves a read-only KB graph for a team with a knowledge base, 404 otherwise", async () => {
    const kb = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-kb-"));
    await fs.writeFile(path.join(kb, "a.md"), "---\ntitle: A\n---\nsee [[b]]\n");
    await fs.writeFile(path.join(kb, "b.md"), "B body\n");
    const http = app.getHttpServer();
    await request(http)
      .post(BASE)
      .send({
        id: "kbteam",
        name: "KB",
        desc: "d",
        knowledgeBase: { kind: "vault", path: kb, readOnly: true },
      })
      .expect(201);
    await request(http).post(BASE).send({ id: "nokb", name: "No", desc: "d" }).expect(201);

    const ok = await request(http).get(`${BASE}/kbteam/kb/graph`).expect(200);
    expect(ok.body.nodes.map((n: { id: string }) => n.id).sort()).toEqual(["a.md", "b.md"]);
    expect(ok.body.edges).toEqual([{ from: "a.md", to: "b.md" }]);
    await request(http).get(`${BASE}/nokb/kb/graph`).expect(404);
    await request(http).get(`${BASE}/ghost/kb/graph`).expect(404);
    await request(http).post(`${BASE}/nokb/kb/sync`).expect(404);
    await request(http).post(`${BASE}/ghost/kb/sync`).expect(404);
    // KB dir exists but is not a git repo → 409.
    await request(http).post(`${BASE}/kbteam/kb/sync`).expect(409);

    await request(http).delete(`${BASE}/kbteam`).expect(200);
    await request(http).delete(`${BASE}/nokb`).expect(200);
    await fs.rm(kb, { recursive: true, force: true });
  });

  it("browses a team KB read-only: list, open note, 404s, no escape", async () => {
    const kb = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-kb-browse-"));
    const outside = path.join(path.dirname(kb), `outside-${path.basename(kb)}.md`);
    await fs.writeFile(outside, "secret");
    await fs.mkdir(path.join(kb, "wiki"), { recursive: true });
    await fs.mkdir(path.join(kb, "_templates"), { recursive: true });
    await fs.writeFile(path.join(kb, "wiki", "a.md"), "---\ntitle: Alpha\n---\nsee [[b]]\n");
    await fs.writeFile(path.join(kb, "wiki", "b.md"), "B body\n");
    await fs.writeFile(path.join(kb, "_templates", "t.md"), "tpl");
    await fs.writeFile(path.join(kb, "talk.vtt"), "WEBVTT");
    const http = app.getHttpServer();
    await request(http)
      .post(BASE)
      .send({
        id: "browse",
        name: "B",
        desc: "d",
        knowledgeBase: { kind: "vault", path: kb, readOnly: true },
      })
      .expect(201);
    await request(http).post(BASE).send({ id: "plain", name: "P", desc: "d" }).expect(201);

    const list = await request(http).get(`${BASE}/browse/kb/notes`).expect(200);
    expect(list.body).toEqual([
      { id: "wiki/a.md", title: "Alpha", folder: "wiki" },
      { id: "wiki/b.md", title: "b", folder: "wiki" },
    ]);

    const note = await request(http).get(`${BASE}/browse/kb/note`).query({ path: "wiki/a.md" });
    expect(note.status).toBe(200);
    expect(note.body).toEqual({ id: "wiki/a.md", title: "Alpha", body: "see [[b]]", links: ["b"] });

    for (const bad of [
      "wiki/missing.md",
      "../" + path.basename(outside),
      outside,
      "_templates/t.md",
      "talk.vtt",
    ]) {
      await request(http).get(`${BASE}/browse/kb/note`).query({ path: bad }).expect(404);
    }
    for (const url of ["notes", "ingest"]) {
      await request(http).get(`${BASE}/plain/kb/${url}`).expect(404);
      await request(http).get(`${BASE}/ghost/kb/${url}`).expect(404);
    }
    await request(http).get(`${BASE}/plain/kb/note`).query({ path: "x.md" }).expect(404);
    await request(http).get(`${BASE}/browse/kb/note`).expect(400);

    await request(http).delete(`${BASE}/browse`).expect(200);
    await request(http).delete(`${BASE}/plain`).expect(200);
    await fs.rm(kb, { recursive: true, force: true });
    await fs.rm(outside, { force: true });
  });

  it("reports ingest status: log tail, and the project registered at the KB path (or null)", async () => {
    const kb = await fs.mkdtemp(path.join(os.tmpdir(), "teams-e2e-kb-ingest-"));
    await fs.mkdir(path.join(kb, "_meta"), { recursive: true });
    const entries = Array.from({ length: 25 }, (_, i) => `- entry ${i + 1}`);
    await fs.writeFile(path.join(kb, "_meta", "log.md"), `# Log\n\n${entries.join("\n")}\n`);
    const http = app.getHttpServer();
    await request(http)
      .post(BASE)
      .send({
        id: "ingest",
        name: "I",
        desc: "d",
        knowledgeBase: { kind: "vault", path: kb, readOnly: true },
      })
      .expect(201);

    const without = await request(http).get(`${BASE}/ingest/kb/ingest`).expect(200);
    expect(without.body.projectId).toBeNull();
    expect(without.body.log).toHaveLength(20);
    expect(without.body.log[19]).toEqual({ line: "- entry 25" });

    // A project registered via a symlinked spelling of the same directory still matches.
    const link = `${kb}-link`;
    await fs.symlink(kb, link);
    await request(http)
      .post(PROJECTS_BASE)
      .send({ id: "ingest-kb", name: "ingest-kb", path: link, teamId: "ingest" })
      .expect(201);
    const withProject = await request(http).get(`${BASE}/ingest/kb/ingest`).expect(200);
    expect(withProject.body.projectId).toBe("ingest-kb");

    await request(http).delete(`${PROJECTS_BASE}/ingest-kb`).expect(200);
    await request(http).delete(`${BASE}/ingest`).expect(200);
    await fs.rm(link, { force: true });
    await fs.rm(kb, { recursive: true, force: true });
  });

  it("rejects a duplicate id (409) and an invalid body (400)", async () => {
    await request(app.getHttpServer()).post(BASE).send(team).expect(201);
    await request(app.getHttpServer()).post(BASE).send(team).expect(409);
    // Missing required `name` → contract 400.
    await request(app.getHttpServer()).post(BASE).send({ id: "x" }).expect(400);
    await request(app.getHttpServer()).delete(`${BASE}/devrel`).expect(200);
  });

  it("404s on getting a missing team", async () => {
    await request(app.getHttpServer()).get(`${BASE}/nope`).expect(404);
  });

  it("searches teams by id/name/desc without colliding with /:id", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "growth", name: "Growth", desc: "Acquisition & retention" })
      .expect(201);

    const hits = await request(app.getHttpServer()).get(`${BASE}/search?q=growth`).expect(200);
    expect(hits.body.map((t: { id: string }) => t.id)).toEqual(["growth"]);

    // "/search" resolves to the search route, never to GET /teams/:id (→ 404).
    const empty = await request(app.getHttpServer()).get(`${BASE}/search?q=zzz`).expect(200);
    expect(empty.body).toEqual([]);

    await request(app.getHttpServer()).delete(`${BASE}/growth`).expect(200);
  });

  it("deletes a team a project links to, leaving the project with a dangling teamId (no cascade)", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "platform", name: "Platform" })
      .expect(201);

    await request(app.getHttpServer())
      .post(PROJECTS_BASE)
      .send({ id: "widget-app", name: "widget-app", path: "~/p/widget-app", teamId: "platform" })
      .expect(201);

    await request(app.getHttpServer()).delete(`${BASE}/platform`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/platform`).expect(404);

    // The project keeps its now-dangling teamId; a project with no team must
    // behave exactly as today (mirrors the companyId no-cascade decision).
    const got = await request(app.getHttpServer()).get(`${PROJECTS_BASE}/widget-app`).expect(200);
    expect(got.body.teamId).toBe("platform");

    await request(app.getHttpServer()).delete(`${PROJECTS_BASE}/widget-app`).expect(200);
  });
});
