import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CreateMcpServerInput } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidMcpServerIdError,
  McpServerConflictError,
  McpServerNotFoundError,
} from "./mcp.errors";
import { McpServersStorageService } from "./mcp.storage.service";

const sample: CreateMcpServerInput = {
  id: "context7",
  type: "http",
  name: "Context7",
  url: "https://mcp.context7.com/mcp",
};
const fileFor = (dir: string, id: string) => path.join(dir, `${id}.json`);

describe("McpServersStorageService", () => {
  let dir: string;
  let service: McpServersStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-test-"));
    service = new McpServersStorageService(dir);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
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
});
