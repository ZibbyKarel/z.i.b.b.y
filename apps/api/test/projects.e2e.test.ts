import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const BASE = "/api/projects";
const CATS = "/api/projects/categories";

describe("Projects API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let secretsDir: string;
  let companiesDir: string;
  let integrationsDir: string;
  let integrationStateDir: string;
  let credentialsDir: string;

  const project = {
    id: "media-vault",
    name: "media-vault",
    path: "~/Projects/media-vault",
    category: "Média & domácnost",
  };

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-e2e-"));
    secretsDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-secrets-e2e-"));
    // Phase 72's resolved-context route needs its own companies + integrations
    // registries — isolated the same way as `integrations.e2e.test.ts`.
    companiesDir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-e2e-companies-"));
    integrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-e2e-integrations-"));
    integrationStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-e2e-int-state-"));
    credentialsDir = await fs.mkdtemp(path.join(os.tmpdir(), "projects-e2e-credentials-"));
    process.env.PROJECTS_DIR = dir;
    process.env.PROJECT_SECRETS_DIR = secretsDir;
    process.env.COMPANIES_DIR = companiesDir;
    process.env.INTEGRATIONS_DIR = integrationsDir;
    process.env.INTEGRATION_STATE_DIR = integrationStateDir;
    process.env.CREDENTIALS_DIR = credentialsDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(secretsDir, { recursive: true, force: true });
    await fs.rm(companiesDir, { recursive: true, force: true });
    await fs.rm(integrationsDir, { recursive: true, force: true });
    await fs.rm(integrationStateDir, { recursive: true, force: true });
    await fs.rm(credentialsDir, { recursive: true, force: true });
    delete process.env.PROJECTS_DIR;
    delete process.env.PROJECT_SECRETS_DIR;
    delete process.env.COMPANIES_DIR;
    delete process.env.INTEGRATIONS_DIR;
    delete process.env.INTEGRATION_STATE_DIR;
    delete process.env.CREDENTIALS_DIR;
  });

  it("starts empty, and GET /projects/categories is not shadowed by GET /projects/:id", async () => {
    expect((await request(app.getHttpServer()).get(BASE)).body).toEqual([]);
    // 200 (not 404) proves the categories controller is mounted ahead of :id.
    expect((await request(app.getHttpServer()).get(CATS)).status).toBe(200);
  });

  it("creates, reads, updates and deletes a project", async () => {
    const created = await request(app.getHttpServer()).post(BASE).send(project);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: "media-vault", path: "~/Projects/media-vault" });

    await request(app.getHttpServer()).get(`${BASE}/media-vault`).expect(200);

    const updated = await request(app.getHttpServer())
      .patch(`${BASE}/media-vault`)
      .send({ desc: "moved" });
    expect(updated.body.desc).toBe("moved");

    await request(app.getHttpServer()).delete(`${BASE}/media-vault`).expect(200);
    await request(app.getHttpServer()).get(`${BASE}/media-vault`).expect(404);
  });

  it("rejects a duplicate id (409) and an invalid body (400)", async () => {
    await request(app.getHttpServer()).post(BASE).send(project).expect(201);
    await request(app.getHttpServer()).post(BASE).send(project).expect(409);
    // Missing required name (Phase 98 made `path` optional/machine-local, so a
    // bare `{ id }` is the reliable contract-400 case now) → contract 400.
    await request(app.getHttpServer()).post(BASE).send({ id: "x" }).expect(400);
    await request(app.getHttpServer()).delete(`${BASE}/media-vault`).expect(200);
  });

  it("searches projects by name/desc/category without colliding with /:id or /categories", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "auth-svc", name: "auth-svc", desc: "Login service", path: "~/p/auth" })
      .expect(201);

    const hits = await request(app.getHttpServer()).get(`${BASE}/search?q=login`).expect(200);
    expect(hits.body.map((p: { id: string }) => p.id)).toEqual(["auth-svc"]);

    // "/search" resolves to the search route, never to GET /projects/:id (→ 404).
    const empty = await request(app.getHttpServer()).get(`${BASE}/search?q=zzz`).expect(200);
    expect(empty.body).toEqual([]);

    await request(app.getHttpServer()).delete(`${BASE}/auth-svc`).expect(200);
  });

  it("round-trips non-secret env on the entity (committed)", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "env-proj", name: "env-proj", path: "~/p/env", env: { NODE_ENV: "production" } })
      .expect(201);
    const got = await request(app.getHttpServer()).get(`${BASE}/env-proj`).expect(200);
    expect(got.body.env).toEqual({ NODE_ENV: "production" });
    expect(got.body.hasSecrets).toBe(false);
    // env lives on the committed manifest; secrets never do.
    const raw = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
    expect(raw).toContain("NODE_ENV");
    await request(app.getHttpServer()).delete(`${BASE}/env-proj`).expect(200);
  });

  it("stores secrets write-only: hasSecrets flips, the secret never reads back, cascades on delete", async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "sec-proj", name: "sec-proj", path: "~/p/sec" })
      .expect(201);

    await request(app.getHttpServer())
      .put(`${BASE}/sec-proj/secrets`)
      .send({ DB_URL: "postgres://super-secret" })
      .expect(200);

    const got = await request(app.getHttpServer()).get(`${BASE}/sec-proj`).expect(200);
    expect(got.body.hasSecrets).toBe(true);
    expect(JSON.stringify(got.body)).not.toContain("super-secret");
    // The secret lives ONLY under PROJECT_SECRETS_DIR, never the manifest.
    const manifest = await fs.readFile(path.join(dir, "_projects.json"), "utf8");
    expect(manifest).not.toContain("super-secret");
    const secRaw = await fs.readFile(path.join(secretsDir, "sec-proj.json"), "utf8");
    expect(secRaw).toContain("super-secret");

    // Deleting the project cascades the secrets file.
    await request(app.getHttpServer()).delete(`${BASE}/sec-proj`).expect(200);
    await expect(fs.access(path.join(secretsDir, "sec-proj.json"))).rejects.toThrow();
  });

  it("refuses to delete a project category that still has projects (409)", async () => {
    await request(app.getHttpServer())
      .post(CATS)
      .send({ name: "Vývoj", glyph: "code" })
      .expect(201);
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "auth-svc", name: "auth-svc", path: "~/p/auth", category: "Vývoj" })
      .expect(201);

    await request(app.getHttpServer()).delete(`${CATS}/Vývoj`).expect(409);

    // Removing the project frees the category for deletion.
    await request(app.getHttpServer()).delete(`${BASE}/auth-svc`).expect(200);
    await request(app.getHttpServer())
      .delete(`${CATS}/${encodeURIComponent("Vývoj")}`)
      .expect(200);
  });

  it("links a project to a company via PATCH, then unlinks it with companyId: null (Phase 72)", async () => {
    await request(app.getHttpServer())
      .post("/api/companies")
      .send({ id: "clearco", name: "Clear Co" })
      .expect(201);
    await request(app.getHttpServer())
      .post(BASE)
      .send({ id: "linkable", name: "linkable", path: "~/p/linkable" })
      .expect(201);

    const linked = await request(app.getHttpServer())
      .patch(`${BASE}/linkable`)
      .send({ companyId: "clearco" })
      .expect(200);
    expect(linked.body.companyId).toBe("clearco");

    // A PATCH that omits companyId leaves the existing link alone.
    const untouched = await request(app.getHttpServer())
      .patch(`${BASE}/linkable`)
      .send({ desc: "moved" })
      .expect(200);
    expect(untouched.body.companyId).toBe("clearco");

    // `companyId: null` is the explicit unlink signal.
    const unlinked = await request(app.getHttpServer())
      .patch(`${BASE}/linkable`)
      .send({ companyId: null })
      .expect(200);
    expect(unlinked.body.companyId).toBeUndefined();

    await request(app.getHttpServer()).delete(`${BASE}/linkable`).expect(200);
    await request(app.getHttpServer()).delete("/api/companies/clearco").expect(200);
  });

  describe("GET /projects/:id/resolved (Phase 72)", () => {
    it("404s for an unknown project id", async () => {
      await request(app.getHttpServer()).get(`${BASE}/nope/resolved`).expect(404);
    });

    it("returns the project's own raw data for a company-less project", async () => {
      await request(app.getHttpServer())
        .post(BASE)
        .send({
          id: "solo",
          name: "solo",
          path: "~/p/solo",
          identity: { people: [{ name: "Bob", role: "Engineer" }] },
          budget: { dailyRuns: 3 },
        })
        .expect(201);

      const got = await request(app.getHttpServer()).get(`${BASE}/solo/resolved`).expect(200);
      expect(got.body.companyId).toBeUndefined();
      expect(got.body.companyName).toBeUndefined();
      expect(got.body.budget).toEqual({ dailyRuns: 3 });
      // Phase 69 backfills a missing person id (slugified name) on read.
      expect(got.body.people).toEqual([{ id: "bob", name: "Bob", role: "Engineer" }]);
      expect(got.body.integrations).toEqual([]);

      await request(app.getHttpServer()).delete(`${BASE}/solo`).expect(200);
    });

    it("merges people/budget/integrations from a linked company", async () => {
      await request(app.getHttpServer())
        .post("/api/companies")
        .send({
          id: "acme",
          name: "Acme Corp",
          people: [{ id: "alice", name: "Alice", role: "CEO" }],
          budget: { dailyRuns: 10, weeklyRuns: 50 },
        })
        .expect(201);
      await request(app.getHttpServer())
        .post("/api/integrations")
        .send({
          id: "co-jira",
          kind: "jira",
          companyId: "acme",
          config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "ops@acme.com" },
          ownerSubsystem: "puls",
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(BASE)
        .send({
          id: "linked",
          name: "linked",
          path: "~/p/linked",
          companyId: "acme",
          identity: { people: [{ id: "bob", name: "Bob", role: "Engineer" }] },
          budget: { dailyRuns: 3 },
        })
        .expect(201);
      await request(app.getHttpServer())
        .post("/api/integrations")
        .send({
          id: "proj-slack",
          kind: "slack",
          projectId: "linked",
          config: { kind: "slack", channels: ["C1"] },
          ownerSubsystem: "puls",
        })
        .expect(201);

      const got = await request(app.getHttpServer()).get(`${BASE}/linked/resolved`).expect(200);
      expect(got.body.companyId).toBe("acme");
      expect(got.body.companyName).toBe("Acme Corp");
      // Field-level budget merge: project's dailyRuns wins, company's weeklyRuns inherited.
      expect(got.body.budget).toEqual({ dailyRuns: 3, weeklyRuns: 50 });
      // People merge by id: company's roster + project's own addition.
      expect(got.body.people.map((p: { id: string }) => p.id).sort()).toEqual(["alice", "bob"]);
      // Integrations union (different kinds): company's jira + the project's own slack.
      expect(got.body.integrations.map((i: { id: string }) => i.id).sort()).toEqual([
        "co-jira",
        "proj-slack",
      ]);

      await request(app.getHttpServer()).delete(`${BASE}/linked`).expect(200);
      await request(app.getHttpServer()).delete("/api/integrations/co-jira").expect(200);
      await request(app.getHttpServer()).delete("/api/integrations/proj-slack").expect(200);
      await request(app.getHttpServer()).delete("/api/companies/acme").expect(200);
    });
  });

  describe("GET /projects/:id/prs and POST /projects/:id/prs/:number/merge (Phase 78)", () => {
    it("404s GET .../prs for an unknown project id", async () => {
      await request(app.getHttpServer()).get(`${BASE}/nope/prs`).expect(404);
    });

    it("404s POST .../merge for an unknown project id", async () => {
      await request(app.getHttpServer()).post(`${BASE}/nope/prs/1/merge`).send({}).expect(404);
    });

    it("returns [] (never an error) for a project with no github integration", async () => {
      await request(app.getHttpServer())
        .post(BASE)
        .send({ id: "no-github", name: "no-github", path: "~/p/no-github" })
        .expect(201);

      const got = await request(app.getHttpServer()).get(`${BASE}/no-github/prs`).expect(200);
      expect(got.body).toEqual([]);

      await request(app.getHttpServer()).delete(`${BASE}/no-github`).expect(200);
    });

    it("422s a merge attempt when the project has no github link (explicit operator click needs a real answer)", async () => {
      await request(app.getHttpServer())
        .post(BASE)
        .send({ id: "no-link", name: "no-link", path: "~/p/no-link" })
        .expect(201);

      await request(app.getHttpServer()).post(`${BASE}/no-link/prs/1/merge`).send({}).expect(422);

      await request(app.getHttpServer()).delete(`${BASE}/no-link`).expect(200);
    });

    it("returns [] for a github integration with no stored token (never an error)", async () => {
      await request(app.getHttpServer())
        .post(BASE)
        .send({ id: "no-token", name: "no-token", path: "~/p/no-token" })
        .expect(201);
      await request(app.getHttpServer())
        .post("/api/integrations")
        .send({
          id: "no-token-github",
          kind: "github",
          projectId: "no-token",
          config: {
            kind: "github",
            repo: "acme/app",
            streams: ["issues", "pulls"],
            username: "octocat",
          },
          ownerSubsystem: "puls",
        })
        .expect(201);

      const got = await request(app.getHttpServer()).get(`${BASE}/no-token/prs`).expect(200);
      expect(got.body).toEqual([]);

      await request(app.getHttpServer()).delete(`${BASE}/no-token`).expect(200);
      await request(app.getHttpServer()).delete("/api/integrations/no-token-github").expect(200);
    });
  });
});
