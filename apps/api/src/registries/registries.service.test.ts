import { describe, expect, it, vi } from "vitest";
import type { Agent, Command, Hook, McpServer, Skill } from "@zibby/contracts";
import { RegistriesService } from "./registries.service";

function fakeStore<T>(items: T[]) {
  return { list: vi.fn().mockResolvedValue(items) } as unknown as {
    list: () => Promise<T[]>;
  };
}

function agent(overrides: Partial<Agent>): Agent {
  return { id: "a", instructions: "do it", ...overrides };
}

describe("RegistriesService.getBindings", () => {
  it("binds mcp servers to the departments of agents whose tools/optionalTools grant them", async () => {
    const agents = {
      listActive: vi.fn().mockResolvedValue([
        agent({ id: "dev-1", department: "dev", tools: ["mcp__github__*"] }),
        agent({ id: "sec-1", department: "sec", optionalTools: ["github"] }),
        agent({ id: "qa-1", department: "qa", tools: ["Bash"] }),
        // No department — never contributes a binding.
        agent({ id: "unowned", tools: ["github"] }),
      ]),
    } as unknown as { listActive: () => Promise<Agent[]> };
    const servers: McpServer[] = [
      { id: "github", type: "http", enabled: true, hasCredentials: false },
    ];

    const service = new RegistriesService(
      agents as never,
      fakeStore<Skill>([]) as never,
      fakeStore<Hook>([]) as never,
      fakeStore<McpServer>(servers) as never,
      fakeStore<Command>([]) as never,
    );

    const bindings = await service.getBindings();
    expect(bindings.mcp.github).toEqual(["dev", "sec"]);
  });

  it("binds skills/hooks/commands to every department with an active employee", async () => {
    const agents = {
      listActive: vi
        .fn()
        .mockResolvedValue([
          agent({ id: "dev-1", department: "dev" }),
          agent({ id: "qa-1", department: "qa" }),
        ]),
    } as unknown as { listActive: () => Promise<Agent[]> };
    const skills: Skill[] = [{ id: "code-review", instructions: "review" }];
    const hooks: Hook[] = [{ id: "notify", event: "Stop", command: "echo hi", enabled: true }];
    const commands: Command[] = [{ id: "orchestrate", instructions: "go", enabled: true }];

    const service = new RegistriesService(
      agents as never,
      fakeStore<Skill>(skills) as never,
      fakeStore<Hook>(hooks) as never,
      fakeStore<McpServer>([]) as never,
      fakeStore<Command>(commands) as never,
    );

    const bindings = await service.getBindings();
    expect(bindings.skills["code-review"]).toEqual(["dev", "qa"]);
    expect(bindings.hooks.notify).toEqual(["dev", "qa"]);
    expect(bindings.commands.orchestrate).toEqual(["dev", "qa"]);
  });
});
