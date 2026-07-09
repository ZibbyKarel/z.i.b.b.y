import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SearchHit, Skill } from "@zibby/contracts";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AutomationsStorageService } from "../automations/automations.storage.service";
import { ChainsStorageService } from "../chains/chains.storage.service";
import { CommandsStorageService } from "../commands/commands.storage.service";
import { CompaniesStorageService } from "../companies/companies.storage.service";
import { GoalsStorageService } from "../goals/goals.storage.service";
import { HooksStorageService } from "../hooks/hooks.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { McpServersStorageService } from "../mcp/mcp.storage.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { EntityMcpController } from "./entity-mcp.controller";
import { VaultService } from "./vault.service";

const skillsList = vi.fn<() => Promise<Skill[]>>();
const search = vi.fn<(query: string) => Promise<SearchHit[]>>();
const emptyList = () => vi.fn().mockResolvedValue([]);

/**
 * HTTP e2e for the entity-directory MCP server (Phase 106) — same minimal
 * testing-module shape as `../tasks/tasks-attachments.test.ts`: only the
 * controller + stubbed storage services, no full module tree. There is no
 * existing test for `ChatMcpController` to mirror (its transport wiring has
 * never been exercised end to end in this repo), so this drives the REAL
 * `StreamableHTTPServerTransport` over a real listening port with the MCP
 * SDK's own client (`Client` + `StreamableHTTPClientTransport`), rather than
 * hand-rolling the JSON-RPC framing — the surest way to prove the stateless
 * (`sessionIdGenerator: undefined`) wiring actually round-trips.
 */
describe("POST /api/memory/mcp", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EntityMcpController],
      providers: [
        { provide: VaultService, useValue: { search } },
        { provide: SkillsStorageService, useValue: { list: skillsList } },
        { provide: McpServersStorageService, useValue: { list: emptyList() } },
        { provide: CommandsStorageService, useValue: { list: emptyList() } },
        { provide: HooksStorageService, useValue: { list: emptyList() } },
        { provide: ProjectsStorageService, useValue: { list: emptyList() } },
        { provide: CompaniesStorageService, useValue: { list: emptyList() } },
        { provide: ChainsStorageService, useValue: { list: emptyList() } },
        { provide: IntegrationsStorageService, useValue: { list: emptyList() } },
        { provide: GoalsStorageService, useValue: { list: emptyList() } },
        { provide: AutomationsStorageService, useValue: { list: emptyList() } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    skillsList.mockReset();
    search.mockReset();
  });

  /** Fresh MCP client + transport per call — the server is stateless, so each
   *  request starts its own session-less round trip (mirrors a real run). */
  async function connectClient(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/memory/mcp`));
    const client = new Client({ name: "entity-mcp-test-client", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }

  function firstTextContent(result: unknown): string {
    const content = (result as { content: Array<{ type: "text"; text: string }> }).content;
    const first = content[0];
    if (!first) throw new Error("expected at least one text content block");
    return first.text;
  }

  it("rejects GET with a 405, Allow: POST, and a JSON-RPC -32000 body", async () => {
    const res = await request(app.getHttpServer()).get("/api/memory/mcp");
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe("POST");
    // `rejectGet` (mirroring `ChatMcpController` verbatim) writes the JSON-RPC
    // body via `res.end()` without a Content-Type header, so supertest doesn't
    // auto-parse it into `res.body` — parse the raw text instead.
    expect(JSON.parse(res.text)).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 } });
  });

  it("serves a valid MCP tool list: list_entities + recall_memory", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["list_entities", "recall_memory"]);
    await client.close();
  });

  it("list_entities reduces the storage service's catalog to id/name/description", async () => {
    skillsList.mockResolvedValue([
      { id: "graphify", name: "Graphify", desc: "Knowledge graph." },
    ] as Skill[]);

    const client = await connectClient();
    const result = await client.callTool({ name: "list_entities", arguments: { kind: "skills" } });
    expect(JSON.parse(firstTextContent(result))).toEqual([
      { id: "graphify", name: "Graphify", description: "Knowledge graph." },
    ]);
    await client.close();
  });

  it("list_entities filters by a case-insensitive substring over id/name/description", async () => {
    skillsList.mockResolvedValue([
      { id: "graphify", name: "Graphify", desc: "Knowledge graph." },
      { id: "design-system", name: "Design System", desc: "DS conventions." },
    ] as Skill[]);

    const client = await connectClient();
    const result = await client.callTool({
      name: "list_entities",
      arguments: { kind: "skills", query: "GRAPH" },
    });
    expect(JSON.parse(firstTextContent(result))).toEqual([
      { id: "graphify", name: "Graphify", description: "Knowledge graph." },
    ]);
    await client.close();
  });

  it("fails open: a storage hiccup returns [] instead of throwing the tool", async () => {
    skillsList.mockRejectedValue(new Error("disk on fire"));

    const client = await connectClient();
    const result = await client.callTool({ name: "list_entities", arguments: { kind: "skills" } });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(firstTextContent(result))).toEqual([]);
    await client.close();
  });

  it("recall_memory delegates to the vault search via the shared recall helper", async () => {
    search.mockResolvedValue([
      { id: "n1", title: "Calendar integration", tier: "memory", snippet: "service-account auth" },
    ]);

    const client = await connectClient();
    const result = await client.callTool({ name: "recall_memory", arguments: { query: "calendar" } });
    const text = firstTextContent(result);
    expect(text).toContain("Calendar integration");
    expect(text).toContain("service-account auth");
    expect(search).toHaveBeenCalledWith("calendar");
    await client.close();
  });
});
