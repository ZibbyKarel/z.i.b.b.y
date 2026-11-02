import { describe, expect, it, vi } from "vitest";
import { WorkflowRunnerService } from "./workflow-runner.service";

type Resolve = (project: unknown, tool?: boolean) => Promise<Record<string, string> | undefined>;

/** Only `resolveProjectEnv` is exercised, so the rest of the constructor is left undefined. */
function resolver(secrets: Record<string, string> | null, key: string | null): Resolve {
  const fake = {
    projectSecrets: { read: vi.fn(async () => secrets) },
    aiProviders: { env: vi.fn(async () => (key ? { OPENAI_API_KEY: key } : {})) },
  };
  return (project, tool = true) =>
    (
      WorkflowRunnerService.prototype as unknown as { resolveProjectEnv: Resolve }
    ).resolveProjectEnv.call(fake, project, tool);
}

describe("WorkflowRunnerService.resolveProjectEnv — global AI keys", () => {
  it("injects OPENAI_API_KEY even when the workflow has no project", async () => {
    expect(await resolver(null, "sk-global")(null)).toEqual({ OPENAI_API_KEY: "sk-global" });
  });

  it("never gives the global keys to an agent stage", async () => {
    expect(await resolver(null, "sk-global")(null, false)).toBeUndefined();
    expect(await resolver(null, "sk-global")({ id: "p", env: { A: "1" } }, false)).toEqual({
      A: "1",
    });
  });

  it("is undefined with no project and no global key", async () => {
    expect(await resolver(null, null)(null)).toBeUndefined();
  });

  it("precedence: global < project env < project secrets", async () => {
    const project = { id: "p", env: { OPENAI_API_KEY: "sk-project", A: "1" } };
    expect(await resolver(null, "sk-global")(project)).toEqual({
      OPENAI_API_KEY: "sk-project",
      A: "1",
    });
    expect(await resolver({ OPENAI_API_KEY: "sk-secret" }, "sk-global")(project)).toEqual({
      OPENAI_API_KEY: "sk-secret",
      A: "1",
    });
  });
});
