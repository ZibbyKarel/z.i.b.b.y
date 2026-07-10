import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PipelineRunnerService } from "../src/pipelines/pipeline-runner.service";

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/fake-claude.mjs",
);
/** Check script that fails on its first invocation, then passes (see fixtures/flaky-check.mjs). */
const FLAKY_CHECK = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/flaky-check.mjs",
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Generous default (Phase 13.4): demo pipeline runs are timing-sensitive, and under
// full-suite CPU load a run that normally finishes in <1s can be starved for seconds —
// a tight poll window is the demo-timeout flake. Stays under the 30s testTimeout.
async function until<T>(fn: () => Promise<T>, timeoutMs = 25000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out");
    await sleep(40);
  }
}

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent: "writer",
  consumes: `${id}.in`,
  produces: `${id}.out`,
  model: "sonnet",
  thinking: "medium",
  ...extra,
});

describe("Pipelines API (e2e)", () => {
  let app: INestApplication;
  let pipelinesDir: string;
  let runsDir: string;
  let projectsDir: string;
  let vaultDir: string;

  async function boot(): Promise<INestApplication> {
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.PIPELINE_RUNS_DIR = runsDir;
    process.env.PROJECTS_DIR = projectsDir;
    process.env.VAULT_DIR = vaultDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fresh = moduleRef.createNestApplication();
    await fresh.init();
    return fresh;
  }

  beforeAll(async () => {
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipelines-e2e-"));
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-runs-e2e-"));
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-projects-e2e-"));
    // Isolate the vault so the run recorder (Phase 4) writes here, not the dev vault.
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-vault-e2e-"));
    process.env.AGENT_DEMO_STEPS = "2";
    process.env.AGENT_DEMO_DELAY_MS = "30";
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(pipelinesDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(runsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(projectsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    await fs.rm(vaultDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    for (const k of [
      "PIPELINES_DIR",
      "PIPELINE_RUNS_DIR",
      "PROJECTS_DIR",
      "VAULT_DIR",
      "AGENT_DEMO_STEPS",
      "AGENT_DEMO_DELAY_MS",
      "PIPELINE_DEMO_FAIL_PHASES",
      "PIPELINE_DEMO_GAP_PHASES",
      "PIPELINE_DEMO_EMIT_LEARNED",
    ]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    delete process.env.PIPELINE_DEMO_FAIL_PHASES;
    delete process.env.PIPELINE_DEMO_GAP_PHASES;
  });

  it("creates a pipeline; a dangling loop target is rejected (400 at the contract, 422 on update)", async () => {
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({ id: "release", phases: [phase("a"), phase("b")], instructions: "ship" })
      .expect(201);

    // On create the body is validated by the contract's superRefine → 400.
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "broken",
        phases: [
          phase("only", { loop: { to: "ghost", maxRetries: 1, escalate: false, then: "fail" } }),
        ],
        instructions: "x",
      })
      .expect(400);

    // The partial update body has no refine, so a dangling loop reaches storage
    // validation and surfaces as 422.
    await request(app.getHttpServer())
      .patch("/api/pipelines/release")
      .send({
        phases: [
          phase("a", { loop: { to: "ghost", maxRetries: 1, escalate: false, then: "fail" } }),
        ],
      })
      .expect(422);
  });

  it("runs a two-phase pipeline and hands off the produces file from A to B", async () => {
    const pipelines = app.get(PipelineRunnerService);
    const start = await pipelines.start("release", undefined, "zibby-core");
    const { pipelineRunId, status } = start;
    expect(status).toBe("running");

    const final = await until(async () => {
      const res = pipelines.get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });

    expect(final.status).toBe("done");
    expect(final.stageRuns.map((s: { phaseId: string }) => s.phaseId)).toEqual(["a", "b"]);

    // The handoff: A's produces (a.out) was copied into B's cwd as B's consumes
    // (b.in). Stage sandboxes are numbered in dispatch order (P1-T1).
    const handoff = await fs.readFile(path.join(final.cwd, "02_b", "b.in"), "utf8");
    expect(handoff).toContain("output of a");
  });

  it("records a delivery as a daily line with the project backlink, but NO learned.md knowledge note (Phase 108 retired fileLearned)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const project = await request(app.getHttpServer())
      .post("/api/projects")
      .send({
        id: "learn-proj",
        name: "Learn project",
        path: await fs.mkdtemp(path.join(os.tmpdir(), "learn-proj-")),
      })
      .expect(201);
    const projectId: string = project.body.id;

    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({ id: "learnpipe", phases: [phase("doc")], instructions: "deliver" })
      .expect(201);

    // The stage still emits a learned.md artifact (a Dokumentátor phase can produce
    // one) — Phase 108 retired only `RunRecorderService.fileLearned`'s promotion of
    // it into a vault knowledge note; the nightly `MemoryDistillerService` is now the
    // sole write path for run-derived learnings (see docs/plans/phase-105-…, item 5).
    process.env.PIPELINE_DEMO_EMIT_LEARNED = "doc";
    let pipelineRunId: string;
    try {
      const start = await app.get(PipelineRunnerService).start("learnpipe", undefined, projectId);
      pipelineRunId = start.pipelineRunId;
      await until(async () => {
        const res = app.get(PipelineRunnerService).get(pipelineRunId);
        return res.status === "done" ? res : null;
      });
    } finally {
      delete process.env.PIPELINE_DEMO_EMIT_LEARNED;
    }

    const learnedId = `learned-${pipelineRunId}`;
    // The recorder runs async on terminal status — wait for the daily line.
    const daily = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/memory/note/${today}`);
      if (res.status !== 200) return null;
      return res.body.body?.includes(pipelineRunId) ? res.body : null;
    });
    expect(daily.body).toContain(`pipeline ${pipelineRunId} (learnpipe) → done`);
    expect(daily.body).toContain(`[[${projectId}]]`);
    // No learned-note backlink was ever written.
    expect(daily.body).not.toContain(`[[${learnedId}]]`);

    // No learned note was filed, and the project MOC carries no backlink to it.
    await request(app.getHttpServer()).get(`/api/memory/note/${learnedId}`).expect(404);
    const moc = await request(app.getHttpServer()).get(`/api/memory/note/${projectId}`).expect(200);
    expect(moc.body.links).not.toContain(learnedId);

    // The graph never gained a learned-note node or a MOC→learned edge.
    const graph = await request(app.getHttpServer()).get("/api/memory/graph").expect(200);
    expect(graph.body.nodes.map((n: { id: string }) => n.id)).not.toContain(learnedId);
    expect(graph.body.edges).not.toContainEqual({ from: projectId, to: learnedId });

    // Restart-shaped dedup: a fresh app over the same data dir sweeps terminal runs
    // on bootstrap, but the marker means it never writes a second daily line.
    const app2 = await boot();
    try {
      const after = await request(app2.getHttpServer())
        .get(`/api/memory/note/${today}`)
        .expect(200);
      const lines = after.body.body.split(`pipeline ${pipelineRunId} (`).length - 1;
      expect(lines).toBe(1);
    } finally {
      await app2.close();
    }
  });

  it("respects the maxRetries fuse: B fails, loops back to A, then fails the run", async () => {
    // B fails on every attempt. With maxRetries=1 it runs once + one retry = twice,
    // then escalates and (then: 'fail') fails the run — never infinitely.
    process.env.PIPELINE_DEMO_FAIL_PHASES = "b";
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "looped",
        phases: [
          phase("a"),
          phase("b", { loop: { to: "a", maxRetries: 1, escalate: true, then: "fail" } }),
        ],
        instructions: "loop",
      })
      .expect(201);

    const start = await app.get(PipelineRunnerService).start("looped", undefined, undefined);
    const { pipelineRunId } = start;

    const final = await until(async () => {
      const res = app.get(PipelineRunnerService).get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });

    expect(final.status).toBe("failed");
    const bAttempts = final.stageRuns.filter((s: { phaseId: string }) => s.phaseId === "b").length;
    // One initial + exactly one retry (maxRetries=1). The escalation marker may add
    // a synthetic 'b' entry, so bound it rather than demanding an exact count.
    expect(bAttempts).toBeGreaterThanOrEqual(2);
    expect(bAttempts).toBeLessThanOrEqual(3);
    // A re-ran because of the back-edge.
    const aAttempts = final.stageRuns.filter((s: { phaseId: string }) => s.phaseId === "a").length;
    expect(aAttempts).toBeGreaterThanOrEqual(2);
  });

  it("a verify phase runs the project checks: red → loop back → green → done", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "verify-proj-"));
    const marker = path.join(projectDir, "fixed.marker");
    const check = `${JSON.stringify(process.execPath)} ${JSON.stringify(FLAKY_CHECK)} ${JSON.stringify(marker)}`;

    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "verify-proj", name: "Verify project", path: projectDir, checks: [check] })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "verified",
        phases: [
          phase("a"),
          {
            id: "v",
            type: "verify",
            loop: { to: "a", maxRetries: 1, escalate: false, then: "fail" },
          },
          phase("b"),
        ],
        instructions: "agent → verify → agent",
      })
      .expect(201);

    const start = await app.get(PipelineRunnerService).start("verified", undefined, "verify-proj");
    expect(start.projectPath).toBe(projectDir);
    const { pipelineRunId } = start;

    const final = await until(async () => {
      const res = app.get(PipelineRunnerService).get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });

    expect(final.status).toBe("done");
    // First verify ran red (creating the marker), looped back to `a`, then green.
    expect(
      final.stageRuns.map((s: { phaseId: string; status: string }) => `${s.phaseId}:${s.status}`),
    ).toEqual(["a:done", "v:error", "a:done", "v:done", "b:done"]);

    // Handoff passthrough: verify transforms nothing, so `b` still consumed `a`'s
    // output. Five dispatches ran before it (a, v, a, v), so `b` is the fifth folder.
    const handoff = await fs.readFile(path.join(final.cwd, "05_b", "b.in"), "utf8");
    expect(handoff).toContain("output of a");

    await fs.rm(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("P1-T4 structure smoke: loop + file output — numbered-only tree, own-produces real files, symlinked handoff/context, output/ resolves the canonical artifact", async () => {
    // review is a qualify phase that gaps once (demo GAP lever) then passes, so the
    // chain genuinely loops back to developer before finishing — the same shape as
    // the plan's deferred manual code-audit smoke, at demo-mode determinism.
    process.env.PIPELINE_DEMO_GAP_PHASES = "review";
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "structure-smoke",
        phases: [
          phase("developer"),
          {
            id: "review",
            agent: "writer",
            consumes: "developer.out",
            produces: "review.out",
            model: "sonnet",
            thinking: "medium",
            qualify: true,
            loop: { to: "developer", maxRetries: 1, escalate: false, then: "park" },
          },
          phase("finish", { consumes: "review.out", produces: "final.out" }),
        ],
        outputs: [{ type: "file", from: "final.out", dest: "vault", to: "structure-smoke-note" }],
        instructions: "structure smoke",
      })
      .expect(201);

    const pipelines = app.get(PipelineRunnerService);
    const start = await pipelines.start(
      "structure-smoke",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "chain input for structure smoke",
    );
    const { pipelineRunId } = start;

    const final = await until(async () => {
      const res = pipelines.get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });
    expect(final.status).toBe("done");

    // developer → review(gap) → developer(retry) → review(pass) → finish: five
    // dispatches, numbered in call order — no flat `developer`/`review`/`finish`
    // folders alongside them (the audit's original complaint).
    const stageDirs = ["01_developer", "02_review", "03_developer", "04_review", "05_finish"];
    const entries = await fs.readdir(final.cwd, { withFileTypes: true });
    const dirNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(dirNames).toEqual([...stageDirs, "context", "output"].sort());

    // Each stage folder holds its OWN produces file as a real file — not a
    // byte-duplicated copy of a previous phase's output.
    for (const [d, file] of [
      ["01_developer", "developer.out"],
      ["03_developer", "developer.out"],
      ["04_review", "review.out"],
      ["05_finish", "final.out"],
    ] as const) {
      const st = await fs.lstat(path.join(final.cwd, d, file));
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.isFile()).toBe(true);
    }

    // Consumed input is a symlink into the producing phase's LATEST folder, not a
    // duplicate — reading it returns the exact same bytes as the source.
    const consumesLink = path.join(final.cwd, "04_review", "developer.out");
    expect((await fs.lstat(consumesLink)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(consumesLink, "utf8")).toBe(
      await fs.readFile(path.join(final.cwd, "03_developer", "developer.out"), "utf8"),
    );

    // context/ holds the pipeline-level input; every stage sees it via a symlink.
    const contextInput = path.join(final.cwd, "context", "input.md");
    expect(await fs.readFile(contextInput, "utf8")).toBe("chain input for structure smoke");
    for (const d of stageDirs) {
      const ctxLink = path.join(final.cwd, d, "context");
      expect((await fs.lstat(ctxLink)).isSymbolicLink()).toBe(true);
      expect(await fs.readFile(path.join(ctxLink, "input.md"), "utf8")).toBe(
        "chain input for structure smoke",
      );
    }

    // output/<name> is the canonical delivery source — a symlink resolving to the
    // last phase's real produces file.
    const outputLink = path.join(final.cwd, "output", "final.out");
    expect((await fs.lstat(outputLink)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(outputLink, "utf8")).toBe(
      await fs.readFile(path.join(final.cwd, "05_finish", "final.out"), "utf8"),
    );
  });

  it("retries exhaustion with then:'park' parks the run; resume-with-note completes it", async () => {
    process.env.PIPELINE_DEMO_FAIL_PHASES = "b";
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "parking",
        phases: [
          phase("a"),
          phase("b", { loop: { to: "a", maxRetries: 0, escalate: true, then: "park" } }),
        ],
        instructions: "park on exhaustion",
      })
      .expect(201);

    const start = await app.get(PipelineRunnerService).start("parking", undefined, undefined);
    const { pipelineRunId } = start;

    // b fails, maxRetries 0 → immediately exhausted → durable parking.
    const parked = await until(async () => {
      const res = app.get(PipelineRunnerService).get(pipelineRunId);
      return res.status === "parked" ? res : null;
    });
    expect(parked.parkedReason).toBe("retries");
    expect(parked.parked).toMatchObject({ phaseId: "b", attempts: 1 });

    // A premature resume of a non-parked run 409s (sanity: wrong id state).
    delete process.env.PIPELINE_DEMO_FAIL_PHASES;
    const resumed = await request(app.getHttpServer())
      .post(`/api/tasks/runs/${pipelineRunId}/resume`)
      .send({ note: "zelená cesta — tentokrát to projde" })
      .expect(200);
    expect(resumed.body.status).toBe("running");

    const final = await until(async () => {
      const res = app.get(PipelineRunnerService).get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });
    expect(final.status).toBe("done");
    // The note landed next to the run for the audit trail.
    const note = await fs.readFile(path.join(final.cwd, "b.note.md"), "utf8");
    expect(note).toContain("zelená cesta");

    // Resuming a finished run is refused.
    await request(app.getHttpServer())
      .post(`/api/tasks/runs/${pipelineRunId}/resume`)
      .send({})
      .expect(409);
  });

  it("a git project gets a worktree on a zibby/* branch; delete prunes it, keeps the branch", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    const git = async (cwd: string, ...args: string[]) =>
      (await exec("git", args, { cwd })).stdout.trim();

    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-git-repo-"));
    await git(repo, "init", "-b", "main");
    await git(repo, "config", "user.email", "t@zibby.local");
    await git(repo, "config", "user.name", "T");
    await fs.writeFile(path.join(repo, "README.md"), "# fixture\n", "utf8");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "initial");
    const mainBefore = await git(repo, "rev-parse", "HEAD");

    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "git-proj", name: "Git project", path: repo, checks: ["true"] })
      .expect(201);

    const start = await app.get(PipelineRunnerService).start("release", undefined, "git-proj");
    const { pipelineRunId, workspace } = start as {
      pipelineRunId: string;
      workspace?: { branch: string; path: string; baseRef: string };
    };
    expect(workspace?.branch).toBe(`zibby/${pipelineRunId}-release`);
    expect(workspace?.baseRef).toBe(mainBefore);
    // The branch + worktree exist; the operator's main HEAD is untouched.
    expect(await git(repo, "branch", "--list", workspace!.branch)).toContain(workspace!.branch);
    expect(await git(repo, "rev-parse", "HEAD")).toBe(mainBefore);

    const final = await until(async () => {
      const res = app.get(PipelineRunnerService).get(pipelineRunId);
      return res.status !== "running" ? res : null;
    });
    expect(final.status).toBe("done");
    expect(final.workspace?.branch).toBe(workspace!.branch);

    // Delete prunes the worktree but keeps the branch.
    await request(app.getHttpServer()).delete(`/api/tasks/runs/${pipelineRunId}`).expect(200);
    expect(await git(repo, "worktree", "list")).not.toContain(workspace!.path);
    expect(await git(repo, "branch", "--list", workspace!.branch)).toContain(workspace!.branch);

    await fs.rm(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it("a retries-parked run survives a restart still parked (and resumable)", async () => {
    const runId = "parking_1780000000002";
    const root = path.join(runsDir, runId);
    await fs.mkdir(root, { recursive: true });
    const failureFile = path.join(root, "b.failure.txt");
    await fs.writeFile(failureFile, 'Phase "b" failed (attempt 1).', "utf8");
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "parking",
        status: "parked",
        parkedReason: "retries",
        parked: { phaseId: "b", attempts: 1, failureFile },
        retries: { b: 0 },
        currentStage: "b",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    );

    const app2 = await boot();
    const res = app2.get(PipelineRunnerService).get(runId);
    expect(res.status).toBe("parked");
    expect(res.parkedReason).toBe("retries");
    await app2.close();
  });

  it("an output-parked run (PR gate) survives a restart still parked", async () => {
    const runId = "output_1780000000003";
    const root = path.join(runsDir, runId);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "delivery",
        status: "parked",
        parkedReason: "output",
        pendingOutput: { index: 0 },
        currentStage: null,
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    );

    // Unlike an approval-parked stage (no live child → reconciled to failed), an
    // output park is durable: the chain already finished, so it stays parked.
    const app2 = await boot();
    const res = app2.get(PipelineRunnerService).get(runId);
    expect(res.status).toBe("parked");
    expect(res.parkedReason).toBe("output");
    expect(res.pendingOutput).toEqual({ index: 0 });
    await app2.close();
  });

  describe("seeded delivery pipeline", () => {
    const DELIVERY_SEED = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../data-test/pipelines/delivery.pipeline.md",
    );

    beforeAll(async () => {
      await fs.copyFile(DELIVERY_SEED, path.join(pipelinesDir, "delivery.pipeline.md"));
    });

    it(
      "runs the chain through verify + the qualify review, finishing done",
      async () => {
        // This pipeline declares no `outputs:`, so a green chain finishes `done` directly
        // (the `pr` sink behaviour is covered by pipeline-runner.outputs.test.ts). A project
        // with a trivially-passing check lets the deterministic `verify` phase go green; the
        // GAP lever makes the qualify `review` return gap once (loop back to Kodér) then pass.
        process.env.PIPELINE_DEMO_GAP_PHASES = "review";
        const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "delivery-proj-"));
        await request(app.getHttpServer())
          .post("/api/projects")
          .send({
            id: "delivery-proj",
            name: "Delivery project",
            path: projectDir,
            checks: ["true"],
          })
          .expect(201);

        const start = await app
          .get(PipelineRunnerService)
          .start("delivery", undefined, "delivery-proj");
        const { pipelineRunId } = start as { pipelineRunId: string };

        // architekt → koder → review (qualify) → verify → dokumentator → pr-autor,
        // green → done (the current seed: verify IS the deterministic Tester; the old
        // n-9 test-automator phase no longer exists).
        const done = await until(async () => {
          const res = app.get(PipelineRunnerService).get(pipelineRunId);
          return res.status === "done" ? res : null;
        });
        expect(done.status).toBe("done");

        // The full handoff chain exists in the run tree (verify produces nothing).
        // Sandboxes are numbered in dispatch order; the gap loop re-ran koder and
        // review, so their LATEST folders are 04/05 (03_review holds the gap attempt).
        for (const [dir, file] of [
          ["01_architekt", "plan.md"],
          ["04_koder", "implementation.md"],
          ["05_review", "review.md"],
          ["07_dokumentator", "docs.md"],
          ["08_pr-autor", "pr-draft.md"],
        ] as const) {
          await fs.access(path.join(done.cwd, dir, file));
        }
        // The qualify review looped once on gap, then passed.
        const reviews = done.stageRuns.filter((s) => s.phaseId === "review");
        expect(reviews.map((s) => s.verdict)).toEqual(["gap", "pass"]);

        await fs.rm(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      },
      1 * 60 * 1000, // 1 minute
    );

    it("a persistently failing review exhausts its retries and parks", async () => {
      // verify passes (trivial project check) so the run reaches review; review then
      // fails on every attempt and exhausts its loop → durable park at review.
      process.env.PIPELINE_DEMO_FAIL_PHASES = "review";
      const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "delivery-proj-park-"));
      await request(app.getHttpServer())
        .post("/api/projects")
        .send({
          id: "delivery-proj-park",
          name: "Delivery park",
          path: projectDir,
          checks: ["true"],
        })
        .expect(201);

      const start = await app
        .get(PipelineRunnerService)
        .start("delivery", undefined, "delivery-proj-park");
      const { pipelineRunId } = start as { pipelineRunId: string };

      const parked = await until(async () => {
        const res = app.get(PipelineRunnerService).get(pipelineRunId);
        return res.status === "parked" ? res : null;
      });
      expect(parked.parkedReason).toBe("retries");
      expect(parked.parked).toMatchObject({ phaseId: "review", attempts: 4 });

      await fs.rm(projectDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }, 15_000);
  });

  it("reconciles a pipeline run left 'running' at restart to 'failed'", async () => {
    const runId = "ghost_1780000000000";
    const root = path.join(runsDir, runId);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "release",
        status: "running",
        currentStage: "a",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    );

    const app2 = await boot();
    const res = app2.get(PipelineRunnerService).get(runId);
    expect(res.status).toBe("failed");
    expect(res.currentStage).toBeNull();
    await app2.close();
  });
});

describe("Pipeline stage gates (claude mode, e2e)", () => {
  let app: INestApplication;
  let dirs: string[];

  /** An INTENT the gated agent's `ask` rule matches. */
  const DELETE_INTENT = JSON.stringify({ action: "delete" });

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fresh = moduleRef.createNestApplication();
    await fresh.init();
    return fresh;
  }

  beforeAll(async () => {
    const make = (label: string) => fs.mkdtemp(path.join(os.tmpdir(), `pipe-gate-${label}-`));
    const [pipelinesDir, runsDir, agentsDir, agentRunsDir, approvalsDir, policyDir] =
      await Promise.all([make("p"), make("r"), make("a"), make("ar"), make("appr"), make("pol")]);
    dirs = [pipelinesDir, runsDir, agentsDir, agentRunsDir, approvalsDir, policyDir];
    process.env.PIPELINES_DIR = pipelinesDir;
    process.env.PIPELINE_RUNS_DIR = runsDir;
    process.env.AGENTS_DIR = agentsDir;
    process.env.AGENT_RUNS_DIR = agentRunsDir;
    process.env.APPROVALS_DIR = approvalsDir;
    process.env.POLICY_DIR = policyDir;
    // Exercise the production claude stage branch with the token-free stub; its
    // intent-request.json is the real Variant B trigger the core watches for.
    process.env.AGENT_RUNNER_MODE = "claude";
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "4";
    process.env.FAKE_CLAUDE_DELAY_MS = "40";
    process.env.FAKE_CLAUDE_INTENT = DELETE_INTENT;
    app = await boot();

    // The phase agent: deletes pause for a human; everything else is free.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({
        id: "gated-writer",
        name: "Gated writer",
        instructions: "writes, deletes behind the gate",
        risk: "high",
        gates: [
          {
            match: [{ type: "action", action: "delete" }],
            decision: "ask",
            resolve: { type: "human" },
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "gated",
        phases: [
          {
            id: "write",
            agent: "gated-writer",
            consumes: "task.md",
            produces: "out.md",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        instructions: "gated pipeline",
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const d of dirs)
      await fs.rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    for (const k of [
      "PIPELINES_DIR",
      "PIPELINE_RUNS_DIR",
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "APPROVALS_DIR",
      "POLICY_DIR",
      "AGENT_RUNNER_MODE",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
      "FAKE_CLAUDE_INTENT",
    ]) {
      delete process.env[k];
    }
  });

  const runStatus = async (pipelineRunId: string) =>
    app.get(PipelineRunnerService).get(pipelineRunId) as {
      status: string;
      stageRuns: { status: string }[];
    };

  const pendingStageApproval = async (pipelineRunId: string) => {
    const res = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200);
    return res.body.find(
      (a: { runId: string; kind: string }) =>
        a.kind === "pipeline-stage" && a.runId.startsWith(`${pipelineRunId}.`),
    ) as { id: string; runId: string } | undefined;
  };

  it("parks on a gated stage intent, then approve releases the SAME child to done", async () => {
    const start = await app.get(PipelineRunnerService).start("gated", undefined, undefined);
    const { pipelineRunId } = start as { pipelineRunId: string };

    // The stage announces the delete → aggregate parks + a stage approval appears.
    await until(async () => ((await runStatus(pipelineRunId)).status === "parked" ? true : null));
    const approval = await until(() => pendingStageApproval(pipelineRunId));

    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/approve`).expect(200);

    // The blocked child proceeds (no respawn) and the run finishes.
    const final = await until(async () => {
      const run = await runStatus(pipelineRunId);
      return run.status !== "running" && run.status !== "parked" ? run : null;
    });
    expect(final.status).toBe("done");
    expect(final.stageRuns.map((s) => s.status)).toEqual(["done"]);
  });

  it("reject aborts the gated stage and fails the run", async () => {
    const start = await app.get(PipelineRunnerService).start("gated", undefined, undefined);
    const { pipelineRunId } = start as { pipelineRunId: string };

    await until(async () => ((await runStatus(pipelineRunId)).status === "parked" ? true : null));
    const approval = await until(() => pendingStageApproval(pipelineRunId));

    await request(app.getHttpServer()).post(`/api/approvals/${approval.id}/reject`).expect(200);

    const final = await until(async () => {
      const run = await runStatus(pipelineRunId);
      return run.status !== "running" && run.status !== "parked" ? run : null;
    });
    expect(final.status).toBe("failed");
    expect(final.stageRuns.map((s) => s.status)).toEqual(["interrupted"]);
  });

  it("reconciles a run left 'parked' at restart to 'failed' (its child died with the API)", async () => {
    const runId = "gated_1780000000001";
    const root = path.join(process.env.PIPELINE_RUNS_DIR as string, runId);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: runId,
        pipelineId: "gated",
        status: "parked",
        currentStage: "write",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    );

    const app2 = await boot();
    const res = app2.get(PipelineRunnerService).get(runId);
    expect(res.status).toBe("failed");
    expect(res.currentStage).toBeNull();
    await app2.close();
  });
});

describe("PR gate on a git project (claude mode, e2e)", () => {
  const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/bin");
  let app: INestApplication;
  let dirs: string[];
  let repo: string;
  let bare: string;
  let ghLog: string;

  async function boot(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const fresh = moduleRef.createNestApplication();
    await fresh.init();
    return fresh;
  }

  const exec = promisify(execFile);
  const git = async (cwd: string, ...args: string[]) =>
    (await exec("git", args, { cwd })).stdout.trim();

  beforeAll(async () => {
    const make = (l: string) => fs.mkdtemp(path.join(os.tmpdir(), `prgate-${l}-`));
    const [p, r, a, ar, appr, pol, proj] = await Promise.all([
      make("p"),
      make("r"),
      make("a"),
      make("ar"),
      make("appr"),
      make("pol"),
      make("proj"),
    ]);
    dirs = [p, r, a, ar, appr, pol, proj];
    repo = await make("repo");
    bare = await make("bare");
    ghLog = path.join(await make("gh"), "gh-invocations.json");

    // A git fixture project with a bare `origin` so `git push` succeeds locally.
    await git(repo, "init", "-b", "main");
    await git(repo, "config", "user.email", "t@zibby.local");
    await git(repo, "config", "user.name", "T");
    await fs.writeFile(path.join(repo, "README.md"), "# fixture\n", "utf8");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-m", "initial");
    await exec("git", ["init", "--bare", bare]);
    await git(repo, "remote", "add", "origin", bare);
    // Push the initial commit so `origin/main` actually exists before the pipeline
    // runs: `createWorktree` fetches `origin` and cuts from `origin/<default>` (only
    // degrading to local HEAD when the fetch itself fails, e.g. offline) — a bare
    // remote with zero refs makes the later `git rev-parse origin/main` fail, which
    // is not the "offline" case the graceful fallback covers. A real registered
    // project's origin always already has its default branch pushed.
    await git(repo, "push", "-u", "origin", "main");

    process.env.PIPELINES_DIR = p;
    process.env.PIPELINE_RUNS_DIR = r;
    process.env.AGENTS_DIR = a;
    process.env.AGENT_RUNS_DIR = ar;
    process.env.APPROVALS_DIR = appr;
    process.env.POLICY_DIR = pol;
    process.env.PROJECTS_DIR = proj;
    process.env.AGENT_RUNNER_MODE = "claude";
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    process.env.FAKE_CLAUDE_STEPS = "4";
    process.env.FAKE_CLAUDE_DELAY_MS = "30";
    // Land a commit on the branch (so the diffstat has content), write the PR draft
    // into the stage sandbox, announce pr.open, and on allow run the gated chain
    // (push to the bare origin + the `gh` shim, which records the invocation).
    process.env.FAKE_CLAUDE_COMMIT = "1";
    process.env.FAKE_CLAUDE_PRODUCE = "pr-draft.md";
    process.env.FAKE_CLAUDE_PRODUCE_BODY = "# Add feature\n\n## Změny\n- feature.txt\n";
    process.env.FAKE_CLAUDE_INTENT = JSON.stringify({ action: "pr.open" });
    process.env.FAKE_CLAUDE_PATH_PREPEND = BIN;
    process.env.GH_INVOCATIONS_FILE = ghLog;
    process.env.FAKE_CLAUDE_EXEC_CMD =
      'git push -u origin "$(git branch --show-current)" && gh pr create --title "Add feature" --body-file pr-draft.md';

    app = await boot();

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "pr-writer", name: "PR writer", instructions: "opens PRs", risk: "medium" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "pr-proj", name: "PR project", path: repo, checks: ["true"] })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "prgate",
        phases: [
          {
            id: "write",
            agent: "pr-writer",
            consumes: "task.md",
            produces: "pr-draft.md",
            model: "sonnet",
            thinking: "medium",
          },
        ],
        instructions: "single PR-gate phase",
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    for (const d of [...dirs, repo, bare, path.dirname(ghLog)]) {
      await fs.rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
    for (const k of [
      "PIPELINES_DIR",
      "PIPELINE_RUNS_DIR",
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "APPROVALS_DIR",
      "POLICY_DIR",
      "PROJECTS_DIR",
      "AGENT_RUNNER_MODE",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
      "FAKE_CLAUDE_COMMIT",
      "FAKE_CLAUDE_PRODUCE",
      "FAKE_CLAUDE_PRODUCE_BODY",
      "FAKE_CLAUDE_INTENT",
      "FAKE_CLAUDE_PATH_PREPEND",
      "GH_INVOCATIONS_FILE",
      "FAKE_CLAUDE_EXEC_CMD",
    ]) {
      delete process.env[k];
    }
  });

  const runStatus = async (id: string) =>
    app.get(PipelineRunnerService).get(id) as { status: string };
  const pendingStageApproval = async (id: string) => {
    const res = await request(app.getHttpServer())
      .get("/api/approvals")
      .query({ status: "pending" })
      .expect(200);
    return res.body.find(
      (a: { runId: string; kind: string }) =>
        a.kind === "pipeline-stage" && a.runId.startsWith(`${id}.`),
    ) as { id: string; action: string } | undefined;
  };
  const ghInvocations = async () => {
    const raw = await fs.readFile(ghLog, "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
  };

  it("runs pr.open autonomously (Tier-2, no gate): executes push + gh, run done", async () => {
    await fs.rm(ghLog, { force: true });
    const start = await app.get(PipelineRunnerService).start("prgate", undefined, "pr-proj");
    const { pipelineRunId } = start as { pipelineRunId: string };

    // pr.open is off the floor → the stage runs the push + gh create WITHOUT holding.
    const final = await until(async () => {
      const s = (await runStatus(pipelineRunId)).status;
      return s !== "running" && s !== "parked" ? s : null;
    });
    expect(final).toBe("done");

    // No stage approval was ever raised for pr.open — nothing waited on a human.
    expect(await pendingStageApproval(pipelineRunId)).toBeUndefined();

    // The exact `gh pr create` invocation landed, and the branch reached origin.
    const calls = await ghInvocations();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      "pr",
      "create",
      "--title",
      "Add feature",
      "--body-file",
      "pr-draft.md",
    ]);
    expect(await git(bare, "branch", "--list")).toContain("zibby/");

    // The PR draft is still served by the allowlisted artifact endpoint.
    const draft = await request(app.getHttpServer())
      .get(`/api/tasks/runs/${pipelineRunId}/artifacts/pr-draft.md`)
      .expect(200);
    expect(draft.body.content).toContain("Add feature");
  });

  it("404s an artifact not on the allowlist (no generic file browser)", async () => {
    const start = await app.get(PipelineRunnerService).start("prgate", undefined, "pr-proj");
    const { pipelineRunId } = start as { pipelineRunId: string };
    // The run completes autonomously now (no park) — wait for it to settle.
    await until(async () => {
      const s = (await runStatus(pipelineRunId)).status;
      return s !== "running" && s !== "parked" ? true : null;
    });

    await request(app.getHttpServer())
      .get(`/api/tasks/runs/${pipelineRunId}/artifacts/secrets.env`)
      .expect(404);
    // A traversal attempt is just an off-allowlist name → 404, never escapes.
    await request(app.getHttpServer())
      .get(`/api/tasks/runs/${pipelineRunId}/artifacts/${encodeURIComponent("../../run.json")}`)
      .expect(404);
  });
});
