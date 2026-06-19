import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateMcpServerInput,
  type McpServer,
  McpServerSchema,
  type UpdateMcpServerInput,
} from "@zibby/contracts";
import { EntityFileStore, safeJson } from "../shared/file-storage";
import {
  InvalidMcpServerIdError,
  McpServerConflictError,
  McpServerNotFoundError,
} from "./mcp.errors";

export const MCP_DIR = "MCP_DIR";

/**
 * Durable, file-backed persistence for MCP servers — one `<id>.json` each.
 * `hasCredentials` is intentionally NOT persisted — it's a read-time computation
 * the controller layers on from the credentials store — so it's stripped on
 * serialize and defaulted on parse (the schema default is `false`). Same JSON
 * store pattern as integrations; there is intentionally no database.
 */
@Injectable()
export class McpServersStorageService extends EntityFileStore<McpServer> implements OnModuleInit {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(MCP_DIR) dir: string) {
    super(dir);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir();
  }

  async create(input: CreateMcpServerInput): Promise<McpServer> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) throw new McpServerConflictError(input.id);
    const server = McpServerSchema.parse({ ...input });
    await this.writeEntity(server);
    return server;
  }

  async update(id: string, patch: UpdateMcpServerInput): Promise<McpServer> {
    const existing = await this.get(id);
    // Identity + transport type are immutable; everything else is a partial overwrite.
    const merged: McpServer = { ...existing, ...patch, id: existing.id, type: existing.type };
    await this.writeEntity(merged);
    return merged;
  }

  protected idOf(server: McpServer): string {
    return server.id;
  }

  protected serialize(server: McpServer): string {
    // `hasCredentials` is computed at read time — never persist it.
    const persisted: Partial<McpServer> = { ...server };
    delete persisted.hasCredentials;
    return JSON.stringify(persisted);
  }

  protected tryParse(raw: string): McpServer | null {
    const parsed = McpServerSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
  }

  protected compare(a: McpServer, b: McpServer): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new McpServerNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidMcpServerIdError(id);
  }
}
