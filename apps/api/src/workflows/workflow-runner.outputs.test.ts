import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Workflow, WorkflowRun } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumableRunner } from "../approvals/approvals.service";
import { DuplicateNoteError } from "../memory/vault.service";
import { WorkingAgentsFuse } from "../employees/working-agents-fuse";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { WorkflowRunnerService, unmetRequirement } from "./workflow-runner.service";

/**
 * Workflow-level output sinks (the delivery config that replaced the `pr-autor`
 * agent): `file` sinks write to the project or the vault immediately, and a `pr` sink
 * opens the PR immediately too (Tier-2 — act-then-report, no gate), recording its url +
 * branch line totals on the run.
 */

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};
const fakeTrace = { getTraceId: () => undefined, run: (_c: unknown, fn: () => unknown) => fn() };

const RUN_ID = "delivery_900";

interface Doubles {
  workflow: Workflow;
  approvals: {
    register: ReturnType<typeof vi.fn>;
    requestApproval: ReturnType<typeof vi.fn>;
    cancelPendingForRun: ReturnType<typeof vi.fn>;
  };
  workspace: {
    diffstat: ReturnType<typeof vi.fn>;
    openPr: ReturnType<typeof vi.fn>;
    removeWorktree: ReturnType<typeof vi.fn>;
    headSha: ReturnType<typeof vi.fn>;
  };
  vault: { createNote: ReturnType<typeof vi.fn>; updateNote: ReturnType<typeof vi.fn> };
  artifacts: { record: ReturnType<typeof vi.fn> };
  signalBus: { emit: ReturnType<typeof vi.fn> };
  registered: Map<string, ResumableRunner>;
}

async function makeService(
  dir: string,
  workflow: Workflow,
): Promise<{ service: WorkflowRunnerService; d: Doubles }> {
  const registered = new Map<string, ResumableRunner>();
  const approvals = {
    register: vi.fn((kind: string, runner: ResumableRunner) => registered.set(kind, runner)),
    requestApproval: vi.fn(async () => ({})),
    cancelPendingForRun: vi.fn(async () => {}),
  };
  const workspace = {
    isGitRepo: vi.fn(async () => true),
    createWorktree: vi.fn(),
    removeWorktree: vi.fn(async () => {}),
    diffstat: vi.fn(async () => "DIFFSTAT"),
    diffStats: vi.fn(async () => ({ additions: 7, deletions: 2 })),
    openPr: vi.fn(async () => ({ url: "https://example.test/pr/1" })),
    headSha: vi.fn(async () => "abc"),
  };
  const vault = {
    createNote: vi.fn(async () => ({})),
    updateNote: vi.fn(async () => ({})),
  };
  // N2a: the durable artifact registry — a delivered sink writes one record.
  const artifacts = { record: vi.fn(async () => {}) };
  // Fake SignalBusService — a Research-owned workflow's delivery also emits a
  // research-artifact signal (recordArtifact).
  const signalBus = { emit: vi.fn(async () => ({ runRefs: [] })) };
  const service = new WorkflowRunnerService(
    dir,
    { get: vi.fn(async () => workflow) } as never,
    { get: vi.fn() } as never,
    { buildClaudeCommand: vi.fn() } as never,
    { materialize: vi.fn(async () => {}) } as never,
    { assertAvailable: vi.fn(), probe: vi.fn() } as never,
    approvals as never,
    { rulesForAgent: vi.fn(async () => []), evaluate: vi.fn() } as never,
    { get: vi.fn(async () => null), list: vi.fn(async () => []) } as never,
    workspace as never,
    { compose: vi.fn(async () => "") } as never,
    vault as never,
    {
      noteLimitHit: vi.fn(),
      resolveResumeAt: vi.fn(async () => Date.now() + 1_000),
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
    } as never,
    fakeLogger as never,
    fakeTrace as never,
    { read: vi.fn(async () => null), has: vi.fn(async () => false) } as never,
    // Activity log double (Phase 45).
    { record: vi.fn(async () => {}) } as never,
    artifacts as never,
    // ProjectLocalService double (Phase 77): unused here since `projects.get`
    // always resolves null, so the git-worktree/clone-if-missing branch never runs.
    {} as never,
    // EmployeeAllocator double (D-015): this fixture workflow carries no
    // `department`, so `drive()` never calls `acquire` — present only to keep
    // the positional constructor aligned.
    { acquire: vi.fn(), release: vi.fn(), isBusy: vi.fn(), busy: vi.fn(() => new Map()) } as never,
    // Machine fuse (staffing-driven capacity): a real one, effectively uncapped.
    new WorkingAgentsFuse(fakeSystemConfigStore()),
    signalBus as never,
  );
  (service as unknown as { core: { init: () => void; shutdown: () => void } }).core = {
    init: vi.fn(),
    shutdown: vi.fn(),
  } as never;
  // Registers the workflow-output (and workflow-stage) resumable runners.
  await service.onModuleInit();
  return {
    service,
    d: { workflow, approvals, workspace, vault, artifacts, signalBus, registered },
  };
}

