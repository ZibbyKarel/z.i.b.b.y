import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

// Integrations are owned by a project (one project = one company); the suite seeds
// its own `acme-app` + `zibby-self` projects below (self-contained — the shared
// `data-test/` seed root carries no project registry).
const SLACK = {
  id: "team-slack",
  kind: "slack",
  projectId: "acme-app",
  name: "Team Slack",
  config: { kind: "slack", channels: ["C123"] },
};

describe("Integrations API (e2e)", () => {
  let app: INestApplication;
  let integrationsDir: string;
  let credentialsDir: string;
  let stateDir: string;
  let projectsDir: string;
  let companiesDir: string;
  let projectPath: string;

  beforeAll(async () => {
    integrationsDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-INTEGRATIONS_DIR-"));
    credentialsDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-CREDENTIALS_DIR-"));
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-INTEGRATION_STATE_DIR-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-PROJECTS_DIR-"));
    companiesDir = await fs.mkdtemp(path.join(os.tmpdir(), "int-COMPANIES_DIR-"));
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "int-project-path-"));
    process.env.INTEGRATIONS_DIR = integrationsDir;
    process.env.CREDENTIALS_DIR = credentialsDir;
    process.env.INTEGRATION_STATE_DIR = stateDir;
    process.env.PROJECTS_DIR = projectsDir;
    process.env.COMPANIES_DIR = companiesDir;
    // The connection tester routes through the adapter registry; fake mode keeps the
    // test endpoint off the network.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // The projectId FK is validated on create — seed the owning projects.
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "acme-app", name: "Acme App", path: projectPath })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "zibby-self", name: "ZIBBY Self", path: projectPath })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(integrationsDir, { recursive: true, force: true });
    await fs.rm(credentialsDir, { recursive: true, force: true });
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(projectsDir, { recursive: true, force: true });
    await fs.rm(companiesDir, { recursive: true, force: true });
    await fs.rm(projectPath, { recursive: true, force: true });
    for (const k of [
      "INTEGRATIONS_DIR",
      "CREDENTIALS_DIR",
      "INTEGRATION_STATE_DIR",
      "PROJECTS_DIR",
      "COMPANIES_DIR",
    ]) {
      delete process.env[k];
    }
  });

  it("creates, lists and gets an integration (hasCredentials false initially)", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/integrations")
      .send(SLACK)
      .expect(201);
    expect(created.body.id).toBe("team-slack");
    expect(created.body.status).toBe("disconnected");
    expect(created.body.hasCredentials).toBe(false);

    const list = await request(app.getHttpServer()).get("/api/integrations").expect(200);
    expect(list.body.map((i: { id: string }) => i.id)).toContain("team-slack");

    const got = await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(200);
    expect(got.body.hasCredentials).toBe(false);
  });

  it("rejects a duplicate id (409) and a kind/config mismatch (422)", async () => {
    await request(app.getHttpServer()).post("/api/integrations").send(SLACK).expect(409);
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "bad",
        kind: "slack",
        projectId: "acme-app",
        config: {
          kind: "email",
          imapHost: "h",
          imapPort: 1,
          smtpHost: "h",
          smtpPort: 1,
          user: "u",
        },
      })
      .expect(422);
  });

  it("rejects an integration referencing an unknown project (422)", async () => {
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "orphan",
        kind: "slack",
        projectId: "nope-not-a-project",
        config: { kind: "slack", channels: [] },
      })
      .expect(422);
  });

  it("lists integrations scoped to a project via ?projectId", async () => {
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "self-mail",
        kind: "email",
        projectId: "zibby-self",
        config: {
          kind: "email",
          imapHost: "h",
          imapPort: 993,
          smtpHost: "h",
          smtpPort: 465,
          user: "me@x.dev",
        },
      })
      .expect(201);

    const acme = await request(app.getHttpServer())
      .get("/api/integrations?projectId=acme-app")
      .expect(200);
    const acmeIds = acme.body.map((i: { id: string }) => i.id);
    expect(acmeIds).toContain("team-slack");
    expect(acmeIds).not.toContain("self-mail");

    const self = await request(app.getHttpServer())
      .get("/api/integrations?projectId=zibby-self")
      .expect(200);
    expect(self.body.map((i: { id: string }) => i.id)).toEqual(["self-mail"]);
  });

  it("Phase 70: a project linked to a company sees its EFFECTIVE integrations (company + own, merged by kind)", async () => {
    // acme-app already owns "team-slack" (kind slack) + "no-creds" isn't created yet
    // at this point in the suite ordering — seed a fresh, isolated project+company pair
    // instead of reusing acme-app's evolving fixture state.
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "acme-branch", name: "Acme Branch", path: projectPath })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/companies")
      .send({ id: "acme-hq", name: "Acme HQ" })
      .expect(201);
    await request(app.getHttpServer())
      .patch("/api/projects/acme-branch")
      .send({ companyId: "acme-hq" })
      .expect(200);

    // Company owns a Jira integration; the project owns its own Slack integration —
    // different kinds, so the effective set is the union of both.
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "hq-jira",
        kind: "jira",
        companyId: "acme-hq",
        config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "hq@acme.dev" },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "branch-slack",
        kind: "slack",
        projectId: "acme-branch",
        config: { kind: "slack", channels: ["C1"] },
      })
      .expect(201);

    const merged = await request(app.getHttpServer())
      .get("/api/integrations?projectId=acme-branch")
      .expect(200);
    expect(merged.body.map((i: { id: string }) => i.id).sort()).toEqual([
      "branch-slack",
      "hq-jira",
    ]);

    // Same kind (slack) at both company and project → the project's own wins.
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "hq-slack",
        kind: "slack",
        companyId: "acme-hq",
        config: { kind: "slack", channels: ["C-hq"] },
      })
      .expect(201);
    const overridden = await request(app.getHttpServer())
      .get("/api/integrations?projectId=acme-branch")
      .expect(200);
    expect(overridden.body.map((i: { id: string }) => i.id).sort()).toEqual([
      "branch-slack",
      "hq-jira",
    ]);

    // A dangling companyId never 500s — resolves as "no company" (own integrations only).
    await request(app.getHttpServer())
      .patch("/api/projects/acme-branch")
      .send({ companyId: "no-such-company" })
      .expect(200);
    const dangling = await request(app.getHttpServer())
      .get("/api/integrations?projectId=acme-branch")
      .expect(200);
    expect(dangling.body.map((i: { id: string }) => i.id)).toEqual(["branch-slack"]);
  });

  it("stores credentials separately: the entity file never contains the token", async () => {
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ token: "xoxb-super-secret-123" })
      .expect(200);

    // The entity reports hasCredentials but never the secret.
    const got = await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(200);
    expect(got.body.hasCredentials).toBe(true);
    expect(JSON.stringify(got.body)).not.toContain("xoxb-super-secret-123");

    // Raw-file assertion: token lives ONLY under CREDENTIALS_DIR.
    const entityRaw = await fs.readFile(path.join(integrationsDir, "team-slack.json"), "utf8");
    expect(entityRaw).not.toContain("xoxb-super-secret-123");
    const credRaw = await fs.readFile(path.join(credentialsDir, "team-slack.json"), "utf8");
    expect(credRaw).toContain("xoxb-super-secret-123");
  });

  it("rejects a credential whose kind disagrees (slack wants a token, not a password)", async () => {
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ password: "nope" })
      .expect(422);
  });

  it("test endpoint: 409 without credentials, 200 + connected after", async () => {
    await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "no-creds",
        kind: "slack",
        projectId: "acme-app",
        config: { kind: "slack", channels: [] },
      })
      .expect(201);
    await request(app.getHttpServer()).post("/api/integrations/no-creds/test").send({}).expect(409);

    const tested = await request(app.getHttpServer())
      .post("/api/integrations/team-slack/test")
      .send({})
      .expect(200);
    expect(tested.body.ok).toBe(true);
    const got = await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(200);
    expect(got.body.status).toBe("connected");
  });

  it("update cannot change kind (config of a different kind → 422)", async () => {
    await request(app.getHttpServer())
      .patch("/api/integrations/team-slack")
      .send({
        config: {
          kind: "email",
          imapHost: "h",
          imapPort: 1,
          smtpHost: "h",
          smtpPort: 1,
          user: "u",
        },
      })
      .expect(422);
    // A same-kind config update is fine.
    await request(app.getHttpServer())
      .patch("/api/integrations/team-slack")
      .send({ enabled: false, config: { kind: "slack", channels: ["C123", "C999"] } })
      .expect(200);
  });

  it("creates without any subsystem attribution (membership is derived, not stored)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/integrations")
      .send({
        id: "no-owner",
        kind: "slack",
        projectId: "acme-app",
        name: "No Owner",
        config: { kind: "slack", channels: ["C123"] },
      });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("ownerSubsystem");
  });

  it("delete cascades the credentials file", async () => {
    await request(app.getHttpServer())
      .delete("/api/integrations/team-slack/credentials")
      .expect(200);
    // Re-add credentials then delete the integration; the cred file must be gone.
    await request(app.getHttpServer())
      .put("/api/integrations/team-slack/credentials")
      .send({ token: "xoxb-again" })
      .expect(200);
    await request(app.getHttpServer()).delete("/api/integrations/team-slack").expect(200);
    await request(app.getHttpServer()).get("/api/integrations/team-slack").expect(404);
    await expect(fs.access(path.join(credentialsDir, "team-slack.json"))).rejects.toThrow();
  });
});
