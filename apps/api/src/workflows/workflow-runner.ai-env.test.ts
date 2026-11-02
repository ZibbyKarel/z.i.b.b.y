import { describe, expect, it, vi } from "vitest";
import { WorkflowRunnerService } from "./workflow-runner.service";

type Resolve = (
  project: unknown,
  withGlobalKeys?: boolean,
) => Promise<Record<string, string> | undefined>;

/** Only `resolveProjectEnv` is exercised, so the rest of the constructor is left undefined. */
function resolver(secrets: Record<string, string> | null, key: string | null): Resolve {
  const fake = {
    projectSecrets: { read: vi.fn(async () => secrets) },
    aiProviders: { env: vi.fn(async () => (key ? { OPENAI_API_KEY: key } : {})) },
  };
  return (project, withGlobalKeys = true) =>
    (
      WorkflowRunnerService.prototype as unknown as { resolveProjectEnv: Resolve }
    ).resolveProjectEnv.call(fake, project, withGlobalKeys);
}

describe("WorkflowRunnerService.resolveProjectEnv — global AI keys", () => {
  it("injects OPENAI_API_KEY even when the workflow has no project", async () => {
    expect(await resolver(null, "sk-global")(null)).toEqual({ OPENAI_API_KEY: "sk-global" });
  });

  it("never gives the global keys to a claude agent stage", async () => {
    expect(await resolver(null, "sk-global")(null, false)).toBeUndefined();
    expect(await resolver(null, "sk-global")({ id: "p", env: { A: "1" } }, false)).toEqual({
      A: "1",
    });
  });

  it("an openaiModel agent stage gets the key (the call site passes true for it)", async () => {
    const env = { phase: { type: "agent", openaiModel: "gpt-6-luna" } } as const;
    const withKeys = env.phase.type === "agent" && Boolean(env.phase.openaiModel);
    expect(await resolver(null, "sk-global")(null, withKeys)).toEqual({
      OPENAI_API_KEY: "sk-global",
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
