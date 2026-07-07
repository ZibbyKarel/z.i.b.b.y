import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ChannelItem, Integration, Mandate, Project, TriageVerdict } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelItemStore } from "./channel-item.store";
import { ChannelTriageFlowService } from "./channel-triage-flow.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const integration: Integration = {
  id: "team",
  kind: "slack",
  projectId: "acme-app",
  name: "Team Slack",
  enabled: true,
  config: { kind: "slack", channels: ["C1"] },
  status: "connected",
  hasCredentials: true,
};

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
});

const MANDATE_ALL: Mandate = { defaults: { dispatch: true, reply: true }, channels: {} };
const MANDATE_NO_REPLY: Mandate = { defaults: { dispatch: true, reply: false }, channels: {} };

describe("ChannelTriageFlowService", () => {
  let dir: string;
  let store: ChannelItemStore;
  let createTask: ReturnType<typeof vi.fn>;
  let requestApproval: ReturnType<typeof vi.fn>;
  let send: ReturnType<typeof vi.fn>;

  function makeFlow(opts: {
    verdict: TriageVerdict;
    mandate?: Mandate;
    decision?: "allow" | "notify" | "ask" | "deny";
    taskOutcome?: ChannelItem["outcome"];
    projects?: Project[];
    jiraIntegrations?: Array<{ id: string; kind: string; enabled: boolean }>;
    jiraPropose?: ReturnType<typeof vi.fn>;
    readOnly?: boolean;
    degraded?: boolean;
  }) {
    createTask = vi.fn(async () => ({
      outcome: "dispatched",
      task: { id: "task_1" },
      runRef: "r1",
      target: {},
    }));
    requestApproval = vi.fn(async () => ({ id: "appr_1" }));
    send = vi.fn(async () => undefined);
    const register = vi.fn();

    const triage = {
      triage: async () => opts.verdict,
      triageDetailed: async () => ({ verdict: opts.verdict, degraded: opts.degraded ?? false }),
    };
    const mandate = { read: async () => opts.mandate ?? MANDATE_ALL };
    const tasks = { createTask };
    const scheduledTasks = { get: async () => ({ outcome: opts.taskOutcome }) };
    const gates = {
      floor: async () => [],
      evaluate: () => ({ decision: opts.decision ?? "notify" }),
    };
    const gateRules = { list: async () => [] };
    const integrations = {
      get: async () => integration,
      list: async () => opts.jiraIntegrations ?? [],
    };
    const projects = { list: async () => opts.projects ?? [] };
    // Phase 70: no company in any of these tests — the resolver degrades to the
    // project's own raw `identity.people`, matching pre-Phase-70 behavior exactly.
    // The resolver's own merge rules are unit-tested in resolved-project.helpers.test.ts.
    const resolved = {
      resolvePeople: async (project: Project) => project.identity?.people ?? [],
    };
    const credentials = { read: async () => ({ token: "xoxb-1" }) };
    const registry = { resolve: () => ({ send, ...(opts.readOnly ? { readOnly: true as const } : {}) }) };
    const approvals = { register, requestApproval };
    const jiraFlow = opts.jiraPropose ? { propose: opts.jiraPropose } : undefined;

    return new ChannelTriageFlowService(
      triage as never,
      mandate as never,
      tasks as never,
      scheduledTasks as never,
      gates as never,
      gateRules as never,
      integrations as never,
      projects as never,
      resolved as never,
      credentials as never,
      registry as never,
      store,
      approvals as never,
      fakeLogger as never,
      { record: async () => {} } as never,
      jiraFlow as never,
    );
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "flow-test-"));
    store = new ChannelItemStore(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const bug: TriageVerdict = {
    actionable: true,
    tier: 1,
    category: "bug",
    suggestedTaskText: "fix it",
    confidence: 0.8,
    reason: "bug",
  };
  const question: TriageVerdict = {
    actionable: true,
    tier: 2,
    category: "question",
    suggestedReply: "here you go",
    confidence: 0.7,
    reason: "q",
  };
  const scope: TriageVerdict = {
    actionable: true,
    tier: 3,
    category: "request",
    suggestedReply: "let me check",
    confidence: 0.6,
    reason: "s",
  };

  it("Tier 1: dispatches a task with enveloped text and marks the item handled", async () => {
    const flow = makeFlow({ verdict: bug });
    const out = await flow.handle(item({ text: "secret-payload" }));
    expect(out.state).toBe("handled");
    expect(out.taskId).toBe("task_1");
    expect(createTask).toHaveBeenCalledTimes(1);
    const text = createTask.mock.calls[0]![0].text as string;
    // Law 4: the raw text is enveloped, not bare; the title carries no body.
    expect(text).toContain("untrusted");
    expect(createTask.mock.calls[0]![0].title).not.toContain("secret-payload");
  });

  it("a bug verdict autonomously files a GATED Jira issue into the operator's Jira integration", async () => {
    const jiraPropose = vi.fn<
      (input: { integrationId: string; summary: string }) => Promise<{ id: string }>
    >(async () => ({ id: "appr_jira" }));
    const flow = makeFlow({
      verdict: bug,
      jiraPropose,
      jiraIntegrations: [{ id: "acme-jira", kind: "jira", enabled: true }],
    });
    await flow.handle(item({ text: "login crashes on submit" }));
    expect(jiraPropose).toHaveBeenCalledTimes(1);
    expect(jiraPropose.mock.calls[0]![0]).toMatchObject({ integrationId: "acme-jira" });
    expect(jiraPropose.mock.calls[0]![0].summary).toContain("login crashes");
  });

  it("does not file a Jira issue when no Jira integration is configured", async () => {
    const jiraPropose = vi.fn(async () => ({ id: "x" }));
    const flow = makeFlow({ verdict: bug, jiraPropose, jiraIntegrations: [] });
    await flow.handle(item({ text: "another bug" }));
    expect(jiraPropose).not.toHaveBeenCalled();
  });

  it("does not file a Jira issue for a non-bug verdict", async () => {
    const jiraPropose = vi.fn(async () => ({ id: "x" }));
    const flow = makeFlow({
      verdict: question,
      jiraPropose,
      jiraIntegrations: [{ id: "acme-jira", kind: "jira", enabled: true }],
    });
    await flow.handle(item());
    expect(jiraPropose).not.toHaveBeenCalled();
  });

  it("tags the item + task with the matched engagement (Phase 8.2)", async () => {
    const flow = makeFlow({
      verdict: bug,
      projects: [{ id: "alpha", name: "Alpha", path: "/work/alpha" }],
    });
    const out = await flow.handle(item({ text: "the Alpha login is broken" }));
    expect(out.projectId).toBe("alpha");
    // The trusted projectId rides into createTask as the third arg (server-derived).
    expect(createTask.mock.calls[0]![2]).toBe("alpha");
  });

  it("leaves projectId undefined when nothing matches", async () => {
    const flow = makeFlow({
      verdict: bug,
      projects: [{ id: "alpha", name: "Alpha", path: "/work/alpha" }],
    });
    const out = await flow.handle(item({ text: "something generic and unrelated" }));
    expect(out.projectId).toBeUndefined();
    expect(createTask.mock.calls[0]![2]).toBeUndefined();
  });

  it("attributes the item to the integration's stored project, even with no text match", async () => {
    // The integration fixture is owned by "acme-app"; the stored projectId wins over
    // the text/name attribution (which would not match "Acme" in this body).
    const flow = makeFlow({
      verdict: bug,
      projects: [{ id: "acme-app", name: "Acme", path: "/work/acme" }],
    });
    const out = await flow.handle(item({ text: "something generic and unrelated" }));
    expect(out.projectId).toBe("acme-app");
    expect(createTask.mock.calls[0]![2]).toBe("acme-app");
  });

  it("Tier 2 + reply mandate + gate notify: sends the draft and persists the reply", async () => {
    const flow = makeFlow({ verdict: question, decision: "notify" });
    const out = await flow.handle(item());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![3]).toBe("here you go");
    expect(out.state).toBe("handled");
    expect(out.reply?.text).toBe("here you go");
  });

  it("Tier 2 with reply mandate OFF parks an approval instead", async () => {
    const flow = makeFlow({ verdict: question, mandate: MANDATE_NO_REPLY });
    const out = await flow.handle(item());
    expect(send).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(out.state).toBe("triaged");
    expect(out.approvalId).toBe("appr_1");
  });

  it("Tier 2 hardened to ask parks an approval", async () => {
    const flow = makeFlow({ verdict: question, decision: "ask" });
    const out = await flow.handle(item());
    expect(send).not.toHaveBeenCalled();
    expect(out.state).toBe("triaged");
  });

  it("a deny gate ignores the item", async () => {
    const flow = makeFlow({ verdict: question, decision: "deny" });
    const out = await flow.handle(item());
    expect(out.state).toBe("ignored");
    expect(send).not.toHaveBeenCalled();
  });

  it("Tier 3 parks a channel approval carrying the draft", async () => {
    const flow = makeFlow({ verdict: scope });
    const out = await flow.handle(item());
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval.mock.calls[0]![0]).toMatchObject({
      kind: "channel",
      runId: "team/C1-100",
    });
    expect(out.state).toBe("triaged");
  });

  it("resume sends the reviewed draft + handles; cancel ignores; missing item tolerated", async () => {
    const flow = makeFlow({ verdict: scope });
    await flow.handle(item()); // parks → triaged with the draft on the verdict
    await flow.resume("team/C1-100");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await store.get("team", "C1-100"))?.state).toBe("handled");

    // cancel a fresh parked item
    await store.update(item({ id: "C1-200", state: "triaged" }));
    await flow.cancel("team/C1-200");
    expect((await store.get("team", "C1-200"))?.state).toBe("ignored");

    // missing item: resolves without throwing
    await expect(flow.resume("team/none")).resolves.toBeUndefined();
  });

  it("read-only integration (calendar): item is noted as handled — no approval, no task, no send", async () => {
    const flow = makeFlow({ verdict: scope, readOnly: true });
    const out = await flow.handle(item({ kind: "calendar" }));
    expect(out.state).toBe("handled");
    expect(requestApproval).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  // ---- Notify-only (email): surface relevant mail, never act ------------------

  const bulk: TriageVerdict = {
    actionable: false,
    tier: 3,
    category: "other",
    summary: "Alza newsletter — weekend deals",
    confidence: 0.9,
    reason: "bulk/transactional mail",
  };

  it("email notify-only: an actionable item is surfaced (triaged) — no task, no reply, no approval", async () => {
    const flow = makeFlow({ verdict: question });
    const out = await flow.handle(item({ kind: "email" }));
    expect(out.state).toBe("triaged");
    expect(out.taskId).toBeUndefined();
    expect(out.approvalId).toBeUndefined();
    expect(createTask).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("email notify-only: bulk/transactional mail is suppressed silently (ignored)", async () => {
    const flow = makeFlow({ verdict: bulk });
    const out = await flow.handle(item({ kind: "email" }));
    expect(out.state).toBe("ignored");
    expect(createTask).not.toHaveBeenCalled();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("email notify-only: a degraded verdict (router down) is surfaced anyway — never silently lost", async () => {
    // Even bulk-looking, because under a router outage we can't trust the heuristic to
    // drop it. Fail toward visibility.
    const flow = makeFlow({ verdict: bulk, degraded: true });
    const out = await flow.handle(item({ kind: "email" }));
    expect(out.state).toBe("triaged");
  });

  it("sweepOutcomes copies a finished task's outcome onto the item", async () => {
    const outcome = {
      status: "done" as const,
      summary: "fixed",
      finishedAt: "2026-06-12T01:00:00.000Z",
    };
    const flow = makeFlow({ verdict: bug, taskOutcome: outcome });
    await store.update(item({ state: "handled", taskId: "task_1" }));
    await flow.sweepOutcomes();
    expect((await store.get("team", "C1-100"))?.outcome).toEqual(outcome);
  });

  // ---- M2: project autonomy policy enforcement --------------------------------

  it("VIP sender + vip_escalation forces Tier 3 even when triage says Tier 1", async () => {
    const project: Project = {
      id: "alpha",
      name: "Alpha",
      path: "/work/alpha",
      identity: { people: [{ name: "alice", role: "CEO", vip: true }] },
      autonomy_policy: { vip_escalation: true },
    };
    const flow = makeFlow({ verdict: bug, projects: [project] });
    const out = await flow.handle(item({ text: "alpha bug report", from: "alice@corp.com" }));
    // Tier-1 dispatch was suppressed; approval queued instead.
    expect(createTask).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(out.state).toBe("triaged");
    expect(out.vip).toBe(true);
  });

  it("respond_as=draft_only forces Tier 3 even when triage says Tier 2", async () => {
    const project: Project = {
      id: "beta",
      name: "Beta",
      path: "/work/beta",
      autonomy_policy: { respond_as: "draft_only" },
    };
    const flow = makeFlow({ verdict: question, projects: [project] });
    const out = await flow.handle(item({ text: "beta question", integrationId: "team" }));
    expect(send).not.toHaveBeenCalled();
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(out.state).toBe("triaged");
  });

  it("VIP sender without vip_escalation flag does NOT force Tier 3", async () => {
    const project: Project = {
      id: "gamma",
      name: "Gamma",
      path: "/work/gamma",
      identity: { people: [{ name: "bob", role: "PM", vip: true }] },
      autonomy_policy: { vip_escalation: false },
    };
    // Tier-1 verdict — should still dispatch (vip_escalation is false)
    const flow = makeFlow({ verdict: bug, projects: [project] });
    const out = await flow.handle(item({ text: "gamma issue", from: "bob@corp.com" }));
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(out.state).toBe("handled");
    // vip still stamped on the item for the inbox
    expect(out.vip).toBe(true);
  });
});
