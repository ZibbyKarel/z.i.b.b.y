import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { KB_MCP_BEARER_TOKEN, KbMcpAuthGuard } from "./kb-mcp-auth.guard";
import { KbMcpController } from "./kb-mcp.controller";
import type { KbHit, KbNote } from "./kb-reader.service";
import { KbReaderService } from "./kb-reader.service";
import type { KbRoot } from "./kb-scope.service";
import { KbScopeService } from "./kb-scope.service";

const vaultSource = (path: string): KnowledgeBaseSource => ({
  kind: "vault",
  path,
  readOnly: true,
});

const root = (over: Partial<KbRoot> & Pick<KbRoot, "teamId">): KbRoot => ({
  teamName: over.teamId,
  source: vaultSource(`/kb/${over.teamId}`),
  ...over,
});

const hit = (over: Partial<KbHit> & Pick<KbHit, "noteId">): KbHit => ({
  title: over.noteId,
  path: `wiki/${over.noteId}.md`,
  snippet: `snippet for ${over.noteId}`,
  ...over,
});

const rootsForRun = vi.fn<(runId: string | undefined, team?: string) => Promise<KbRoot[]>>();
const rootsForChat = vi.fn<(team?: string) => Promise<KbRoot[]>>();
const search =
  vi.fn<(source: KnowledgeBaseSource, query: string, limit?: number) => Promise<KbHit[]>>();
const read = vi.fn<(source: KnowledgeBaseSource, noteId: string) => Promise<KbNote | null>>();

