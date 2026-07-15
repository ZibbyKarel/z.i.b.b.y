import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
});
