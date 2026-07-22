import type { IncomingMessage, ServerResponse } from "node:http";
import { Controller, Get, Logger, Post, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { AutomationsStorageService } from "../automations/automations.storage.service";
import { CommandsStorageService } from "../commands/commands.storage.service";
import { CompaniesStorageService } from "../companies/companies.storage.service";
import { GoalsStorageService } from "../goals/goals.storage.service";
import { HooksStorageService } from "../hooks/hooks.storage.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { McpServersStorageService } from "../mcp/mcp.storage.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { recallMemory } from "./recall.helper";
import { VaultService } from "./vault.service";

/** The catalogs `list_entities` can enumerate — every non-agent/pipeline entity
 * kind (agents/pipelines are already baked into self-knowledge; see decision 2
 * of the phase-105 master plan). */
const ENTITY_KINDS = [
  "skills",
  "mcp",
  "commands",
  "hooks",
  "projects",
  "companies",
  "integrations",
  "goals",
  "automations",
] as const;
type EntityKind = (typeof ENTITY_KINDS)[number];

/** The compact shape every entity is reduced to for the tool's payload. */
interface EntitySummary {
  id: string;
  name?: string;
  description?: string;
}

/** Wrap a tool's string result in the MCP text-content envelope. */
function text(value: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: value }] };
}

/**
 * Reduce an arbitrary catalog entity to `{id, name?, description?}` for the
 * tool payload. Entities across kinds don't share one schema (some have
 * `desc`, some `description`, integrations have neither but do have `kind`),
 * so this reads defensively off an unknown record rather than assuming a
 * common interface.
 */
function toSummary(entity: unknown): EntitySummary {
  const record = entity as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const name = typeof record.name === "string" ? record.name : undefined;
  const description =
    typeof record.description === "string"
      ? record.description
      : typeof record.desc === "string"
        ? record.desc
        : typeof record.kind === "string"
          ? record.kind
          : undefined;
  return {
    id,
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
  };
}

/** Case-insensitive substring filter over id/name/description — same posture as `recall_memory`. */
function filterByQuery(summaries: EntitySummary[], query: string): EntitySummary[] {
  const q = query.toLowerCase();
  return summaries.filter(
    (s) =>
      s.id.toLowerCase().includes(q) ||
      (s.name?.toLowerCase().includes(q) ?? false) ||
      (s.description?.toLowerCase().includes(q) ?? false),
  );
}

/**
 * The entity-directory tools exposed to the `claude` CLI as an HTTP MCP server,
 * hosted INSIDE the api (no second process) — mirrors `ChatMcpController`
 * verbatim (stateless per-request {@link McpServer} +
 * {@link StreamableHTTPServerTransport}), but is NOT scoped to a chat
 * conversation: any run granted this server (via the seeded `zibby-entities`
 * `McpServer` row — see `McpServersStorageService.seedSystem`) can look up
 * skills/mcp/commands/hooks/projects/companies/integrations/goals/
 * automations by kind, and recall prose from the vault — distinct in kind from
 * self-knowledge's always-injected AUTO blocks (decision 4 of the phase-105
 * master plan): structured, on-demand lookup rather than a pushed snapshot.
 *
 * Stateless transport (`sessionIdGenerator: undefined`, `enableJsonResponse: true`):
 * one fresh {@link McpServer} + {@link StreamableHTTPServerTransport} per POST,
 * closed when the response ends — no session table, safe under concurrent runs.
 * GET is a 405 (no server-initiated streaming needed; tools are request/response).
 */
@Controller()
export class EntityMcpController {
  private readonly logger = new Logger(EntityMcpController.name);

  constructor(
    private readonly vault: VaultService,
    private readonly skills: SkillsStorageService,
    private readonly mcpServers: McpServersStorageService,
    private readonly commands: CommandsStorageService,
    private readonly hooks: HooksStorageService,
    private readonly projects: ProjectsStorageService,
    private readonly companies: CompaniesStorageService,
    private readonly integrations: IntegrationsStorageService,
    private readonly goals: GoalsStorageService,
    private readonly automations: AutomationsStorageService,
  ) {}

  @Post("api/memory/mcp")
  async handle(@Req() req: IncomingMessage, @Res() res: ServerResponse): Promise<void> {
    const server = this.buildServer();
    // Stateless: no session id, single JSON response per request (simplest round-trip).
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      // NestJS's body parser already drained the stream — pass the parsed body or the
      // transport reads an empty stream and hangs (the #1 NestJS-MCP failure mode).
      await transport.handleRequest(req, res, (req as { body?: unknown }).body);
    } catch (error) {
      this.logger.error(`memory mcp request failed: ${String(error)}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          }),
        );
      }
    }
  }

  @Get("api/memory/mcp")
  rejectGet(@Res() res: ServerResponse): void {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      }),
    );
  }

  /** Build a per-request MCP server with the entity-directory tools registered. */
  private buildServer(): McpServer {
    const server = new McpServer({ name: "zibby-entities", version: "1.0.0" });

    server.registerTool(
      "list_entities",
      {
        description:
          "List entities from a named ZIBBY catalog (skills, connected mcp servers, " +
          "slash commands, hooks, projects, companies, channel " +
          "integrations, goals, or automations). Optionally filter by a substring over " +
          "id/name/description. Read-only, structured — use this for a catalog lookup " +
          "instead of recall_memory (which searches prose in the vault).",
        inputSchema: {
          kind: z.enum(ENTITY_KINDS).describe("Which entity catalog to list."),
          query: z
            .string()
            .optional()
            .describe("Optional case-insensitive substring filter over id/name/description."),
        },
      },
      async ({ kind, query }) => text(JSON.stringify(await this.listEntities(kind, query))),
    );

    server.registerTool(
      "recall_memory",
      {
        description:
          "Search ZIBBY's second-brain memory (the Obsidian vault) and return the top " +
          "matching notes. Use when you need prose context/decisions/history rather than " +
          "a structured catalog entry — see list_entities for that.",
        inputSchema: {
          query: z.string().describe("What to look up in memory."),
        },
      },
      async ({ query }) => text(await recallMemory(this.vault, query)),
    );

    return server;
  }

  /**
   * Look up one catalog by kind, reduce it to compact summaries, and apply the
   * optional query filter. FAIL-OPEN: a storage hiccup (corrupt file, missing
   * dir, …) never throws the tool — it logs and returns `[]`, same posture as
   * every other fail-open write/read path in this codebase (grounding, the
   * nightly distiller, `RunRecorderService`).
   */
  private async listEntities(kind: EntityKind, query?: string): Promise<EntitySummary[]> {
    try {
      const raw = await this.rawList(kind);
      const summaries = raw.map(toSummary);
      return query ? filterByQuery(summaries, query) : summaries;
    } catch (error) {
      this.logger.warn(`list_entities(${kind}) failed: ${String(error)}`);
      return [];
    }
  }

  private async rawList(kind: EntityKind): Promise<unknown[]> {
    switch (kind) {
      case "skills":
        return this.skills.list();
      case "mcp":
        return this.mcpServers.list();
      case "commands":
        return this.commands.list();
      case "hooks":
        return this.hooks.list();
      case "projects":
        return this.projects.list();
      case "companies":
        return this.companies.list();
      case "integrations":
        return this.integrations.list();
      case "goals":
        return this.goals.list();
      case "automations":
        return this.automations.list();
    }
  }
}