/** Seed a run aggregate plus the on-disk artifacts its phases "produced". */
async function seedRun(
  service: WorkflowRunnerService,
  dir: string,
  workflow: Workflow,
  artifacts: Record<string, { phaseId: string; file: string; content: string }>,
  workspacePath?: string,
): Promise<WorkflowRun> {
  const cwd = path.join(dir, RUN_ID);
  for (const { phaseId, file, content } of Object.values(artifacts)) {
    const abs = path.join(cwd, phaseId, file);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }
  const run: WorkflowRun = {
    workflowRunId: RUN_ID,
    workflowId: workflow.id,
    status: "running",
    currentStage: null,
    stageRuns: [],
    startedAt: new Date().toISOString(),
    cwd,
    ...(workspacePath
      ? {
          workspace: { branch: "zibby/x", path: workspacePath, baseRef: "HEAD" },
          projectPath: workspacePath,
        }
      : {}),
  };
  (service as unknown as { runs: Map<string, WorkflowRun> }).runs.set(RUN_ID, run);
  return run;
}

function runOutputs(
  service: WorkflowRunnerService,
  run: WorkflowRun,
  workflow: Workflow,
): Promise<void> {
  return (
    service as unknown as {
      runOutputs(r: WorkflowRun, p: Workflow, from: number, ids: string[]): Promise<void>;
    }
  ).runOutputs(
    run,
    workflow,
    0,
    workflow.phases.map((p) => p.id),
  );
}

/**
 * NS2 F9 note for every `Workflow` literal below: `complexity` is schema-DEFAULTED,
 * so it is non-optional on a parsed entity and each fixture states it explicitly
 * (`"standard"` — the same rung the default would give). Output sinks don't read
 * the rung; it is here purely because these literals are typed `Workflow`.
 */
const docPhase = {
  id: "dok",
  type: "agent" as const,
  agent: "documentation-engineer",
  consumes: "review.md",
  produces: "docs.md",
  model: "sonnet" as const,
  thinking: "low" as const,
};

