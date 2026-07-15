import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalAlreadyDecidedError, ApprovalNotFoundError } from "./approvals.errors";
import { ApprovalsService } from "./approvals.service";
import { ApprovalsStorageService } from "./approvals.storage.service";

describe("ApprovalsService", () => {
  let dir: string;
  let storage: ApprovalsStorageService;
  let service: ApprovalsService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "approvals-svc-"));
    storage = new ApprovalsStorageService(dir);
    await storage.onModuleInit();
    service = new ApprovalsService(storage);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const request = () =>
    service.requestApproval({
      runId: "agent-007_1_p0",
      kind: "agent",
      skill: "Agent 007",
      action: "run",
      detail: "do it",
      risk: "high",
    });

  it("creates a pending approval and lists it", async () => {
    const created = await request();
    expect(created.status).toBe("pending");
    const pending = await service.list("pending");
    expect(pending.map((a) => a.id)).toContain(created.id);
  });

  it("approve resumes the registered runner exactly once and marks approved", async () => {
    const resume = vi.fn();
    const cancel = vi.fn();
    service.register("agent", { resume, cancel });
    const created = await request();

    const decided = await service.approve(created.id);
    expect(decided.status).toBe("approved");
    expect(decided.decidedAt).toBeTruthy();
    expect(resume).toHaveBeenCalledWith("agent-007_1_p0");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("reject cancels the run and a second decision is rejected", async () => {
    const resume = vi.fn();
    const cancel = vi.fn();
    service.register("agent", { resume, cancel });
    const created = await request();

    await service.reject(created.id);
    expect(cancel).toHaveBeenCalledWith("agent-007_1_p0");
    await expect(service.approve(created.id)).rejects.toBeInstanceOf(ApprovalAlreadyDecidedError);
  });

  it("cancelPendingForRun rejects the run's pending approval without a runner round-trip", async () => {
    const resume = vi.fn();
    const cancel = vi.fn();
    service.register("agent", { resume, cancel });
    const created = await request();

    await service.cancelPendingForRun("agent-007_1_p0");
    const got = await service.get(created.id);
    expect(got.status).toBe("rejected");
    // The caller is the runner deleting the run itself — no resume/cancel back-call.
    expect(resume).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    // Other runs' approvals are untouched and an empty match is a no-op.
    await expect(service.cancelPendingForRun("other-run")).resolves.toBeUndefined();
  });

  it("concurrent approve+reject on the same id: exactly one runner call wins, no split-brain (claim 5 — TOCTOU regression)", async () => {
    const resume = vi.fn();
    const cancel = vi.fn();
    service.register("agent", { resume, cancel });
    const created = await request();

    const results = await Promise.allSettled([
      service.approve(created.id),
      service.reject(created.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejectedResults = results.filter((r) => r.status === "rejected");

    // Exactly one of the two concurrent decisions wins; the other must observe the
    // already-decided state and throw, not silently succeed.
    expect(fulfilled).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);
    const loser = rejectedResults[0];
    if (loser?.status === "rejected") {
      expect(loser.reason).toBeInstanceOf(ApprovalAlreadyDecidedError);
    }

    // Exactly one runner action total — no double-spawn, no resume-after-reject.
    expect(resume.mock.calls.length + cancel.mock.calls.length).toBe(1);

    // The persisted state is single, consistent, terminal — not corrupted.
    const final = await service.get(created.id);
    expect(["approved", "rejected"]).toContain(final.status);
  });

  it("two concurrent approve calls on the same id: only the first actually resumes the run", async () => {
    const resume = vi.fn();
    const cancel = vi.fn();
    service.register("agent", { resume, cancel });
    const created = await request();

    const results = await Promise.allSettled([
      service.approve(created.id),
      service.approve(created.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("404s on an unknown id", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(ApprovalNotFoundError);
  });

  it("persists durably: a fresh service over the same dir sees the approval", async () => {
    const created = await request();
    const fresh = new ApprovalsService(new ApprovalsStorageService(dir));
    const got = await fresh.get(created.id);
    expect(got.id).toBe(created.id);
  });
});
