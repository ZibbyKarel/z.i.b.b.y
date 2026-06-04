import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApprovalAlreadyDecidedError, ApprovalNotFoundError } from "./approvals.errors"
import { ApprovalsService } from "./approvals.service"
import { ApprovalsStorageService } from "./approvals.storage.service"

describe("ApprovalsService", () => {
  let dir: string
  let storage: ApprovalsStorageService
  let service: ApprovalsService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "approvals-svc-"))
    storage = new ApprovalsStorageService(dir)
    await storage.onModuleInit()
    service = new ApprovalsService(storage)
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const request = () =>
    service.requestApproval({
      runId: "agent-007_1_p0",
      kind: "agent",
      skill: "Agent 007",
      action: "run",
      detail: "do it",
      risk: "high",
    })

  it("creates a pending approval and lists it", async () => {
    const created = await request()
    expect(created.status).toBe("pending")
    const pending = await service.list("pending")
    expect(pending.map((a) => a.id)).toContain(created.id)
  })

  it("approve resumes the registered runner exactly once and marks approved", async () => {
    const resume = vi.fn()
    const cancel = vi.fn()
    service.register("agent", { resume, cancel })
    const created = await request()

    const decided = await service.approve(created.id)
    expect(decided.status).toBe("approved")
    expect(decided.decidedAt).toBeTruthy()
    expect(resume).toHaveBeenCalledWith("agent-007_1_p0")
    expect(cancel).not.toHaveBeenCalled()
  })

  it("reject cancels the run and a second decision is rejected", async () => {
    const resume = vi.fn()
    const cancel = vi.fn()
    service.register("agent", { resume, cancel })
    const created = await request()

    await service.reject(created.id)
    expect(cancel).toHaveBeenCalledWith("agent-007_1_p0")
    await expect(service.approve(created.id)).rejects.toBeInstanceOf(ApprovalAlreadyDecidedError)
  })

  it("404s on an unknown id", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(ApprovalNotFoundError)
  })

  it("persists durably: a fresh service over the same dir sees the approval", async () => {
    const created = await request()
    const fresh = new ApprovalsService(new ApprovalsStorageService(dir))
    const got = await fresh.get(created.id)
    expect(got.id).toBe(created.id)
  })
})
