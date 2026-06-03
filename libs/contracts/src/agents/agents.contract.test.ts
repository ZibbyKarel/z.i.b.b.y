import { describe, expect, it } from "vitest"
import {
  AGENT_ID_REGEX,
  AgentSchema,
  CreateAgentSchema,
  UpdateAgentSchema,
  agentsContract,
} from "../index"

describe("agentsContract", () => {
  it("exposes the five CRUD routes with the expected methods and paths", () => {
    expect(agentsContract.createAgent.method).toBe("POST")
    expect(agentsContract.createAgent.path).toBe("/api/agents")

    expect(agentsContract.listAgents.method).toBe("GET")
    expect(agentsContract.listAgents.path).toBe("/api/agents")

    expect(agentsContract.getAgent.method).toBe("GET")
    expect(agentsContract.getAgent.path).toBe("/api/agents/:id")

    expect(agentsContract.updateAgent.method).toBe("PATCH")
    expect(agentsContract.updateAgent.path).toBe("/api/agents/:id")

    expect(agentsContract.deleteAgent.method).toBe("DELETE")
    expect(agentsContract.deleteAgent.path).toBe("/api/agents/:id")
  })

  it("declares the error responses required by the task", () => {
    expect(agentsContract.createAgent.responses).toHaveProperty("201")
    expect(agentsContract.createAgent.responses).toHaveProperty("409")

    for (const route of [
      agentsContract.getAgent,
      agentsContract.updateAgent,
      agentsContract.deleteAgent,
    ]) {
      expect(route.responses).toHaveProperty("404")
    }
  })
})

describe("agent schemas", () => {
  it("accepts a well-formed create body", () => {
    const parsed = CreateAgentSchema.safeParse({
      id: "code-reviewer",
      instructions: "Review pull requests.",
    })
    expect(parsed.success).toBe(true)
  })

  it("treats every update field as optional", () => {
    expect(UpdateAgentSchema.safeParse({}).success).toBe(true)
    expect(UpdateAgentSchema.safeParse({ instructions: "x" }).success).toBe(true)
  })

  it("rejects path-traversal-shaped ids at the schema boundary", () => {
    for (const id of ["../../evil", "foo/bar", "/etc/passwd", "..", "", "a/../b"]) {
      expect(AGENT_ID_REGEX.test(id)).toBe(false)
      expect(CreateAgentSchema.safeParse({ id, instructions: "i" }).success).toBe(false)
    }
  })

  it("requires non-empty instructions on the full entity", () => {
    const ok = AgentSchema.safeParse({ id: "a", instructions: "i" })
    expect(ok.success).toBe(true)

    const bad = AgentSchema.safeParse({ id: "a", instructions: "" })
    expect(bad.success).toBe(false)
  })
})
