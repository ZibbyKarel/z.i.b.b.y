import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Approval } from "@zibby/contracts";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalsService } from "../approvals/approvals.service";
import { KbMcpAuthGuard } from "../kb/kb-mcp-auth.guard";
import { KbMcpAuthService } from "../kb/kb-mcp-auth.service";
import { PHASE_ADVISOR, RunMcpController } from "./run-mcp.controller";

const approval = (over: Partial<Approval>): Approval => ({
  id: "ap",
  runId: "wf_1.build_123_9",
  kind: "workflow-stage",
  skill: "Writer",
  action: "operator.question",
  detail: JSON.stringify({ summary: "Which env?" }),
  risk: "high",
  status: "approved",
  requestedAt: "2026-10-20T10:00:00.000Z",
  ...over,
});

const list = vi.fn<(status?: Approval["status"]) => Promise<Approval[]>>();
const advise = vi.fn<(runId: string, question: string) => Promise<string>>();

describe("POST /api/runs/mcp — RunMcpController (ask_operator)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let runToken: string;
  let chatToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RunMcpController],
      providers: [
        { provide: ApprovalsService, useValue: { list } },
        { provide: PHASE_ADVISOR, useValue: { ask: advise } },
        KbMcpAuthService,
        KbMcpAuthGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    const auth = moduleRef.get(KbMcpAuthService);
    runToken = auth.runBearerToken;
    chatToken = auth.chatBearerToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    list.mockReset();
    advise.mockReset();
  });

  async function ask(
    token: string,
    runId: string | undefined,
    question: string,
    tool = "ask_operator",
  ) {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (runId) headers["X-Zibby-Run-Id"] = runId;
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/runs/mcp`), {
      requestInit: { headers },
    });
    const client = new Client({ name: "run-mcp-test", version: "1.0.0" });
    await client.connect(transport);
    const result = (await client.callTool({ name: tool, arguments: { question } })) as {
      isError?: boolean;
      content: Array<{ type: "text"; text: string }>;
    };
    await client.close();
    return { isError: result.isError, text: result.content[0]?.text ?? "" };
  }

  it("401s without the bearer token and never reads approvals", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/runs/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(res.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it("returns the newest approved answer to this run's question", async () => {
    list.mockResolvedValue([
      approval({ id: "old", reason: "dev", decidedAt: "2026-10-20T10:01:00.000Z" }),
      approval({ id: "new", reason: "staging", decidedAt: "2026-10-20T10:02:00.000Z" }),
      approval({
        id: "other",
        detail: JSON.stringify({ summary: "Which branch?" }),
        reason: "main",
        decidedAt: "2026-10-20T10:03:00.000Z",
      }),
      approval({
        id: "foreign",
        runId: "wf_2.build_1_1",
        reason: "prod",
        decidedAt: "2026-10-20T10:04:00.000Z",
      }),
    ]);
    const r = await ask(runToken, "wf_1", "Which env?");
    expect(list).toHaveBeenCalledWith("approved");
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("staging");
    expect(r.text).not.toContain("prod");
  });

  it("answers an agent run whose approval carries the core id (header id + _pid)", async () => {
    // Header: `${agentId}_${startedMs}`; approval: the core's `${agentId}_${startedMs}_${pid}`.
    list.mockResolvedValue([
      approval({ id: "mine", kind: "agent", runId: "writer_1700_42", reason: "staging" }),
      // Another run of an agent whose id extends this one's must never match.
      approval({
        id: "foreign",
        kind: "agent",
        runId: "writer_1700_x_1800_7",
        reason: "prod",
        decidedAt: "2026-10-20T10:09:00.000Z",
      }),
      // The prefix match is agent-only: a workflow-stage approval never rides it.
      approval({
        id: "stage",
        kind: "workflow-stage",
        runId: "writer_1700_43",
        reason: "qa",
        decidedAt: "2026-10-20T10:08:00.000Z",
      }),
    ]);
    const r = await ask(runToken, "writer_1700", "Which env?");
    expect(r.text).toContain("staging");
    expect(r.text).not.toContain("prod");
    expect(r.text).not.toContain("qa");
  });

  it("is an error without a run id (and the chat token counts as no run)", async () => {
    list.mockResolvedValue([approval({ reason: "staging" })]);
    const none = await ask(runToken, undefined, "Which env?");
    expect(none.isError).toBe(true);
    expect(none.text).toBe("ask_operator only works inside a ZIBBY run.");
    const chat = await ask(chatToken, "wf_1", "Which env?");
    expect(chat.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });

  it("says no answer was recorded when nothing matches (no throw, no wait)", async () => {
    list.mockResolvedValue([approval({ reason: undefined })]);
    const r = await ask(runToken, "wf_1", "Which env?");
    expect(r.isError).toBeFalsy();
    expect(r.text).toBe("No answer was recorded. Decide yourself or stop.");
  });

  it("ask_advisor passes the run's question to the phase advisor and returns its text", async () => {
    advise.mockResolvedValue("The advisor answered: run the generator.");
    const r = await ask(runToken, "wf_1", "Skip the generator?", "ask_advisor");
    expect(advise).toHaveBeenCalledWith("wf_1", "Skip the generator?");
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain("run the generator");
    // Never touches the operator's approvals.
    expect(list).not.toHaveBeenCalled();
  });

  it("ask_advisor is an error without a run id (and for the chat token)", async () => {
    expect((await ask(runToken, undefined, "q", "ask_advisor")).isError).toBe(true);
    expect((await ask(chatToken, "wf_1", "q", "ask_advisor")).isError).toBe(true);
    expect(advise).not.toHaveBeenCalled();
  });
});

describe("RunMcpController without a phase advisor", () => {
  it("ask_advisor tells the agent to use ask_operator", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RunMcpController],
      providers: [
        { provide: ApprovalsService, useValue: { list } },
        KbMcpAuthService,
        KbMcpAuthGuard,
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/api/runs/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${moduleRef.get(KbMcpAuthService).runBearerToken}`,
            "X-Zibby-Run-Id": "wf_1",
          },
        },
      },
    );
    const client = new Client({ name: "run-mcp-test", version: "1.0.0" });
    await client.connect(transport);
    const result = (await client.callTool({
      name: "ask_advisor",
      arguments: { question: "q" },
    })) as {
      content: Array<{ text: string }>;
    };
    await client.close();
    await app.close();
    expect(result.content[0]?.text).toContain("ask_operator");
  });
});
