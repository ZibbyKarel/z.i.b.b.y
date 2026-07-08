import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Pipeline, PipelineRun } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumableRunner } from "../approvals/approvals.service";
import { DuplicateNoteError } from "../memory/vault.service";
import { PipelineRunnerService } from "./pipeline-runner.service";

/**
 * Pipeline-level output sinks (the delivery config that replaced the `pr-autor`
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
  pipeline: Pipeline;
  approvals: {
    register: ReturnType<typeof vi.fn>;
    requestApproval: ReturnType<typeof vi.fn>;
    cancelPendingForRun: ReturnType<typeof vi.fn>;
  };
  workspace: {
    diffstat: ReturnType<typeof vi.fn>;
    openPr: ReturnType<typeof vi.fn>;
    removeWorktree: ReturnType<typeof vi.fn>;
  };
  vault: { createNote: ReturnType<typeof vi.fn>; updateNote: ReturnType<typeof vi.fn> };
  artifacts: { record: ReturnType<typeof vi.fn> };
  registered: Map<string, ResumableRunner>;
}

async function makeService(
  dir: string,
  pipeline: Pipeline,
): Promise<{ service: PipelineRunnerService; d: Doubles }> {
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
  };
  const vault = {
    createNote: vi.fn(async () => ({})),
    updateNote: vi.fn(async () => ({})),
  };
  // N2a: the durable artifact registry — a delivered sink writes one record.
  const artifacts = { record: vi.fn(async () => {}) };
  const service = new PipelineRunnerService(
    dir,
    { get: vi.fn(async () => pipeline) } as never,
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
  );
  (service as unknown as { core: { init: () => void; shutdown: () => void } }).core = {
    init: vi.fn(),
    shutdown: vi.fn(),
  } as never;
  // Registers the pipeline-output (and pipeline-stage) resumable runners.
  await service.onModuleInit();
  return { service, d: { pipeline, approvals, workspace, vault, artifacts, registered } };
}

/** Seed a run aggregate plus the on-disk artifacts its phases "produced". */
async function seedRun(
  service: PipelineRunnerService,
  dir: string,
  pipeline: Pipeline,
  artifacts: Record<string, { phaseId: string; file: string; content: string }>,
  workspacePath?: string,
): Promise<PipelineRun> {
  const cwd = path.join(dir, RUN_ID);
  for (const { phaseId, file, content } of Object.values(artifacts)) {
    const abs = path.join(cwd, phaseId, file);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }
  const run: PipelineRun = {
    pipelineRunId: RUN_ID,
    pipelineId: pipeline.id,
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
  (service as unknown as { runs: Map<string, PipelineRun> }).runs.set(RUN_ID, run);
  return run;
}

function runOutputs(
  service: PipelineRunnerService,
  run: PipelineRun,
  pipeline: Pipeline,
): Promise<void> {
  return (
    service as unknown as {
      runOutputs(r: PipelineRun, p: Pipeline, from: number, ids: string[]): Promise<void>;
    }
  ).runOutputs(
    run,
    pipeline,
    0,
    pipeline.phases.map((p) => p.id),
  );
}

const docPhase = {
  id: "dok",
  type: "agent" as const,
  agent: "documentation-engineer",
  consumes: "review.md",
  produces: "docs.md",
  model: "sonnet" as const,
  thinking: "low" as const,
};

describe("PipelineRunnerService — output sinks", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-outputs-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("file sink → vault: writes the produced artifact as a knowledge note, run done", async () => {
    const pipeline: Pipeline = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-2026-06-16" }],
      instructions: "x",
    };
    const { service, d } = await makeService(dir, pipeline);
    const run = await seedRun(service, dir, pipeline, {
      a: { phaseId: "dok", file: "docs.md", content: "# Audit\n\nFindings." },
    });

    await runOutputs(service, run, pipeline);

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
        producedBy: expect.objectContaining({ runRef: RUN_ID, pipelineId: "audit" }),
      }),
    );
  });

  it("file sink → vault: a FAILED delivery records no artifact", async () => {
    const pipeline: Pipeline = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
      instructions: "x",
    };
    const { service, d } = await makeService(dir, pipeline);
    d.vault.createNote.mockRejectedValueOnce(new Error("vault down"));
    const run = await seedRun(service, dir, pipeline, {
      a: { phaseId: "dok", file: "docs.md", content: "body" },
    });

    await runOutputs(service, run, pipeline);

    // The delivery failed soft (run still finishes) — no provenance is forged.
    expect(run.status).toBe("done");
    expect(d.artifacts.record).not.toHaveBeenCalled();
  });

  it("file sink → vault: replaces an existing note instead of failing on duplicate", async () => {
    const pipeline: Pipeline = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
      instructions: "x",
    };
    const { service, d } = await makeService(dir, pipeline);
    d.vault.createNote.mockRejectedValueOnce(new DuplicateNoteError("audit-note"));
    const run = await seedRun(service, dir, pipeline, {
      a: { phaseId: "dok", file: "docs.md", content: "fresh" },
    });

    await runOutputs(service, run, pipeline);

    expect(d.vault.updateNote).toHaveBeenCalledWith("audit-note", { body: "fresh" });
    expect(run.status).toBe("done");
  });

  it("file sink → project: writes into the worktree under the declared path, run done", async () => {
    const pipeline: Pipeline = {
      id: "report",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "project", to: "reports/out.md" }],
      instructions: "x",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service } = await makeService(dir, pipeline);
    const run = await seedRun(
      service,
      dir,
      pipeline,
      {
        a: { phaseId: "dok", file: "docs.md", content: "report body" },
      },
      wt,
    );

    await runOutputs(service, run, pipeline);

    expect(await fs.readFile(path.join(wt, "reports/out.md"), "utf8")).toBe("report body");
    expect(run.status).toBe("done");
  });

  it("file sink → project: records a project-file artifact with the delivered path", async () => {
    const pipeline: Pipeline = {
      id: "report",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "project", to: "reports/out.md" }],
      instructions: "x",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, pipeline);
    const run = await seedRun(
      service,
      dir,
      pipeline,
      { a: { phaseId: "dok", file: "docs.md", content: "report body" } },
      wt,
    );

    await runOutputs(service, run, pipeline);

    expect(d.artifacts.record).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `${RUN_ID}_project-file_docs-md`,
        kind: "project-file",
        locator: "reports/out.md",
        from: "docs.md",
        producedBy: expect.objectContaining({ runRef: RUN_ID, pipelineId: "report" }),
      }),
    );
  });

  it("pr sink: opens the PR immediately (no gate), records url + line totals, run done", async () => {
    const pipeline: Pipeline = {
      id: "delivery",
      phases: [docPhase],
      outputs: [{ type: "pr", from: "docs.md" }],
      instructions: "x",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, pipeline);
    const run = await seedRun(
      service,
      dir,
      pipeline,
      {
        a: { phaseId: "dok", file: "docs.md", content: "# Add feature X\n\nDetails." },
      },
      wt,
    );

    await runOutputs(service, run, pipeline);

    expect(run.status).toBe("done");
    expect(run.parkedReason).toBeUndefined();
    expect(d.approvals.requestApproval).not.toHaveBeenCalled(); // no gate anymore
    expect(d.workspace.openPr).toHaveBeenCalledWith({
      cwd: wt,
      title: "Add feature X",
      bodyFile: path.join(run.cwd, "pr-draft.md"),
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
        producedBy: expect.objectContaining({ runRef: RUN_ID, pipelineId: "delivery" }),
      }),
    );
  });

  it("P1-T3 (Fáze 4): output/ is the canonical source — file sink reads through the output/ symlink", async () => {
    const pipeline: Pipeline = {
      id: "audit",
      phases: [docPhase],
      outputs: [{ type: "file", from: "docs.md", dest: "vault", to: "audit-note" }],
      instructions: "x",
    };
    const { service, d } = await makeService(dir, pipeline);
    const run = await seedRun(service, dir, pipeline, {
      a: { phaseId: "dok", file: "docs.md", content: "canonical body" },
    });
    // start() creates this unconditionally; seedRun bypasses start() so it's added here.
    await fs.mkdir(path.join(run.cwd, "output"), { recursive: true });

    await runOutputs(service, run, pipeline);

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
    const pipeline: Pipeline = {
      id: "delivery",
      phases: [docPhase],
      outputs: [{ type: "pr", from: "docs.md" }],
      instructions: "x",
    };
    const wt = path.join(dir, "worktree");
    await fs.mkdir(wt, { recursive: true });
    const { service, d } = await makeService(dir, pipeline);
    const run = await seedRun(
      service,
      dir,
      pipeline,
      { a: { phaseId: "dok", file: "docs.md", content: "# Add feature X\n\nDetails." } },
      wt,
    );
    await fs.mkdir(path.join(run.cwd, "output"), { recursive: true });

    await runOutputs(service, run, pipeline); // opens the PR immediately

    const linkPath = path.join(run.cwd, "output", "docs.md");
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(run.cwd, "pr-draft.md"), "utf8")).toBe(
      "# Add feature X\n\nDetails.",
    );
    expect(d.workspace.openPr).toHaveBeenCalledWith({
      cwd: wt,
      title: "Add feature X",
      bodyFile: path.join(run.cwd, "pr-draft.md"),
    });
    expect(run.status).toBe("done");
  });
});
