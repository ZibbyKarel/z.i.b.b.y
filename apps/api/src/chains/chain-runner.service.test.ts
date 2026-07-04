import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ArtifactRecord, Chain, PipelineRun } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChainRunnerService } from "./chain-runner.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const CHAIN: Chain = {
  id: "research-then-build",
  steps: [{ pipeline: "nightly-research" }, { pipeline: "build-feature" }],
  instructions: "Research topic X, then build the app from the result.",
};

const vaultArtifact = (runRef: string): ArtifactRecord => ({
  id: `${runRef}_vault-note_report-md`,
  kind: "vault-note",
  locator: "research/topic-x",
  from: "report.md",
  producedBy: { runRef, pipelineId: "nightly-research" },
  createdAt: new Date().toISOString(),
});

interface Doubles {
  chains: { get: ReturnType<typeof vi.fn> };
  pipelineRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  artifacts: { list: ReturnType<typeof vi.fn> };
  vault: { note: ReturnType<typeof vi.fn> };
  projects: { get: ReturnType<typeof vi.fn> };
  activity: { record: ReturnType<typeof vi.fn> };
  /** Fire a pipeline-run transition into the runner's subscription. */
  emit: (run: Partial<PipelineRun> & { pipelineRunId: string; status: string }) => Promise<void>;
}

function makeService(dir: string): { service: ChainRunnerService; d: Doubles } {
  let listener: ((run: PipelineRun) => void) | null = null;
  let seq = 0;
  const d: Doubles = {
    chains: { get: vi.fn(async () => CHAIN) },
    pipelineRunner: {
      start: vi.fn(async (pipelineId: string) => ({ pipelineRunId: `${pipelineId}_${++seq}` })),
      onRunStatus: vi.fn((l: (run: PipelineRun) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      }),
      get: vi.fn(() => {
        throw new Error("not found");
      }),
    },
    artifacts: { list: vi.fn(async () => [] as ArtifactRecord[]) },
    vault: { note: vi.fn(async () => ({ id: "research/topic-x", body: "RESEARCH FINDINGS" })) },
    projects: { get: vi.fn(async () => ({ id: "acme", name: "Acme", path: dir })) },
    activity: { record: vi.fn(async () => {}) },
    emit: async (run) => {
      listener?.(run as PipelineRun);
      // Transitions are serialized on the runner's queue; settle drains it
      // deterministically (no sleep-and-hope under load).
      await service.settle();
    },
  };
  const service = new ChainRunnerService(
    dir,
    d.chains as never,
    d.pipelineRunner as never,
    d.artifacts as never,
    d.vault as never,
    d.projects as never,
    d.activity as never,
    fakeLogger as never,
  );
  return { service, d };
}

