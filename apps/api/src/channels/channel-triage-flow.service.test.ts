import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { ChannelItem, Integration, Mandate, TriageVerdict } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChannelItemStore } from "./channel-item.store"
import { ChannelTriageFlowService } from "./channel-triage-flow.service"

const fakeLogger = { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }

const integration: Integration = {
  id: "team",
  kind: "slack",
  name: "Team Slack",
  enabled: true,
  config: { kind: "slack", channels: ["C1"] },
  status: "connected",
  hasCredentials: true,
}

const item = (over: Partial<ChannelItem> = {}): ChannelItem => ({
  id: "C1-100",
  integrationId: "team",
  kind: "slack",
  externalRef: { channel: "C1", ts: "100" },
  receivedAt: "2026-06-12T00:00:00.000Z",
  text: "hello",
  raw: {},
  state: "new",
  ...over,
})

const MANDATE_ALL: Mandate = { defaults: { dispatch: true, reply: true }, channels: {} }
const MANDATE_NO_REPLY: Mandate = { defaults: { dispatch: true, reply: false }, channels: {} }

describe("ChannelTriageFlowService", () => {
  let dir: string
  let store: ChannelItemStore
  let createTask: ReturnType<typeof vi.fn>
  let requestApproval: ReturnType<typeof vi.fn>
  let send: ReturnType<typeof vi.fn>

  function makeFlow(opts: {
    verdict: TriageVerdict
    mandate?: Mandate
    decision?: "allow" | "notify" | "ask" | "deny"
    taskOutcome?: ChannelItem["outcome"]
  }) {
    createTask = vi.fn(async () => ({ outcome: "dispatched", task: { id: "task_1" }, runRef: "r1", target: {} }))
    requestApproval = vi.fn(async () => ({ id: "appr_1" }))
    send = vi.fn(async () => undefined)
    const register = vi.fn()

    const triage = { triage: async () => opts.verdict }
    const mandate = { read: async () => opts.mandate ?? MANDATE_ALL }
    const tasks = { createTask }
    const scheduledTasks = { get: async () => ({ outcome: opts.taskOutcome }) }
    const gates = { floor: async () => [], evaluate: () => ({ decision: opts.decision ?? "notify" }) }
    const gateRules = { list: async () => [] }
    const integrations = { get: async () => integration }
    const credentials = { read: async () => ({ token: "xoxb-1" }) }
    const registry = { resolve: () => ({ send }) }
    const approvals = { register, requestApproval }

    return new ChannelTriageFlowService(
      triage as never,
      mandate as never,
      tasks as never,
      scheduledTasks as never,
      gates as never,
      gateRules as never,
      integrations as never,
      credentials as never,
      registry as never,
      store,
      approvals as never,
      fakeLogger as never,
    )
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-"))
    store = new ChannelItemStore(dir)
    await store.onModuleInit()
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const bug: TriageVerdict = { actionable: true, tier: 1, category: "bug", suggestedTaskText: "fix it", confidence: 0.8, reason: "bug" }
  const question: TriageVerdict = { actionable: true, tier: 2, category: "question", suggestedReply: "here you go", confidence: 0.7, reason: "q" }
  const scope: TriageVerdict = { actionable: true, tier: 3, category: "request", suggestedReply: "let me check", confidence: 0.6, reason: "s" }

  it("Tier 1: dispatches a task with enveloped text and marks the item handled", async () => {
    const flow = makeFlow({ verdict: bug })
    const out = await flow.handle(item({ text: "secret-payload" }))
    expect(out.state).toBe("handled")
    expect(out.taskId).toBe("task_1")
    expect(createTask).toHaveBeenCalledTimes(1)
    const text = createTask.mock.calls[0]![0].text as string
    // Law 4: the raw text is enveloped, not bare; the title carries no body.
    expect(text).toContain("untrusted")
    expect(createTask.mock.calls[0]![0].title).not.toContain("secret-payload")
  })

  it("Tier 2 + reply mandate + gate notify: sends the draft and persists the reply", async () => {
    const flow = makeFlow({ verdict: question, decision: "notify" })
    const out = await flow.handle(item())
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]![3]).toBe("here you go")
    expect(out.state).toBe("handled")
    expect(out.reply?.text).toBe("here you go")
  })

  it("Tier 2 with reply mandate OFF parks an approval instead", async () => {
    const flow = makeFlow({ verdict: question, mandate: MANDATE_NO_REPLY })
    const out = await flow.handle(item())
    expect(send).not.toHaveBeenCalled()
    expect(requestApproval).toHaveBeenCalledTimes(1)
    expect(out.state).toBe("triaged")
    expect(out.approvalId).toBe("appr_1")
  })

  it("Tier 2 hardened to ask parks an approval", async () => {
    const flow = makeFlow({ verdict: question, decision: "ask" })
    const out = await flow.handle(item())
    expect(send).not.toHaveBeenCalled()
    expect(out.state).toBe("triaged")
  })

  it("a deny gate ignores the item", async () => {
    const flow = makeFlow({ verdict: question, decision: "deny" })
    const out = await flow.handle(item())
    expect(out.state).toBe("ignored")
    expect(send).not.toHaveBeenCalled()
  })

  it("Tier 3 parks a channel approval carrying the draft", async () => {
    const flow = makeFlow({ verdict: scope })
    const out = await flow.handle(item())
    expect(requestApproval).toHaveBeenCalledTimes(1)
    expect(requestApproval.mock.calls[0]![0]).toMatchObject({ kind: "channel", runId: "team/C1-100" })
    expect(out.state).toBe("triaged")
  })

  it("resume sends the reviewed draft + handles; cancel ignores; missing item tolerated", async () => {
    const flow = makeFlow({ verdict: scope })
    await flow.handle(item()) // parks → triaged with the draft on the verdict
    await flow.resume("team/C1-100")
    expect(send).toHaveBeenCalledTimes(1)
    expect((await store.get("team", "C1-100"))?.state).toBe("handled")

    // cancel a fresh parked item
    await store.update(item({ id: "C1-200", state: "triaged" }))
    await flow.cancel("team/C1-200")
    expect((await store.get("team", "C1-200"))?.state).toBe("ignored")

    // missing item: resolves without throwing
    await expect(flow.resume("team/none")).resolves.toBeUndefined()
  })

  it("sweepOutcomes copies a finished task's outcome onto the item", async () => {
    const outcome = { status: "done" as const, summary: "fixed", finishedAt: "2026-06-12T01:00:00.000Z" }
    const flow = makeFlow({ verdict: bug, taskOutcome: outcome })
    await store.update(item({ state: "handled", taskId: "task_1" }))
    await flow.sweepOutcomes()
    expect((await store.get("team", "C1-100"))?.outcome).toEqual(outcome)
  })
})
