import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateMcpServerInput,
  type McpServer,
  McpServerSchema,
  type UpdateMcpServerInput,
} from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";
import {
  InvalidMcpServerIdError,
  McpServerConflictError,
  McpServerNotFoundError,
} from "./mcp.errors";

export const MCP_DIR = "MCP_DIR";

/** Stable id of the built-in entity-directory MCP server (Phase 106). */
export const ENTITY_MCP_SERVER_ID = "zibby-entities";

/**
 * Durable, file-backed persistence for MCP servers — one `<id>.json` each.
 * `hasCredentials` is intentionally NOT persisted — it's a read-time computation
 * the controller layers on from the credentials store — so it's stripped on
 * serialize and defaulted on parse (the schema default is `false`). Same JSON
 * store pattern as integrations; there is intentionally no database.
 */
@Injectable()
export class McpServersStorageService extends EntityFileStore<McpServer> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;

  constructor(@Inject(MCP_DIR) dir: string) {
    super(dir);
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.seedSystem();
  }

  /**
   * Ensure the built-in `zibby-entities` row exists — nothing seeded
   * `data/mcp-servers` before Phase 106, so without this the entity-directory
   * MCP server (`EntityMcpController`, `apps/api/src/memory/entity-mcp.controller.ts`)
   * is never actually reachable from a run's `--mcp-config`. Idempotent (mirrors
   * `AutomationsStorageService.seedSystem`): only creates the row when absent —
   * an operator who disables or edits it afterwards keeps their change across
   * restarts, this never re-asserts fields on an existing row.
   */
  private async seedSystem(): Promise<void> {
    let existing: McpServer | null = null;
    try {
      existing = await this.get(ENTITY_MCP_SERVER_ID);
    } catch (error) {
      if (!(error instanceof McpServerNotFoundError)) throw error;
    }
    if (existing) return;
    const port = Number(process.env.PORT ?? 3333);
    const server = McpServerSchema.parse({
      id: ENTITY_MCP_SERVER_ID,
      name: "ZIBBY entities",
      desc:
        "Internal entity directory: list_entities over ZIBBY's own catalogs " +
        "(skills/mcp/commands/hooks/projects/companies/chains/integrations/goals/" +
        "automations) plus recall_memory over the vault.",
      type: "http",
      url: `http://localhost:${port}/api/memory/mcp`,
      enabled: true,
    });
    await this.writeEntity(server);
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
    return this.parseJson(McpServerSchema, raw);
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