describe("WorkflowRunnerService — output sinks", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-outputs-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("file sink → vault: writes the produced artifact as a knowledge note, run done", async () => {
    const workflow: Workflow = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-2026-06-16" }],
      instructions: "x",
      complexity: "standard",
    };
    const { service, d } = await makeService(dir, workflow);
    const run = await seedRun(service, dir, workflow, {
      a: { phaseId: "dok", file: "docs.md", content: "# Audit\n\nFindings." },
    });

    await runOutputs(service, run, workflow);

    expect(d.vault.createNote).toHaveBeenCalledWith({
      id: "audit-2026-06-16",
      tier: "knowledge",
      body: "# Audit\n\nFindings.",
    });
    expect(run.status).toBe("done");
    // N2a: the delivery left a durable provenance record in the registry.
    expect(d.artifacts.record).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${RUN_ID}_vault-note_docs-md`,
        kind: "vault-note",
        locator: "audit-2026-06-16",
        from: "docs.md",
        producedBy: expect.objectContaining({ runRef: RUN_ID, workflowId: "audit" }),
      }),
    );
    // A3: a non-Research workflow (no department) never emits a signal.
    expect(d.signalBus.emit).not.toHaveBeenCalled();
  });

  it("file sink → vault: a FAILED delivery records no artifact", async () => {
    const workflow: Workflow = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
      instructions: "x",
      complexity: "standard",
    };
    const { service, d } = await makeService(dir, workflow);
    d.vault.createNote.mockRejectedValueOnce(new Error("vault down"));
    const run = await seedRun(service, dir, workflow, {
      a: { phaseId: "dok", file: "docs.md", content: "body" },
    });

    await runOutputs(service, run, workflow);

    // The delivery failed soft (run still finishes) — no provenance is forged.
    expect(run.status).toBe("done");
    expect(d.artifacts.record).not.toHaveBeenCalled();
  });

  it("file sink → vault: replaces an existing note instead of failing on duplicate", async () => {
    const workflow: Workflow = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
      instructions: "x",
      complexity: "standard",
    };
    const { service, d } = await makeService(dir, workflow);
    d.vault.createNote.mockRejectedValueOnce(new DuplicateNoteError("audit-note"));
    const run = await seedRun(service, dir, workflow, {
      a: { phaseId: "dok", file: "docs.md", content: "fresh" },
    });

    await runOutputs(service, run, workflow);

    expect(d.vault.updateNote).toHaveBeenCalledWith("audit-note", { body: "fresh" });
    expect(run.status).toBe("done");
  });

  it("file sink → project: writes into the worktree under the declared path, run done", async () => {
    const workflow: Workflow = {
      id: "report",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "project", to: "reports/out.md" }],
      instructions: "x",
      complexity: "standard",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service } = await makeService(dir, workflow);
    const run = await seedRun(
      service,
      dir,
      workflow,
      {
        a: { phaseId: "dok", file: "docs.md", content: "report body" },
      },
      wt,
    );

    await runOutputs(service, run, workflow);

    expect(await fs.readFile(path.join(wt, "reports/out.md"), "utf8")).toBe("report body");
    expect(run.status).toBe("done");
  });

  it("file sink → project: records a project-file artifact with the delivered path", async () => {
    const workflow: Workflow = {
      id: "report",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "project", to: "reports/out.md" }],
      instructions: "x",
      complexity: "standard",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, workflow);
    const run = await seedRun(
      service,
      dir,
      workflow,
      { a: { phaseId: "dok", file: "docs.md", content: "report body" } },
      wt,
    );

    await runOutputs(service, run, workflow);

    expect(d.artifacts.record).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${RUN_ID}_project-file_docs-md`,
        kind: "project-file",
        locator: "reports/out.md",
        from: "docs.md",
        producedBy: expect.objectContaining({ runRef: RUN_ID, workflowId: "report" }),
      }),
    );
  });

  it("pr sink: opens the PR immediately (no gate), records url + line totals, run done", async () => {
    const workflow: Workflow = {
      id: "delivery",
      phases: [docPhase],
      outputs: [{ type: "pr", from: "docs.md" }],
      instructions: "x",
      complexity: "standard",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, workflow);
    const run = await seedRun(
      service,
      dir,
      workflow,
      {
        a: { phaseId: "dok", file: "docs.md", content: "# Add feature X\n\nDetails." },
      },
      wt,
    );

    await runOutputs(service, run, workflow);

    expect(run.status).toBe("done");
    expect(run.parkedReason).toBeUndefined();
    expect(d.approvals.requestApproval).not.toHaveBeenCalled(); // no gate anymore
    expect(d.workspace.openPr).toHaveBeenCalledWith({
      cwd: wt,
      title: "Add feature X",
      bodyFile: path.join(run.cwd, "pr-draft.md"),
      draft: false, // NS2 F0b — unregistered/no prOpenMode project → ready (default)
    });
    // The url + branch line totals are recorded on the run for the detail's PR surface.
    expect(run.prOutput).toEqual({
      url: "https://example.test/pr/1",
      additions: 7,
      deletions: 2,
    });
    // N2a: the opened PR left a durable provenance record (locator = PR URL).
    expect(d.artifacts.record).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${RUN_ID}_pr_docs-md`,
        kind: "pr",
        locator: "https://example.test/pr/1",
        from: "docs.md",
        producedBy: expect.objectContaining({ runRef: RUN_ID, workflowId: "delivery" }),
      }),
    );
  });

  it("P1-T3 (Fáze 4): output/ is the canonical source — file sink reads through the output/ symlink", async () => {
    const workflow: Workflow = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
      instructions: "x",
      complexity: "standard",
    };
    const { service, d } = await makeService(dir, workflow);
    const run = await seedRun(service, dir, workflow, {
      a: { phaseId: "dok", file: "docs.md", content: "canonical body" },
    });
    // start() creates this unconditionally; seedRun bypasses start() so it's added here.
    await fs.mkdir(path.join(run.cwd, "output"), { recursive: true });

    await runOutputs(service, run, workflow);

    const linkPath = path.join(run.cwd, "output", "docs.md");
    const lst = await fs.lstat(linkPath);
    expect(lst.isSymbolicLink()).toBe(true);
    expect(path.isAbsolute(await fs.readlink(linkPath))).toBe(false);
    expect(await fs.readFile(linkPath, "utf8")).toBe("canonical body");
    expect(d.vault.createNote).toHaveBeenCalledWith({
      id: "audit-note",
      tier: "knowledge",
      body: "canonical body",
    });
    expect(run.status).toBe("done");
  });

  it("P1-T3 (Fáze 4): output/ is the canonical source — pr sink opens through it, run done", async () => {
    const workflow: Workflow = {
      id: "delivery",
      phases: [docPhase],
      outputs: [{ type: "pr", from: "docs.md" }],
      instructions: "x",
      complexity: "standard",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, workflow);
    const run = await seedRun(
      service,
      dir,
      workflow,
      { a: { phaseId: "dok", file: "docs.md", content: "# Add feature X\n\nDetails." } },
      wt,
    );
    await fs.mkdir(path.join(run.cwd, "output"), { recursive: true });

    await runOutputs(service, run, workflow); // opens the PR immediately

    const linkPath = path.join(run.cwd, "output", "docs.md");
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(run.cwd, "pr-draft.md"), "utf8")).toBe(
      "# Add feature X\n\nDetails.",
    );
    expect(d.workspace.openPr).toHaveBeenCalledWith({
      cwd: wt,
      title: "Add feature X",
      bodyFile: path.join(run.cwd, "pr-draft.md"),
      draft: false, // NS2 F0b — unregistered/no prOpenMode project → ready (default)
    });
    expect(run.status).toBe("done");
  });

  it("pr sink: threads the matched project's prOpenMode: draft into openPr (NS2 F0b)", async () => {
    const workflow: Workflow = {
      id: "delivery",
      phases: [docPhase],
      outputs: [{ type: "pr", from: "docs.md" }],
      instructions: "x",
      complexity: "standard",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, workflow);
    // Override the projects double's list() so `projectForRun` matches `run.projectPath`
    // (= wt below) to a project with prOpenMode: "draft".
    (service as unknown as { projects: { list: ReturnType<typeof vi.fn> } }).projects.list = vi.fn(
      async () => [{ id: "p1", name: "Repo", path: wt, prOpenMode: "draft" }],
    );
    const run = await seedRun(
      service,
      dir,
      workflow,
      { a: { phaseId: "dok", file: "docs.md", content: "# Add feature X\n\nDetails." } },
      wt,
    );

    await runOutputs(service, run, workflow);

    expect(d.workspace.openPr).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: wt, draft: true }),
    );
  });

  describe("A3 — Research-owned workflows hand off a research-artifact signal", () => {
    it("a Research-owned workflow's delivered artifact emits a research-artifact signal", async () => {
      const workflow: Workflow = {
        id: "research-brief",
        department: "rnd",
        phases: [docPhase],
        outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "research-brief-2026" }],
        instructions: "x",
        complexity: "standard",
      };
      const { service, d } = await makeService(dir, workflow);
      const run = await seedRun(service, dir, workflow, {
        a: { phaseId: "dok", file: "docs.md", content: "# Research\n\nFindings." },
      });

      await runOutputs(service, run, workflow);

      expect(d.signalBus.emit).toHaveBeenCalledTimes(1);
      expect(d.signalBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "rnd",
          kind: "research-artifact",
          fingerprint: `${RUN_ID}_vault-note_docs-md`,
        }),
      );
    });

    it("TODO 13: a QA-owned workflow's delivered artifact emits a qa-findings signal", async () => {
      const workflow: Workflow = {
        id: "web-qa",
        department: "qa",
        phases: [docPhase],
        outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "web-qa-findings" }],
        instructions: "x",
        complexity: "standard",
      };
      const { service, d } = await makeService(dir, workflow);
      const run = await seedRun(service, dir, workflow, {
        a: { phaseId: "dok", file: "docs.md", content: "# Web QA findings\n\n## F1" },
      });

      await runOutputs(service, run, workflow);

      expect(d.signalBus.emit).toHaveBeenCalledTimes(1);
      expect(d.signalBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "qa",
          kind: "qa-findings",
          fingerprint: `${RUN_ID}_vault-note_docs-md`,
        }),
      );
    });

    it("TODO 13: a throwing signal emit never fails the already-green QA delivery", async () => {
      const workflow: Workflow = {
        id: "web-qa",
        department: "qa",
        phases: [docPhase],
        outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "web-qa-findings" }],
        instructions: "x",
        complexity: "standard",
      };
      const { service, d } = await makeService(dir, workflow);
      d.signalBus.emit.mockRejectedValueOnce(new Error("bus down"));
      const run = await seedRun(service, dir, workflow, {
        a: { phaseId: "dok", file: "docs.md", content: "body" },
      });

      await runOutputs(service, run, workflow);

      expect(d.vault.createNote).toHaveBeenCalled();
      expect(run.status).toBe("done");
    });

    it("a non-Research workflow (department unset) never emits a signal", async () => {
      const workflow: Workflow = {
        id: "audit",
        phases: [docPhase],
        outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
        instructions: "x",
        complexity: "standard",
      };
      const { service, d } = await makeService(dir, workflow);
      const run = await seedRun(service, dir, workflow, {
        a: { phaseId: "dok", file: "docs.md", content: "body" },
      });

      await runOutputs(service, run, workflow);

      expect(d.signalBus.emit).not.toHaveBeenCalled();
    });

    it("a non-Research department (e.g. dev) never emits a signal either", async () => {
      const workflow: Workflow = {
        id: "dev-build",
        department: "dev",
        phases: [docPhase],
        outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "dev-note" }],
        instructions: "x",
        complexity: "standard",
      };
      const { service, d } = await makeService(dir, workflow);
      const run = await seedRun(service, dir, workflow, {
        a: { phaseId: "dok", file: "docs.md", content: "body" },
      });

      await runOutputs(service, run, workflow);

      expect(d.signalBus.emit).not.toHaveBeenCalled();
    });
  });

  describe("dev → rel PR gate (verify evidence)", () => {
    const devWorkflow = (department?: "dev"): Workflow => ({
      id: "delivery",
      phases: [docPhase],
      outputs: [{ type: "pr", from: "docs.md" }],
      instructions: "x",
      complexity: "standard",
      ...(department ? { department } : {}),
    });
    const evidence = (exitCode: number | null, sha?: string): WorkflowRun["verifyEvidence"] => ({
      phaseId: "verify",
      stageRunId: "s1",
      commands: ["pnpm test"],
      exitCode,
      ...(sha ? { sha } : {}),
      cleanCheckout: true,
      at: new Date().toISOString(),
    });
    async function setup(workflow: Workflow, ev?: WorkflowRun["verifyEvidence"]) {
      const wt = path.join(dir, "worktree");
      await fs.mkdir(wt, { recursive: true });
      const { service, d } = await makeService(dir, workflow);
      const run = await seedRun(
        service,
        dir,
        workflow,
        { a: { phaseId: "dok", file: "docs.md", content: "# Feature\n" } },
        wt,
      );
      if (ev) run.verifyEvidence = ev;
      await runOutputs(service, run, workflow);
      return { run, d };
    }

    it("blocks a dev PR with no verify evidence — run failed, reason recorded", async () => {
      const { run, d } = await setup(devWorkflow("dev"));
      expect(d.workspace.openPr).not.toHaveBeenCalled();
      expect(run.status).toBe("failed");
      expect(run.prBlockedReason).toBe("no verify evidence");
    });

    it("opens the dev PR on green evidence for the current HEAD — run done", async () => {
      const { run, d } = await setup(devWorkflow("dev"), evidence(0, "abc"));
      expect(d.workspace.openPr).toHaveBeenCalled();
      expect(run.status).toBe("done");
      expect(run.prBlockedReason).toBeUndefined();
    });

    it("blocks when HEAD moved past the verified sha", async () => {
      const { run, d } = await setup(devWorkflow("dev"), evidence(0, "old"));
      expect(d.workspace.openPr).not.toHaveBeenCalled();
      expect(run.status).toBe("failed");
      expect(run.prBlockedReason).toBe("HEAD abc is not the verified old");
    });

    it("blocks when the evidence carries no sha", async () => {
      const { run, d } = await setup(devWorkflow("dev"), evidence(0));
      expect(d.workspace.openPr).not.toHaveBeenCalled();
      expect(run.prBlockedReason).toBe("verify evidence has no sha");
    });

    it("blocks when HEAD cannot be read", async () => {
      const wt = path.join(dir, "worktree");
      await fs.mkdir(wt, { recursive: true });
      const workflow = devWorkflow("dev");
      const { service, d } = await makeService(dir, workflow);
      d.workspace.headSha.mockRejectedValue(new Error("boom"));
      const run = await seedRun(
        service,
        dir,
        workflow,
        { a: { phaseId: "dok", file: "docs.md", content: "# Feature\n" } },
        wt,
      );
      run.verifyEvidence = evidence(0, "abc");
      await runOutputs(service, run, workflow);
      expect(d.workspace.openPr).not.toHaveBeenCalled();
      expect(run.prBlockedReason).toBe("HEAD unreadable");
    });

    it("blocks when verify exited non-zero", async () => {
      const { run, d } = await setup(devWorkflow("dev"), evidence(1, "abc"));
      expect(d.workspace.openPr).not.toHaveBeenCalled();
      expect(run.status).toBe("failed");
      expect(run.prBlockedReason).toBe("verify exited 1");
    });

    it("leaves a department-less workflow ungated", async () => {
      const { run, d } = await setup(devWorkflow());
      expect(d.workspace.openPr).toHaveBeenCalled();
      expect(run.status).toBe("done");
    });
  });
});

describe("TODO 13 — requires: web precondition", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-requires-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const webQa: Workflow = {
    id: "web-qa",
    department: "qa",
    requires: ["web"],
    phases: [docPhase],
    outputs: [],
    instructions: "x",
    complexity: "standard",
  };

  it("unmetRequirement: no requires → never blocks, even without a project", () => {
    expect(unmetRequirement({}, null)).toBeNull();
  });

  it("unmetRequirement: requires web → blocks no project and a project without web.url", () => {
    expect(unmetRequirement(webQa, null)).toBe(
      "requires a web project, but the run has no project",
    );
    expect(unmetRequirement(webQa, { id: "api-only" })).toBe(
      'requires a web project, but project "api-only" has no web.url',
    );
  });

  it("unmetRequirement: requires web → passes a project with web.url", () => {
    expect(
      unmetRequirement(webQa, { id: "shop", web: { url: "https://shop.example.com" } }),
    ).toBeNull();
  });

  it("start() without a (resolvable) project ends failed with the reason recorded, no stage", async () => {
    const { service } = await makeService(dir, webQa);

    // "typo-project" does not resolve (the projects double returns null) → no project.
    const run = await service.start("web-qa", undefined, "typo-project");

    expect(run.status).toBe("failed");
    expect(run.currentStage).toBeNull();
    expect(run.failedReason).toBe("requires a web project, but the run has no project");
    expect(run.stageRuns).toEqual([]);
    const onDisk = JSON.parse(
      await fs.readFile(path.join(dir, run.workflowRunId, "run.json"), "utf8"),
    ) as WorkflowRun;
    expect(onDisk).toMatchObject({ status: "failed", failedReason: run.failedReason });
  });
});
