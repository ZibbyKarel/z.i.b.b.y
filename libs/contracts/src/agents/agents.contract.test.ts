import { describe, expect, it } from "vitest";
import { DeleteResponseSchema } from "../common.schema";
import {
  AGENT_ID_REGEX,
  AgentRunSchema,
  AgentSchema,
  CreateAgentSchema,
  RunLogChunkSchema,
  UpdateAgentSchema,
  agentRunsContract,
  agentsContract,
} from "../index";

describe("agentsContract", () => {
  it("exposes the five CRUD routes with the expected methods and paths", () => {
    expect(agentsContract.createAgent.method).toBe("POST");
    expect(agentsContract.createAgent.path).toBe("/api/agents");

    expect(agentsContract.listAgents.method).toBe("GET");
    expect(agentsContract.listAgents.path).toBe("/api/agents");

    expect(agentsContract.getAgent.method).toBe("GET");
    expect(agentsContract.getAgent.path).toBe("/api/agents/:id");

    expect(agentsContract.updateAgent.method).toBe("PATCH");
    expect(agentsContract.updateAgent.path).toBe("/api/agents/:id");

    expect(agentsContract.deleteAgent.method).toBe("DELETE");
    expect(agentsContract.deleteAgent.path).toBe("/api/agents/:id");
  });

  it("exposes a search route declared before the `:id` route", () => {
    expect(agentsContract.searchAgents.method).toBe("GET");
    expect(agentsContract.searchAgents.path).toBe("/api/agents/search");
    expect(agentsContract.searchAgents.responses).toHaveProperty("200");

    // The static `/search` route must precede `/:id` in the contract so the
    // router matches it as its own route rather than capturing it as an id.
    const keys = Object.keys(agentsContract);
    expect(keys.indexOf("searchAgents")).toBeLessThan(keys.indexOf("getAgent"));
  });

  it("declares the error responses required by the task", () => {
    expect(agentsContract.createAgent.responses).toHaveProperty("201");
    expect(agentsContract.createAgent.responses).toHaveProperty("409");

    for (const route of [
      agentsContract.getAgent,
      agentsContract.updateAgent,
      agentsContract.deleteAgent,
    ]) {
      expect(route.responses).toHaveProperty("404");
    }
  });

  it("deleteAgent's 200 response IS the shared DeleteResponseSchema (T11 dedup, finding #9)", () => {
    expect(agentsContract.deleteAgent.responses[200]).toBe(DeleteResponseSchema);
  });
});

describe("agentRunsContract", () => {
  it("exposes only the catalog-liveness running list (run lifecycle moved to /api/tasks/runs)", () => {
    expect(agentRunsContract.listRunning.method).toBe("GET");
    expect(agentRunsContract.listRunning.path).toBe("/api/agents/running");
    // The per-kind run routes are gone — a run is started only via a task, and
    // every run operation lives on the unified `taskRuns` contract.
    expect(agentRunsContract).not.toHaveProperty("startRun");
    expect(agentRunsContract).not.toHaveProperty("getRun");
    expect(agentRunsContract).not.toHaveProperty("getRunLogs");
    expect(agentRunsContract).not.toHaveProperty("stopRun");
    expect(agentRunsContract).not.toHaveProperty("deleteRun");
    expect(agentRunsContract).not.toHaveProperty("listRuns");
  });
});

