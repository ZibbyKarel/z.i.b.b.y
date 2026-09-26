import { Injectable } from "@nestjs/common";
import type { Agent, DepartmentId, McpServer, RegistryBindings } from "@zibby/contracts";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { CommandsStorageService } from "../commands/commands.storage.service";
import { HooksStorageService } from "../hooks/hooks.storage.service";
import { McpServersStorageService } from "../mcp/mcp.storage.service";
import { SkillsStorageService } from "../skills/skills.storage.service";

/** Does an agent's flat tool grant list reference this MCP server? */
function grantsMcpServer(tools: readonly string[] | undefined, serverId: string): boolean {
  if (!tools) return false;
  return tools.some(
    (t) => t === serverId || t === `mcp__${serverId}` || t.startsWith(`mcp__${serverId}__`),
  );
}

function sortedUnique(ids: Iterable<DepartmentId>): DepartmentId[] {
  return [...new Set(ids)].sort();
}

/**
 * Computes `/api/registries/bindings` (O-09) — see `registry-bindings.schema.ts`
 * for the derivation rule this implements: `mcp` bindings come from each active
 * agent's `tools`/`optionalTools` grants; `skills`/`hooks`/`commands` are
 * materialized into every run, so they bind to every department with at least
 * one active employee.
 */
@Injectable()
export class RegistriesService {
  constructor(
    private readonly agents: AgentsStorageService,
    private readonly skills: SkillsStorageService,
    private readonly hooks: HooksStorageService,
    private readonly mcpServers: McpServersStorageService,
    private readonly commands: CommandsStorageService,
  ) {}

  async getBindings(): Promise<RegistryBindings> {
    const [agents, skills, hooks, mcpServers, commands] = await Promise.all([
      this.agents.listActive(),
      this.skills.list(),
      this.hooks.list(),
      this.mcpServers.list(),
      this.commands.list(),
    ]);

    const staffedDepartments = sortedUnique(
      agents.flatMap((a): DepartmentId[] => (a.department ? [a.department] : [])),
    );

    const mcp: Record<string, DepartmentId[]> = {};
    for (const server of mcpServers as McpServer[]) {
      mcp[server.id] = sortedUnique(
        agents.flatMap((a: Agent): DepartmentId[] =>
          a.department &&
          (grantsMcpServer(a.tools, server.id) || grantsMcpServer(a.optionalTools, server.id))
            ? [a.department]
            : [],
        ),
      );
    }

    const skillsBindings: Record<string, DepartmentId[]> = {};
    for (const skill of skills) skillsBindings[skill.id] = staffedDepartments;

    const hooksBindings: Record<string, DepartmentId[]> = {};
    for (const hook of hooks) hooksBindings[hook.id] = staffedDepartments;

    const commandsBindings: Record<string, DepartmentId[]> = {};
    for (const command of commands) commandsBindings[command.id] = staffedDepartments;

    return { skills: skillsBindings, mcp, hooks: hooksBindings, commands: commandsBindings };
  }
}
