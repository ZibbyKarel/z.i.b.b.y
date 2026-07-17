import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/**
 * NS2 F5b — Maestro's read-side merge queue over HTTP. Read-only (no merge
 * route exists on this contract at all — merging stays
 * `POST /api/projects/:id/prs/:number/merge`). Isolated the same way as
 * `projects.e2e.test.ts`: this route resolves the project's effective
 * (company-merged) github integration, so it needs the same set of isolated
 * registries even though these tests never seed a github integration.
 */
describe("Maestro API (e2e)", () => {
  let app: INestApplication;
  let dir: string;
  let secretsDir: string;
  let companiesDir: string;
  let integrationsDir: string;
  let integrationStateDir: string;
  let credentialsDir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-e2e-projects-"));
    secretsDir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-e2e-secrets-"));
    companiesDir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-e2e-companies-"));
    integrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-e2e-integrations-"));
    integrationStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-e2e-int-state-"));
    credentialsDir = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-e2e-credentials-"));
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

  it("returns 200 + the queue shape with no projects", async () => {
    const res = await request(app.getHttpServer()).get("/api/maestro/queue").expect(200);
    expect(res.body).toEqual({ entries: [], generatedAt: expect.any(String) });
  });

  it("a project with no github integration contributes nothing (never an error)", async () => {
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "no-github", name: "no-github", path: "~/p/no-github" })
      .expect(201);

    const res = await request(app.getHttpServer()).get("/api/maestro/queue").expect(200);
    expect(res.body.entries).toEqual([]);

    await request(app.getHttpServer()).delete("/api/projects/no-github").expect(200);
  });

  it("?projectId= filters the queue to one project", async () => {
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "filter-me", name: "filter-me", path: "~/p/filter-me" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/maestro/queue?projectId=filter-me")
      .expect(200);
    expect(res.body.entries).toEqual([]);

    await request(app.getHttpServer()).get("/api/maestro/queue?projectId=").expect(400);

    await request(app.getHttpServer()).delete("/api/projects/filter-me").expect(200);
  });
});