describe("agent-run schema", () => {
  it("accepts a well-formed run", () => {
    const parsed = AgentRunSchema.safeParse({
      runId: "agent-007_1717400000000_4242",
      agentId: "agent-007",
      status: "running",
      pct: 40,
      prompt: "do the thing",
      project: "zibby-core",
      cwd: "/tmp/runs/agent-007_1717400000000",
      startedAt: new Date().toISOString(),
      pid: 4242,
      logFile: "/tmp/runs/agent-007_1717400000000_4242.log",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an out-of-range pct or an unknown status", () => {
    const base = {
      runId: "r",
      agentId: "a",
      prompt: "",
      project: "",
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      pid: 1,
      logFile: "/tmp/r.log",
    };
    expect(AgentRunSchema.safeParse({ ...base, status: "running", pct: 140 }).success).toBe(false);
    expect(AgentRunSchema.safeParse({ ...base, status: "paused", pct: 10 }).success).toBe(false);
  });
});

describe("run-log chunk schema", () => {
  it("requires a non-negative nextOffset", () => {
    expect(RunLogChunkSchema.safeParse({ content: "x", nextOffset: 0, done: false }).success).toBe(
      true,
    );
    expect(RunLogChunkSchema.safeParse({ content: "x", nextOffset: -1, done: false }).success).toBe(
      false,
    );
  });
});

describe("agent schemas", () => {
  it("accepts a well-formed create body", () => {
    const parsed = CreateAgentSchema.safeParse({
      id: "code-reviewer",
      instructions: "Review pull requests.",
    });
    expect(parsed.success).toBe(true);
  });

  it("treats every update field as optional", () => {
    expect(UpdateAgentSchema.safeParse({}).success).toBe(true);
    expect(UpdateAgentSchema.safeParse({ instructions: "x" }).success).toBe(true);
  });

  it("rejects path-traversal-shaped ids at the schema boundary", () => {
    for (const id of ["../../evil", "foo/bar", "/etc/passwd", "..", "", "a/../b"]) {
      expect(AGENT_ID_REGEX.test(id)).toBe(false);
      expect(CreateAgentSchema.safeParse({ id, instructions: "i" }).success).toBe(false);
    }
  });

  it("requires non-empty instructions on the full entity", () => {
    const ok = AgentSchema.safeParse({ id: "a", instructions: "i" });
    expect(ok.success).toBe(true);

    const bad = AgentSchema.safeParse({ id: "a", instructions: "" });
    expect(bad.success).toBe(false);
  });

  it("accepts and round-trips optionalTools (Phase 105 tool-grant ceiling)", () => {
    const parsed = AgentSchema.safeParse({
      id: "a",
      instructions: "i",
      tools: ["shell"],
      optionalTools: ["recall_memory", "list_entities"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.optionalTools).toEqual(["recall_memory", "list_entities"]);
    }
  });

  it("omitting optionalTools still validates (backwards compatible)", () => {
    const parsed = AgentSchema.safeParse({ id: "a", instructions: "i" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.optionalTools).toBeUndefined();
    }
  });

  describe("T11 finding #11 — name/description/glyph/category length caps (length only, not enums)", () => {
    const base = { id: "a", instructions: "i" };

    it("name: 256 passes, 257 rejects", () => {
      expect(AgentSchema.safeParse({ ...base, name: "x".repeat(256) }).success).toBe(true);
      expect(AgentSchema.safeParse({ ...base, name: "x".repeat(257) }).success).toBe(false);
    });

    it("description: 256 passes, 257 rejects", () => {
      expect(AgentSchema.safeParse({ ...base, description: "x".repeat(256) }).success).toBe(true);
      expect(AgentSchema.safeParse({ ...base, description: "x".repeat(257) }).success).toBe(
        false,
      );
    });

    it("glyph: 64 passes, 65 rejects — still free-form, not an enum", () => {
      expect(AgentSchema.safeParse({ ...base, glyph: "x".repeat(64) }).success).toBe(true);
      expect(AgentSchema.safeParse({ ...base, glyph: "x".repeat(65) }).success).toBe(false);
      // A brand-new, unshipped glyph value still parses (length-only, not a closed set).
      expect(AgentSchema.safeParse({ ...base, glyph: "a-glyph-nobody-shipped-yet" }).success).toBe(
        true,
      );
    });

    it("category: 64 passes, 65 rejects — still free-form, not an enum", () => {
      expect(AgentSchema.safeParse({ ...base, category: "x".repeat(64) }).success).toBe(true);
      expect(AgentSchema.safeParse({ ...base, category: "x".repeat(65) }).success).toBe(false);
      expect(
        AgentSchema.safeParse({ ...base, category: "a-category-nobody-shipped-yet" }).success,
      ).toBe(true);
    });
  });
});
