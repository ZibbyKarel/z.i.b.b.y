import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { TaskTarget } from "@zibby/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChatMcpAuthGuard } from "./chat-mcp-auth.guard";
import { ChatMcpAuthService } from "./chat-mcp-auth.service";
import { ChatMcpController } from "./chat-mcp.controller";
import { ChatToolResultRegistry } from "./chat-tool-result.registry";
import { ChatToolsService } from "./chat-tools.service";

const getStatus = vi.fn<() => Promise<string>>();
const recallMemory = vi.fn<(query: string) => Promise<string>>();
const createTask = vi.fn();
const proposeRename = vi.fn();
const proposeOpenMaps = vi.fn();
const proposeOpenFolder = vi.fn();
const capturePersonalNote = vi.fn<() => Promise<string>>();

/**
 * HTTP e2e for the chat MCP endpoint's NEW auth guard (T9). Same real-listening-port
 * shape as `../memory/entity-mcp.controller.test.ts` — a real TCP connection so the
 * guard's `req.socket.remoteAddress` loopback check exercises real conditions (a
 * `supertest` request against `app.getHttpServer()` connects over 127.0.0.1).
 */
describe("POST /api/chat/mcp — ChatMcpAuthGuard", () => {
  let app: INestApplication;
  let baseUrl: string;
  let auth: ChatMcpAuthService;

  let toolResults: ChatToolResultRegistry;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatMcpController],
      providers: [
        {
          provide: ChatToolsService,
          useValue: {
            getStatus,
            recallMemory,
            createTask,
            proposeRename,
            proposeOpenMaps,
            proposeOpenFolder,
            capturePersonalNote,
          },
        },
        ChatToolResultRegistry,
        ChatMcpAuthService,
        ChatMcpAuthGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    auth = moduleRef.get(ChatMcpAuthService);
    toolResults = moduleRef.get(ChatToolResultRegistry);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    getStatus.mockReset();
    recallMemory.mockReset();
    createTask.mockReset();
    proposeRename.mockReset();
    proposeOpenMaps.mockReset();
    proposeOpenFolder.mockReset();
    capturePersonalNote.mockReset();
  });

  const listToolsBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  };

  it("401s a request with no Authorization header, and never invokes a tool", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/chat/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send(listToolsBody);

    expect(res.status).toBe(401);
    expect(getStatus).not.toHaveBeenCalled();
    expect(recallMemory).not.toHaveBeenCalled();
    expect(createTask).not.toHaveBeenCalled();
  });

  it("401s a request with a malformed Authorization header", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/chat/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", "Basic not-a-bearer-token")
      .send(listToolsBody);

    expect(res.status).toBe(401);
  });

  it("401s a request with the wrong token", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/chat/mcp")
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", "Bearer not-the-real-token")
      .send(listToolsBody);

    expect(res.status).toBe(401);
  });

  it("reaches the MCP transport (200 JSON-RPC) with the correct bearer token", async () => {
    getStatus.mockResolvedValue("Nic teď nepotřebuje tvou pozornost.");

    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/chat/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${auth.bearerToken}` } },
    });
    const client = new Client({ name: "chat-mcp-test-client", version: "1.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "capture_note",
      "create_task",
      "get_status",
      "machine_rename",
      "open_folder",
      "open_maps",
      "recall_memory",
    ]);

    const result = await client.callTool({ name: "get_status", arguments: {} });
    const content = (result as { content: Array<{ type: "text"; text: string }> }).content;
    expect(content[0]?.text).toBe("Nic teď nepotřebuje tvou pozornost.");
    expect(getStatus).toHaveBeenCalledTimes(1);

    await client.close();
  });

  it("F8: capture_note round-trips to ChatToolsService.capturePersonalNote and back", async () => {
    capturePersonalNote.mockResolvedValue(
      "Zapsal jsem osobní poznámku (personal-jot) — v noci ji zařadím.",
    );

    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/chat/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${auth.bearerToken}` } },
    });
    const client = new Client({ name: "chat-mcp-test-client", version: "1.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "capture_note",
      arguments: { text: "Zubař v úterý v 9", title: "Zubař" },
    });
    const content = (result as { content: Array<{ type: "text"; text: string }> }).content;
    expect(content[0]?.text).toContain("personal-jot");
    expect(capturePersonalNote).toHaveBeenCalledWith({
      text: "Zubař v úterý v 9",
      title: "Zubař",
    });

    await client.close();
  });

  describe("D-020 — create_task's `mention` rule", () => {
    const agent: TaskTarget = { kind: "agent", id: "builder", name: "Builder" };
    const dept: TaskTarget = { kind: "department", id: "dev", name: "Dev" };

    async function connectFor(conversationId: string) {
      const transport = new StreamableHTTPClientTransport(
        new URL(`${baseUrl}/api/chat/mcp?conversationId=${conversationId}`),
        { requestInit: { headers: { Authorization: `Bearer ${auth.bearerToken}` } } },
      );
      const client = new Client({ name: "chat-mcp-test-client", version: "1.0.0" });
      await client.connect(transport);
      return client;
    }

    it("0 mentions: create_task dispatches with no explicit target — the classifier routes", async () => {
      createTask.mockResolvedValue({ text: "ok" });
      const client = await connectFor("conv-0");
      await client.callTool({ name: "create_task", arguments: { text: "postav appku" } });
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ explicitTarget: undefined }),
      );
      await client.close();
    });

    it("1 mention: create_task uses it as the explicit target, `mention` omitted", async () => {
      createTask.mockResolvedValue({ text: "ok" });
      toolResults.setMentions("conv-1", [agent]);
      const client = await connectFor("conv-1");
      await client.callTool({ name: "create_task", arguments: { text: "postav appku" } });
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ explicitTarget: agent }));
      await client.close();
    });

    it("1 mention: a `mention` naming a DIFFERENT id errors instead of silently defaulting", async () => {
      const client = await connectFor("conv-1b");
      toolResults.setMentions("conv-1b", [agent]);
      const result = await client.callTool({
        name: "create_task",
        arguments: { text: "x", mention: "someone-else" },
      });
      expect(result.isError).toBe(true);
      expect(createTask).not.toHaveBeenCalled();
      await client.close();
    });

    it("≥2 mentions: omitting `mention` is a tool error, never a classifier fallback", async () => {
      toolResults.setMentions("conv-2", [agent, dept]);
      const client = await connectFor("conv-2");
      const result = await client.callTool({ name: "create_task", arguments: { text: "x" } });
      expect(result.isError).toBe(true);
      expect(createTask).not.toHaveBeenCalled();
      await client.close();
    });

    it("≥2 mentions: a `mention` naming one not in the turn's list is a tool error", async () => {
      toolResults.setMentions("conv-2b", [agent, dept]);
      const client = await connectFor("conv-2b");
      const result = await client.callTool({
        name: "create_task",
        arguments: { text: "x", mention: "nope" },
      });
      expect(result.isError).toBe(true);
      expect(createTask).not.toHaveBeenCalled();
      await client.close();
    });

    it("≥2 mentions: a `mention` naming one of them resolves that unit as the explicit target", async () => {
      createTask.mockResolvedValue({ text: "ok" });
      toolResults.setMentions("conv-2c", [agent, dept]);
      const client = await connectFor("conv-2c");
      await client.callTool({
        name: "create_task",
        arguments: { text: "x", mention: "dev" },
      });
      expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ explicitTarget: dept }));
      await client.close();
    });

    it("forwards the turn's attachmentSetId to createTask", async () => {
      createTask.mockResolvedValue({ text: "ok" });
      toolResults.setAttachmentSetId("conv-attach", "set_9");
      const client = await connectFor("conv-attach");
      await client.callTool({ name: "create_task", arguments: { text: "x" } });
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ attachmentSetId: "set_9" }),
      );
      await client.close();
    });
  });
});
