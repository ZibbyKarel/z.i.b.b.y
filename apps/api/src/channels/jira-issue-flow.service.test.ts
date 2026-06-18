import { describe, expect, it, vi } from "vitest"
import type { Integration } from "@zibby/contracts"
import { JiraIssueFlowService } from "./jira-issue-flow.service"

const jiraIntegration: Integration = {
  id: "acme-jira",
  kind: "jira",
  projectId: "acme-app",
  enabled: true,
  config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "me@acme.com", projectKey: "BUG" },
  status: "connected",
  hasCredentials: true,
}

function build(over: { integration?: Integration | null; creds?: unknown } = {}) {
  const approvals = {
    register: vi.fn(),
    requestApproval: vi.fn(async (input: { runId: string }) => ({ id: `ap-${input.runId}` })),
  }
  const integrations = {
    get: vi.fn(async (id: string) => {
      const i = over.integration === undefined ? jiraIntegration : over.integration
      if (!i) throw new IntegrationNotFound(id)
      return i
    }),
  }
  const credentials = { read: vi.fn(async () => (over.creds === undefined ? { token: "tok" } : over.creds)) }
  const activity = { record: vi.fn().mockResolvedValue(undefined) }
  const adapter = { createIssue: vi.fn(async () => "BUG-9") }
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }
  const svc = new JiraIssueFlowService(
    approvals as never,
    integrations as never,
    credentials as never,
    activity as never,
    logger as never,
    adapter as never,
  )
  return { svc, approvals, adapter, activity, credentials }
}

class IntegrationNotFound extends Error {
  constructor(id: string) {
    super(`Integration "${id}" not found`)
    this.name = "IntegrationNotFoundError"
  }
}

describe("JiraIssueFlowService", () => {
  it("propose parks a jira-issue approval (creates nothing yet)", async () => {
    const { svc, approvals, adapter } = build()
    const approval = await svc.propose({ integrationId: "acme-jira", summary: "Login crash" })
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "jira-issue", action: "jira.create_issue" }),
    )
    expect(approval.id).toBeDefined()
    expect(adapter.createIssue).not.toHaveBeenCalled() // gated — nothing created on propose
  })

  it("rejects a non-jira integration", async () => {
    const slack: Integration = { ...jiraIntegration, kind: "slack", config: { kind: "slack", channels: [] } }
    const { svc } = build({ integration: slack })
    await expect(svc.propose({ integrationId: "acme-jira", summary: "x" })).rejects.toThrow(/not a jira integration/)
  })

  it("resume creates the issue exactly once and records the approval", async () => {
    const { svc, approvals, adapter, activity } = build()
    await svc.propose({ integrationId: "acme-jira", summary: "Login crash", description: "stack" })
    const runId = approvals.requestApproval.mock.calls[0]![0].runId
    await svc.resume(runId)
    expect(adapter.createIssue).toHaveBeenCalledWith(
      jiraIntegration,
      { token: "tok" },
      expect.objectContaining({ summary: "Login crash", description: "stack" }),
    )
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "channel-approval", refs: expect.objectContaining({ status: "BUG-9" }) }),
    )
    // A second resume is a no-op (pending consumed) — no double create.
    await svc.resume(runId)
    expect(adapter.createIssue).toHaveBeenCalledTimes(1)
  })

  it("cancel drops the pending request so a later resume no-ops", async () => {
    const { svc, approvals, adapter } = build()
    await svc.propose({ integrationId: "acme-jira", summary: "x" })
    const runId = approvals.requestApproval.mock.calls[0]![0].runId
    svc.cancel(runId)
    await svc.resume(runId)
    expect(adapter.createIssue).not.toHaveBeenCalled()
  })

  it("resume without credentials aborts without creating", async () => {
    const { svc, approvals, adapter } = build({ creds: null })
    await svc.propose({ integrationId: "acme-jira", summary: "x" })
    const runId = approvals.requestApproval.mock.calls[0]![0].runId
    await svc.resume(runId)
    expect(adapter.createIssue).not.toHaveBeenCalled()
  })
})
