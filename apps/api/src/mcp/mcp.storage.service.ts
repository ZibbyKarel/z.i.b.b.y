import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateMcpServerInput,
  type McpServer,
  McpServerSchema,
  type UpdateMcpServerInput,
} from "@zibby/contracts";
import { KbMcpAuthService } from "../kb/kb-mcp-auth.service";
import { EntityFileStore } from "../shared/file-storage";
import { McpCredentialsStore } from "./mcp-credentials.store";
import {
  InvalidMcpServerIdError,
  McpServerConflictError,
  McpServerNotFoundError,
} from "./mcp.errors";

export const MCP_DIR = "MCP_DIR";

/** Stable id of the built-in entity-directory MCP server (Phase 106). */
export const ENTITY_MCP_SERVER_ID = "zibby-entities";

/** Stable id of the built-in, team-scoped, read-only knowledge-base MCP server (Task 7b). */
export const KB_MCP_SERVER_ID = "zibby-kb";

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

  constructor(
    @Inject(MCP_DIR) dir: string,
    private readonly credentials: McpCredentialsStore,
    private readonly kbAuth: KbMcpAuthService,
  ) {
    super(dir);
  }

  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.seedEntitiesServer();
    await this.seedKbServer();
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
  private async seedEntitiesServer(): Promise<void> {
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
        "(skills/mcp/commands/hooks/projects/companies/integrations/goals/" +
        "automations) plus recall_memory over the vault.",
      type: "http",
      url: `http://localhost:${port}/api/memory/mcp`,
      enabled: true,
    });
    await this.writeEntity(server);
  }

  /**
   * Ensure the built-in `zibby-kb` row exists (Task 7b — `KbMcpController`,
   * `apps/api/src/kb/kb-mcp.controller.ts`), and keep its bearer credential in
   * sync with the CURRENT boot's {@link KbMcpAuthService.runBearerToken}.
   *
   * **The RUN token, never the chat token** (fix round 1, F3): this row is
   * what `ClaudeRunCommandService.buildMcpConfig` folds into every agent/
   * pipeline run's `--mcp-config`, so it must carry the token that resolves
   * to `KbScopeService.rootsForRun` — the path that fails CLOSED without a
   * live run id. The chat token is never written here, and is not reachable
   * through `GET /api/mcp-servers` either way (see below).
   *
   * The entity row itself follows the same idempotent "create only if absent"
   * rule as {@link seedEntitiesServer} — an operator's edit (disabling it, say)
   * survives a restart. The CREDENTIAL is deliberately different: it is
   * OVERWRITTEN on every boot, unconditionally, because `KbMcpAuthService`'s
   * tokens are minted fresh per process (never persisted) — a credential left
   * over from a prior boot would 401 every run's call to this server after a
   * restart. `ClaudeRunCommandService.buildMcpConfig` reads this credential
   * fresh (live filesystem read) at EVERY run's spawn time, folding it into the
   * `Authorization: Bearer` header exactly like any other server's stored
   * `authToken` — so refreshing it once here, at boot, is sufficient; no
   * further invalidation/rotation logic is needed. The token itself is never
   * written into the entity row / `headers` field (that field is plain,
   * served-as-is over `GET /api/mcp-servers` — see `McpServerSchema`'s "Law 3 /
   * credentials hygiene" doc) — only into the separate, gitignored credentials
   * store, exactly the channel `authToken` already exists for.
   */
  private async seedKbServer(): Promise<void> {
    let existing: McpServer | null = null;
    try {
      existing = await this.get(KB_MCP_SERVER_ID);
    } catch (error) {
      if (!(error instanceof McpServerNotFoundError)) throw error;
    }
    if (!existing) {
      const port = Number(process.env.PORT ?? 3333);
      const server = McpServerSchema.parse({
        id: KB_MCP_SERVER_ID,
        name: "ZIBBY team knowledge base",
        desc:
          "Read-only, team-scoped knowledge-base search/read (search_team_kb, " +
          "read_team_kb_note) — see docs/api/teams.md.",
        type: "http",
        url: `http://localhost:${port}/api/kb/mcp`,
        enabled: true,
      });
      await this.writeEntity(server);
    }
    await this.credentials.write(KB_MCP_SERVER_ID, { authToken: this.kbAuth.runBearerToken });
  }

  async create(input: CreateMcpServerInput): Promise<McpServer> {
    const created = await this.createEntity(input.id, () => McpServerSchema.parse({ ...input }));
    if (created === null) throw new McpServerConflictError(input.id);
    return created;
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
