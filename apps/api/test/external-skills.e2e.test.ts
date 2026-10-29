import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import matter from "gray-matter";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { SkillRepoGit } from "../src/external-skills/skill-repo-git";

const url = "https://github.com/cloudflare/security-audit-skill";

describe("External skills API (e2e)", () => {
  let app: INestApplication;
  let tmp: string;

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "ext-skills-e2e-"));
    const fixture = path.join(tmp, "repo");
    await mkdir(path.join(fixture, "skills", "security-audit"), { recursive: true });
    await writeFile(
      path.join(fixture, "skills", "security-audit", "SKILL.md"),
      "---\nname: security-audit\ndescription: Audit code\n---\nHunt bugs.\n",
    );
    process.env.SKILLS_DIR = path.join(tmp, "skills");
    process.env.EXTERNAL_SKILLS_FILE = path.join(tmp, "external-skills.json");
    process.env.EXTERNAL_SKILLS_DIR = path.join(tmp, "skills-external");
    process.env.WORKFLOWS_DIR = path.join(tmp, "workflows");
    await mkdir(process.env.WORKFLOWS_DIR, { recursive: true });
    const phase = (id: string, consumes: string, produces: string, skill?: string) => ({
      id,
      agent: "coder",
      model: "sonnet",
      thinking: "low",
      consumes,
      produces,
      ...(skill ? { skill } : {}),
    });
    await writeFile(
      path.join(process.env.WORKFLOWS_DIR, "audit-only.workflow.md"),
      matter.stringify("x\n", {
        name: "Audit only",
        phases: [phase("audit", "in.md", "a.md", "security-audit")],
      }),
    );
    await writeFile(
      path.join(process.env.WORKFLOWS_DIR, "build.workflow.md"),
      matter.stringify("x\n", {
        name: "Build",
        phases: [
          phase("plan", "in.md", "plan.md"),
          phase("audit", "plan.md", "audit.md", "security-audit"),
          phase("code", "audit.md", "code.md"),
        ],
      }),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SkillRepoGit)
      .useValue({
        clone: async (_remote: string, dest: string) => {
          await cp(fixture, dest, { recursive: true });
          return "abc";
        },
        lsRemoteHead: async () => "abc",
        treeSha: async () => "tree1",
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(tmp, { recursive: true, force: true });
    delete process.env.SKILLS_DIR;
    delete process.env.EXTERNAL_SKILLS_FILE;
    delete process.env.EXTERNAL_SKILLS_DIR;
    delete process.env.WORKFLOWS_DIR;
  });

  it("scans, installs, lists and refuses to edit an external skill", async () => {
    const server = app.getHttpServer();
    const scan = await request(server).post("/api/skills/external/scan").send({ url }).expect(200);
    expect(scan.body.candidates).toEqual([
      expect.objectContaining({
        path: "skills/security-audit",
        id: "security-audit",
        conflict: false,
      }),
    ]);

    const installed = await request(server)
      .post("/api/skills/external")
      .send({ url, paths: ["skills/security-audit"] })
      .expect(201);
    expect(installed.body[0]).toMatchObject({ id: "security-audit", source: { sha: "abc" } });

    const list = await request(server).get("/api/skills").expect(200);
    expect(list.body.map((s: { id: string }) => s.id)).toContain("security-audit");

    await request(server).patch("/api/skills/security-audit").send({ desc: "x" }).expect(409);
    await request(server).delete("/api/skills/security-audit").expect(409);
    await request(server)
      .post("/api/skills/external")
      .send({ url, paths: ["skills/security-audit"] })
      .expect(409);
  });

  it("syncs one skill and all skills; unknown id → 404", async () => {
    const server = app.getHttpServer();
    const one = await request(server).post("/api/skills/external/security-audit/sync").expect(200);
    expect(one.body).toMatchObject({ id: "security-audit", source: { latestSha: "abc" } });
    const all = await request(server).post("/api/skills/external/sync").expect(200);
    expect(all.body).toEqual({ checked: 1, updated: [], failed: [] });
    await request(server).post("/api/skills/external/nope/sync").expect(404);
  });

  it("maps bad url → 400 and unknown path → 422", async () => {
    const server = app.getHttpServer();
    await request(server)
      .post("/api/skills/external/scan")
      .send({ url: "https://gitlab.com/a/b" })
      .expect(400);
    await request(server)
      .post("/api/skills/external")
      .send({ url, paths: ["skills/nope"] })
      .expect(422);
  });

  it("lists usages and uninstalls with per-workflow decisions", async () => {
    const server = app.getHttpServer();
    const usages = await request(server)
      .get("/api/skills/external/security-audit/usages")
      .expect(200);
    expect(usages.body).toEqual([
      { workflowId: "audit-only", name: "Audit only", phaseIds: ["audit"] },
      { workflowId: "build", name: "Build", phaseIds: ["audit"] },
    ]);
    await request(server).get("/api/skills/external/nope/usages").expect(404);
    await request(server).post("/api/skills/external/nope/uninstall").send({}).expect(404);

    const uninstall = (workflows: Record<string, string>) =>
      request(server).post("/api/skills/external/security-audit/uninstall").send({ workflows });
    expect((await uninstall({ build: "step" }).expect(409)).body.message).toContain("audit-only");
    expect(
      (await uninstall({ "audit-only": "step", build: "step" }).expect(422)).body.message,
    ).toContain("audit-only");
    await request(server).get("/api/workflows/audit-only").expect(200);

    expect((await uninstall({ "audit-only": "workflow", build: "step" }).expect(200)).body).toEqual(
      {
        id: "security-audit",
      },
    );
    await request(server).get("/api/workflows/audit-only").expect(404);
    const build = await request(server).get("/api/workflows/build").expect(200);
    expect(build.body.phases.map((p: { id: string }) => p.id)).toEqual(["plan", "code"]);
    await request(server).get("/api/skills/security-audit").expect(404);
  });
});
