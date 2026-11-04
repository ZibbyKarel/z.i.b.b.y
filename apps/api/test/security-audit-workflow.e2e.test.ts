import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { WorkflowRunnerService } from "../src/workflows/workflow-runner.service";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The committed production data (read-only here: copied into the suite's temp data dir). */
const PROD = path.resolve(HERE, "../../../.zibby/data");
const AGENTS = [
  "security-auditor",
  "penetration-tester",
  "security-engineer",
  "compliance-auditor",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * TODO 37 — the production `security-audit` workflow runs the installed Cloudflare
 * `/security-audit` external skill in its `audit` phase. Token-free: the stages spawn
 * fake-claude, which dumps each session's argv, so the test sees exactly what the real
 * CLI would get.
 */
describe("security-audit workflow runs the /security-audit skill (e2e)", () => {
  let app: INestApplication;
  let dumpDir: string;
  let extDir: string;

  beforeAll(async () => {
    // vitest.setup.ts points ZIBBY_DATA_DIR at a fresh temp root; seed only what the run needs.
    const data = process.env.ZIBBY_DATA_DIR as string;
    await fs.mkdir(path.join(data, "workflows"), { recursive: true });
    await fs.copyFile(
      path.join(PROD, "workflows/security-audit.workflow.md"),
      path.join(data, "workflows/security-audit.workflow.md"),
    );
    await fs.mkdir(path.join(data, "agents"), { recursive: true });
    for (const id of AGENTS) {
      await fs.copyFile(path.join(PROD, `agents/${id}.md`), path.join(data, `agents/${id}.md`));
    }
    extDir = path.join(data, "skills-external/security-audit");
    await fs.mkdir(extDir, { recursive: true });
    await fs.copyFile(
      path.join(PROD, "skills-external/security-audit/SKILL.md"),
      path.join(extDir, "SKILL.md"),
    );
    await fs.copyFile(
      path.join(PROD, "external-skills.json"),
      path.join(data, "external-skills.json"),
    );

    dumpDir = await fs.mkdtemp(path.join(os.tmpdir(), "security-audit-argv-"));
    process.env.AGENT_RUNNER_MODE = "claude";
    process.env.FAKE_CLAUDE_STEPS = "1";
    process.env.FAKE_CLAUDE_DELAY_MS = "5";
    process.env.FAKE_CLAUDE_DUMP_ARGS_DIR = dumpDir;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dumpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    process.env.AGENT_RUNNER_MODE = "demo";
    for (const k of ["FAKE_CLAUDE_STEPS", "FAKE_CLAUDE_DELAY_MS", "FAKE_CLAUDE_DUMP_ARGS_DIR"]) {
      delete process.env[k];
    }
  });

  it("validates, and only the audit stage carries /security-audit + its folder grant", async () => {
    const wf = await request(app.getHttpServer()).get("/api/workflows/security-audit").expect(200);
    const phases = wf.body.phases as { id: string; skill?: string }[];
    expect(phases.find((p) => p.id === "audit")?.skill).toBe("security-audit");
    expect(phases.filter((p) => p.skill).map((p) => p.id)).toEqual(["audit"]);

    const runner = app.get(WorkflowRunnerService);
    const { workflowRunId } = (await runner.start("security-audit")) as { workflowRunId: string };

    // Wait for the audit stage AND the exploit stage after it to have spawned.
    const stageOf = (argv: string[]) => /fázi workflow "([^"]+)"/.exec(argv.join("\n"))?.[1];
    let dumps: string[][] = [];
    for (const start = Date.now(); Date.now() - start < 25_000; await sleep(50)) {
      const files = await fs.readdir(dumpDir);
      dumps = await Promise.all(
        files.map(async (f) => JSON.parse(await fs.readFile(path.join(dumpDir, f), "utf8"))),
      );
      if (dumps.some((d) => stageOf(d) === "exploit")) break;
    }

    const audit = dumps.find((d) => stageOf(d) === "audit");
    const exploit = dumps.find((d) => stageOf(d) === "exploit");
    expect(audit, "audit stage never spawned").toBeDefined();
    expect(exploit, "exploit stage never spawned").toBeDefined();

    const auditArgv = (audit ?? []).join("\n");
    expect(auditArgv).toContain("## Skill /security-audit\n");
    expect(auditArgv).toContain(`ve složce ${extDir}`);
    expect(auditArgv).toContain("Run /security-audit in full audit mode");
    const grantsOf = (argv: string[]) =>
      argv.flatMap((a, i) => (a === "--add-dir" ? [argv[i + 1]] : []));
    expect(grantsOf(audit ?? [])).toContain(extDir);

    // The next phase runs its own agent with no skill attached.
    expect((exploit ?? []).join("\n")).not.toContain("## Skill /");
    expect(grantsOf(exploit ?? [])).not.toContain(extDir);

    // Let the run settle (validate's missing verdict parks it) so no stage outlives the app.
    for (const start = Date.now(); Date.now() - start < 25_000; await sleep(50)) {
      const { status } = runner.get(workflowRunId) as { status: string };
      if (status !== "running") break;
    }
  });
});
