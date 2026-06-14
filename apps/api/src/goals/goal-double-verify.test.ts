import { describe, expect, it } from "vitest"
import type { Goal, Project } from "@zibby/contracts"
import type { LoggerService } from "../shared/logging/logger.service"
import type { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { GoalRunnerService } from "./goal-runner.service"

/**
 * Phase 12.6 — `makerAlreadyVerified` returns a synthesized satisfied verdict ONLY
 * when a pipeline maker provably ran the SAME checks the goal's checks verifier would
 * (the `verifyCommands` marker, set by the runner from real execution). Everything
 * else → null (verify normally). This is the pure decision; the e2e covers wiring.
 */
function makeService(pipelineRun: { verifyCommands?: string[] } | "throw"): GoalRunnerService {
  const noop = () => {}
  const logger = { child: () => ({ info: noop, warn: noop, error: noop }) } as unknown as LoggerService
  const pipelineRunner = {
    get: () => {
      if (pipelineRun === "throw") throw new Error("not found")
      return pipelineRun
    },
  } as unknown as PipelineRunnerService
  return new GoalRunnerService(
    "/tmp/goal-double-verify-test",
    null as never, // goals
    null as never, // agentRunner
    pipelineRunner,
    null as never, // projects
    null as never, // workspace
    null as never, // budget
    null as never, // activity
    logger,
    null as never, // trace
  )
}

const PROJECT: Project = { id: "proj", name: "proj", path: "/tmp/proj", checks: ["pnpm --filter app test"] }

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: "g",
    objective: "do it",
    maker: { kind: "pipeline", id: "delivery" },
    verifier: { kind: "checks" },
    maxIterations: 3,
    instructions: "iterate",
    ...over,
  }
}

function call(
  svc: GoalRunnerService,
  g: Goal,
  project: Project | null,
  status: string,
): unknown {
  return (
    svc as unknown as {
      makerAlreadyVerified: (g: Goal, p: Project | null, s: string, ref: string) => unknown
    }
  ).makerAlreadyVerified(g, project, status, "delivery_1")
}

describe("makerAlreadyVerified (12.6)", () => {
  it("skips when a pipeline maker ran the same project checks (verifier has no commands)", () => {
    const svc = makeService({ verifyCommands: ["pnpm --filter app test"] })
    const verdict = call(svc, goal(), PROJECT, "done") as { satisfied: boolean; kind: string } | null
    expect(verdict?.satisfied).toBe(true)
    expect(verdict?.kind).toBe("checks")
  })

  it("skips when explicit goal commands equal the maker's verify commands", () => {
    const svc = makeService({ verifyCommands: ["a", "b"] })
    const g = goal({ verifier: { kind: "checks", commands: ["a", "b"] } })
    expect((call(svc, g, PROJECT, "done") as { satisfied: boolean } | null)?.satisfied).toBe(true)
  })

  it("verifies normally when commands differ", () => {
    const svc = makeService({ verifyCommands: ["a", "b"] })
    const g = goal({ verifier: { kind: "checks", commands: ["a", "c"] } })
    expect(call(svc, g, PROJECT, "done")).toBeNull()
  })

  it("verifies normally for a claude verifier (independent judgment)", () => {
    const svc = makeService({ verifyCommands: ["pnpm --filter app test"] })
    const g = goal({ verifier: { kind: "claude", agent: "code-review" } })
    expect(call(svc, g, PROJECT, "done")).toBeNull()
  })

  it("verifies normally for a non-pipeline maker", () => {
    const svc = makeService({ verifyCommands: ["pnpm --filter app test"] })
    const g = goal({ maker: { kind: "agent", id: "koder" } })
    expect(call(svc, g, PROJECT, "done")).toBeNull()
  })

  it("verifies normally when the maker did not finish done", () => {
    const svc = makeService({ verifyCommands: ["pnpm --filter app test"] })
    expect(call(svc, goal(), PROJECT, "failed")).toBeNull()
  })

  it("verifies normally when the maker pipeline ran no verify phase (no marker)", () => {
    const svc = makeService({}) // no verifyCommands
    expect(call(svc, goal(), PROJECT, "done")).toBeNull()
  })

  it("verifies normally when the maker run was already pruned", () => {
    const svc = makeService("throw")
    expect(call(svc, goal(), PROJECT, "done")).toBeNull()
  })
})