describe("POST /api/kb/mcp — KbMcpController", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [KbMcpController],
      providers: [
        { provide: KbScopeService, useValue: { rootsForRun, rootsForChat } },
        { provide: KbReaderService, useValue: { search, read } },
        KbMcpAuthGuard,
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
    rootsForRun.mockReset();
    rootsForChat.mockReset();
    search.mockReset();
    read.mockReset();
  });

  /** Connect an authenticated MCP client, optionally carrying `X-Zibby-Run-Id`. */
  async function connect(runId?: string): Promise<Client> {
    const headers: Record<string, string> = { Authorization: `Bearer ${KB_MCP_BEARER_TOKEN}` };
    if (runId !== undefined) headers["X-Zibby-Run-Id"] = runId;
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/kb/mcp`), {
      requestInit: { headers },
    });
    const client = new Client({ name: "kb-mcp-test-client", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }

  function firstText(result: unknown): string {
    const content = (result as { content: Array<{ type: "text"; text: string }> }).content;
    return content[0]?.text ?? "";
  }

  it("registers no write tool — exactly the two read-only KB tools", async () => {
    rootsForChat.mockResolvedValue([]);
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["read_team_kb_note", "search_team_kb"]);
    await client.close();
  });

  it("exposes no path/directory parameter on either tool schema", async () => {
    rootsForChat.mockResolvedValue([]);
    const client = await connect();
    const { tools } = await client.listTools();
    const forbidden = ["path", "directory", "dir", "folder"];
    for (const tool of tools) {
      const props = Object.keys(
        (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
      );
      for (const bad of forbidden) {
        expect(props).not.toContain(bad);
      }
    }
    await client.close();
  });

  it("search_team_kb returns an empty result — not an error — when the scope is empty", async () => {
    rootsForChat.mockResolvedValue([]);
    const client = await connect();
    const result = await client.callTool({
      name: "search_team_kb",
      arguments: { query: "anything" },
    });
    expect((result as { isError?: boolean }).isError).not.toBe(true);
    expect(firstText(result)).toMatch(/no team knowledge base/i);
    expect(search).not.toHaveBeenCalled();
    await client.close();
  });

  it("read_team_kb_note returns an empty/null result when the scope is empty", async () => {
    rootsForChat.mockResolvedValue([]);
    const client = await connect();
    const result = await client.callTool({
      name: "read_team_kb_note",
      arguments: { noteId: "n1" },
    });
    expect((result as { isError?: boolean }).isError).not.toBe(true);
    expect(firstText(result)).toMatch(/no note/i);
    expect(read).not.toHaveBeenCalled();
    await client.close();
  });

  it("search_team_kb caps merged hits across roots at 8", async () => {
    const rootA = root({ teamId: "devrel" });
    const rootB = root({ teamId: "platform" });
    rootsForChat.mockResolvedValue([rootA, rootB]);
    search.mockImplementation(async (source) => {
      const prefix = source === rootA.source ? "a" : "b";
      return Array.from({ length: 5 }, (_, i) => hit({ noteId: `${prefix}${i}` }));
    });
    const client = await connect();
    const result = await client.callTool({ name: "search_team_kb", arguments: { query: "x" } });
    const textOut = firstText(result);
    // Every emitted citation line starts with "- [" — count them, don't just eyeball length.
    const citationCount = (textOut.match(/^- \[/gm) ?? []).length;
    expect(citationCount).toBe(8);
    await client.close();
  });

  it("search_team_kb passes every snippet through envelopeInbound", async () => {
    const oneRoot = root({ teamId: "devrel" });
    rootsForChat.mockResolvedValue([oneRoot]);
    search.mockResolvedValue([
      hit({ noteId: "n1", snippet: "UNIQUE_SNIPPET_ONE" }),
      hit({ noteId: "n2", snippet: "UNIQUE_SNIPPET_TWO" }),
    ]);
    const client = await connect();
    const result = await client.callTool({ name: "search_team_kb", arguments: { query: "x" } });
    const textOut = firstText(result);
    // The envelope's structural markers must appear once per hit — a plain,
    // un-enveloped snippet would contain the raw text but NONE of this framing.
    expect((textOut.match(/untrusted inbound channel data/g) ?? []).length).toBe(2);
    expect(textOut).toMatch(/<<<zibby-data-[0-9a-f]+>>>/);
    expect(textOut).toContain("UNIQUE_SNIPPET_ONE");
    expect(textOut).toContain("UNIQUE_SNIPPET_TWO");
    await client.close();
  });

  it("search_team_kb cites team id + repo-relative path, never an absolute host path", async () => {
    const ABSOLUTE_ROOT = "/Users/host/secret-vault-path";
    const oneRoot: KbRoot = {
      teamId: "devrel",
      teamName: "DevRel",
      source: vaultSource(ABSOLUTE_ROOT),
    };
    rootsForChat.mockResolvedValue([oneRoot]);
    search.mockResolvedValue([hit({ noteId: "n1", path: "wiki/notes/foo.md" })]);
    const client = await connect();
    const result = await client.callTool({ name: "search_team_kb", arguments: { query: "x" } });
    const textOut = firstText(result);
    expect(textOut).toContain("devrel");
    expect(textOut).toContain("wiki/notes/foo.md");
    expect(textOut).not.toContain(ABSOLUTE_ROOT);
    await client.close();
  });

  it("resolves scope via rootsForRun when X-Zibby-Run-Id is present, rootsForChat otherwise", async () => {
    rootsForRun.mockResolvedValue([]);
    rootsForChat.mockResolvedValue([]);

    const withRunId = await connect("codex_1000_4321");
    await withRunId.callTool({ name: "search_team_kb", arguments: { query: "x" } });
    expect(rootsForRun).toHaveBeenCalledWith("codex_1000_4321", undefined);
    expect(rootsForChat).not.toHaveBeenCalled();
    await withRunId.close();

    rootsForRun.mockReset();
    rootsForChat.mockReset();
    rootsForRun.mockResolvedValue([]);
    rootsForChat.mockResolvedValue([]);

    const withoutRunId = await connect();
    await withoutRunId.callTool({ name: "search_team_kb", arguments: { query: "x" } });
    expect(rootsForChat).toHaveBeenCalledWith(undefined);
    expect(rootsForRun).not.toHaveBeenCalled();
    await withoutRunId.close();
  });
});
