import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CreateMcpServerInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KB_MCP_BEARER_TOKEN } from "../kb/kb-mcp-auth.guard";
import { McpCredentialsStore } from "./mcp-credentials.store";
import {
  InvalidMcpServerIdError,
  McpServerConflictError,
  McpServerNotFoundError,
} from "./mcp.errors";
import {
  ENTITY_MCP_SERVER_ID,
  KB_MCP_SERVER_ID,
  McpServersStorageService,
} from "./mcp.storage.service";

const sample: CreateMcpServerInput = {
  id: "context7",
  type: "http",
  name: "Context7",
  url: "https://mcp.context7.com/mcp",
};
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.json`);

describe("McpServersStorageService", () => {
  let dir: string;
  let credDir: string;
  let credentials: McpCredentialsStore;
  let service: McpServersStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
    credDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-creds-test-"));
    credentials = new McpCredentialsStore(credDir);
    service = new McpServersStorageService(dir, credentials);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(credDir, { recursive: true, force: true });
  });

  it("persists with defaulted enabled and never writes hasCredentials", async () => {
    const created = await service.create(sample);
    expect(created.enabled).toBe(true);
    const onDisk = JSON.parse(await fs.readFile(fileFor(dir, "context7"), "utf8"));
    expect(onDisk).not.toHaveProperty("hasCredentials");
    expect((await service.get("context7")).hasCredentials).toBe(false);
  });

  it("rejects a duplicate id", async () => {
    await service.create(sample);
    await expect(service.create(sample)).rejects.toBeInstanceOf(McpServerConflictError);
  });

  it("404s on a missing server", async () => {
    await expect(service.get("nope")).rejects.toBeInstanceOf(McpServerNotFoundError);
  });

  it("keeps type immutable on update", async () => {
    await service.create(sample);
    const updated = await service.update("context7", { enabled: false });
    expect(updated.type).toBe("http");
    expect(updated.enabled).toBe(false);
  });

  it("refuses unsafe ids (path traversal)", async () => {
    for (const id of ["../../evil", "foo/bar", "..", "/etc/passwd"]) {
      await expect(service.create({ ...sample, id })).rejects.toBeInstanceOf(
        InvalidMcpServerIdError,
      );
    }
  });

  describe("seedSystem (Phase 106 — the entity-directory server)", () => {
    it("seeds the enabled zibby-entities http row on first onModuleInit", async () => {
      // `service` (from the outer beforeEach) has already gone through onModuleInit.
      const seeded = await service.get(ENTITY_MCP_SERVER_ID);
      expect(seeded.type).toBe("http");
      expect(seeded.enabled).toBe(true);
      expect(seeded.url).toContain("/api/memory/mcp");
    });

    it("is idempotent: a second onModuleInit does not clobber an operator edit", async () => {
      await service.update(ENTITY_MCP_SERVER_ID, { enabled: false });
      await service.onModuleInit();
      const reread = await service.get(ENTITY_MCP_SERVER_ID);
      expect(reread.enabled).toBe(false);
    });

    it("resolves the url's port from PORT, defaulting to 3333", async () => {
      const previousPort = process.env.PORT;
      try {
        process.env.PORT = "4444";
        const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-port-"));
        const otherCredDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-creds-test-port-"));
        const other = new McpServersStorageService(otherDir, new McpCredentialsStore(otherCredDir));
        await other.onModuleInit();
        const seeded = await other.get(ENTITY_MCP_SERVER_ID);
        expect(seeded.url).toBe("http://localhost:4444/api/memory/mcp");
        await fs.rm(otherDir, { recursive: true, force: true });
        await fs.rm(otherCredDir, { recursive: true, force: true });
      } finally {
        if (previousPort === undefined) delete process.env.PORT;
        else process.env.PORT = previousPort;
      }
    });
  });

  describe("seedSystem (Task 7b — the zibby-kb team-knowledge-base server)", () => {
    it("seeds the enabled zibby-kb http row on first onModuleInit", async () => {
      const seeded = await service.get(KB_MCP_SERVER_ID);
      expect(seeded.type).toBe("http");
      expect(seeded.enabled).toBe(true);
      expect(seeded.url).toContain("/api/kb/mcp");
    });

    it("is idempotent: a second onModuleInit does not clobber an operator edit", async () => {
      await service.update(KB_MCP_SERVER_ID, { enabled: false });
      await service.onModuleInit();
      const reread = await service.get(KB_MCP_SERVER_ID);
      expect(reread.enabled).toBe(false);
    });

    it("the persisted zibby-kb entity JSON never contains the bearer token (Law 3 hygiene)", async () => {
      const onDisk = await fs.readFile(fileFor(dir, KB_MCP_SERVER_ID), "utf8");
      expect(onDisk).not.toContain(KB_MCP_BEARER_TOKEN);
    });

    it("writes the current boot's bearer token into the credentials store", async () => {
      const creds = await credentials.read(KB_MCP_SERVER_ID);
      expect(creds?.authToken).toBe(KB_MCP_BEARER_TOKEN);
    });

    it("refreshes a STALE credential on every boot, even though the entity row itself is create-if-absent", async () => {
      // Simulate a credential left over from a PRIOR boot (a different process, a
      // different random KB_MCP_BEARER_TOKEN value) — a naive "only seed if absent"
      // implementation (copy-pasting the entity row's idempotent rule onto the
      // credential too) would leave this stale value in place, 401-ing every run
      // against the CURRENT boot's guard forever after a restart.
      await credentials.write(KB_MCP_SERVER_ID, { authToken: "stale-token-from-a-prior-boot" });
      await service.onModuleInit();
      const creds = await credentials.read(KB_MCP_SERVER_ID);
      expect(creds?.authToken).toBe(KB_MCP_BEARER_TOKEN);
    });
  });
});