describe("ChainRunnerService", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "chain-runner-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("start: step 0 runs with the chain instructions as its input handoff", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");

    expect(run.status).toBe("running");
    expect(run.currentStep).toBe(0);
    expect(run.steps[0]?.status).toBe("running");
    expect(run.steps[1]?.status).toBe("pending");
    // start(pipelineId, taskId, projectRef, matchedTerms, workspace, output, input)
    expect(d.pipelineRunner.start).toHaveBeenCalledWith(
      "nightly-research",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      CHAIN.instructions,
    );
    // The run record is durable on disk (files are the truth).
    const persisted = JSON.parse(
      await fs.readFile(path.join(dir, `${run.chainRunId}.json`), "utf8"),
    );
    expect(persisted.chainId).toBe("research-then-build");
    service.onModuleDestroy();
  });

  it("start records the dispatching taskId on the run (Phase 05)", async () => {
    const { service } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build", "task-42");
    expect(run.taskId).toBe("task-42");
    const persisted = JSON.parse(
      await fs.readFile(path.join(dir, `${run.chainRunId}.json`), "utf8"),
    );
    expect(persisted.taskId).toBe("task-42");
    service.onModuleDestroy();
  });

  it("onRunStatus fires on every persisted transition (start + fail)", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const seen: string[] = [];
    const off = service.onRunStatus((r) => seen.push(r.status));
    const run = await service.start("research-then-build");
    // Step 0 fails → chain failed (another persist → another emit).
    await d.emit({ pipelineRunId: run.steps[0]?.runRef as string, status: "failed" });
    off();
    // The start (running) and the terminal (failed) transitions were both emitted.
    expect(seen).toContain("running");
    expect(seen).toContain("failed");
    service.onModuleDestroy();
  });

  it("a done step hands its vault-note artifact's CONTENT to the next step", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");
    const step0Ref = run.steps[0]?.runRef as string;
    d.artifacts.list.mockResolvedValue([vaultArtifact(step0Ref)]);

    await d.emit({ pipelineRunId: step0Ref, status: "done" });

    expect(run.steps[0]?.status).toBe("done");
    expect(run.steps[0]?.artifactId).toBe(`${step0Ref}_vault-note_report-md`);
    expect(run.currentStep).toBe(1);
    expect(run.steps[1]?.status).toBe("running");
    expect(d.pipelineRunner.start).toHaveBeenLastCalledWith(
      "build-feature",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "RESEARCH FINDINGS",
    );
    service.onModuleDestroy();
  });

  it("a project-file artifact is read from the owning project's checkout", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");
    const step0Ref = run.steps[0]?.runRef as string;
    await fs.mkdir(path.join(dir, "reports"), { recursive: true });
    await fs.writeFile(path.join(dir, "reports/brief.md"), "PROJECT BRIEF", "utf8");
    d.artifacts.list.mockResolvedValue([
      {
        ...vaultArtifact(step0Ref),
        kind: "project-file",
        locator: "reports/brief.md",
        producedBy: { runRef: step0Ref, pipelineId: "nightly-research", projectId: "acme" },
      },
    ]);

    await d.emit({ pipelineRunId: step0Ref, status: "done" });

    expect(d.pipelineRunner.start).toHaveBeenLastCalledWith(
      "build-feature",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "PROJECT BRIEF",
    );
    service.onModuleDestroy();
  });

  it("the LAST step done finishes the chain (no artifact required)", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");
    d.artifacts.list.mockResolvedValue([vaultArtifact(run.steps[0]?.runRef as string)]);
    await d.emit({ pipelineRunId: run.steps[0]?.runRef as string, status: "done" });

    await d.emit({ pipelineRunId: run.steps[1]?.runRef as string, status: "done" });

    expect(run.status).toBe("done");
    expect(run.currentStep).toBeNull();
    expect(run.steps.every((s) => s.status === "done")).toBe(true);
    service.onModuleDestroy();
  });

  it("a step that delivered NO consumable artifact parks the chain (never skips)", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");

    await d.emit({ pipelineRunId: run.steps[0]?.runRef as string, status: "done" });

    expect(run.status).toBe("parked");
    expect(run.parkedReason).toContain("no consumable artifact");
    expect(run.steps[1]?.status).toBe("pending");
    service.onModuleDestroy();
  });

  it("a pr-only delivery is a gate, not a handoff — the chain parks", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");
    const step0Ref = run.steps[0]?.runRef as string;
    d.artifacts.list.mockResolvedValue([
      { ...vaultArtifact(step0Ref), kind: "pr", locator: "https://x.test/pr/1" },
    ]);

    await d.emit({ pipelineRunId: step0Ref, status: "done" });

    expect(run.status).toBe("parked");
    service.onModuleDestroy();
  });

  it("a failed step fails the chain", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");

    await d.emit({ pipelineRunId: run.steps[0]?.runRef as string, status: "failed" });

    expect(run.status).toBe("failed");
    expect(run.steps[0]?.status).toBe("failed");
    expect(run.currentStep).toBeNull();
    service.onModuleDestroy();
  });

  it("a parked step parks the chain; its later done resumes and advances", async () => {
    const { service, d } = makeService(dir);
    await service.onModuleInit();
    const run = await service.start("research-then-build");
    const step0Ref = run.steps[0]?.runRef as string;

    await d.emit({ pipelineRunId: step0Ref, status: "parked" });
    expect(run.status).toBe("parked");
    expect(run.parkedReason).toContain("parked");

    // Operator resumed the pipeline run; it finishes → the chain continues.
    d.artifacts.list.mockResolvedValue([vaultArtifact(step0Ref)]);
    await d.emit({ pipelineRunId: step0Ref, status: "done" });

    expect(run.status).toBe("running");
    expect(run.parkedReason).toBeUndefined();
    expect(run.currentStep).toBe(1);
    service.onModuleDestroy();
  });

  it("boot reconcile: a step that finished while the API was down advances from the registry", async () => {
    // First life: start the chain, then "crash" before the done event lands.
    const first = makeService(dir);
    await first.service.onModuleInit();
    const run = await first.service.start("research-then-build");
    const step0Ref = run.steps[0]?.runRef as string;
    first.service.onModuleDestroy();

    // Second life: the artifact record exists (the registry survived); boot advances.
    const second = makeService(dir);
    second.d.artifacts.list.mockResolvedValue([vaultArtifact(step0Ref)]);
    await second.service.onModuleInit();
    await second.service.settle();

    const revived = second.service.get(run.chainRunId);
    expect(revived.currentStep).toBe(1);
    expect(revived.steps[1]?.status).toBe("running");
    expect(second.d.pipelineRunner.start).toHaveBeenCalledWith(
      "build-feature",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "RESEARCH FINDINGS",
    );
    second.service.onModuleDestroy();
  });

  it("boot reconcile: a lost step run with no artifact parks the chain (never guesses)", async () => {
    const first = makeService(dir);
    await first.service.onModuleInit();
    const run = await first.service.start("research-then-build");
    first.service.onModuleDestroy();

    const second = makeService(dir);
    await second.service.onModuleInit();
    await second.service.settle();

    const revived = second.service.get(run.chainRunId);
    expect(revived.status).toBe("parked");
    expect(revived.parkedReason).toContain("lost across a restart");
    second.service.onModuleDestroy();
  });
});
