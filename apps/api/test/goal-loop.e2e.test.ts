import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { TaskSchedulerService } from "../src/tasks/task-scheduler.service"
import { ScheduledTasksStorageService } from "../src/tasks/scheduled-tasks.storage.service"

const exec = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
/** Verifier fixture: fails N times (marker-counted), then passes. */
const COUNTING_CHECK = path.resolve(HERE, "fixtures/counting-check.mjs")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(fn: () => Promise<T>, timeoutMs = 20000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(40)
  }
}

/** Init a throwaway git repo with one commit so the goal can cut a worktree. */
async function initGitRepo(dir: string): Promise<void> {
  await exec("git", ["init", "-q"], { cwd: dir })
  await exec("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"], {
    cwd: dir,
  })
}

const agentPhase = (id: string) => ({
  id,
  agent: "writer",
  consumes: `${id}.in`,
  produces: `${id}.out`,
  model: "sonnet",
  thinking: "medium",
})

describe("Goal loop API (e2e, demo maker)", () => {
  let app: INestApplication
  let goalsDir: string
  let goalRunsDir: string
  let pipelinesDir: string
  let pipelineRunsDir: string
  let projectsDir: string
  let tasksDir: string
  let vaultDir: string
  let markersDir: string
  let projectPath: string

  /** A goal whose `checks` verifier runs the counting fixture against a fresh marker. */
  async function makeGoal(id: string, failTimes: number, maxIterations: number): Promise<string> {
    const marker = path.join(markersDir, `${id}.marker`)
    await request(app.getHttpServer())
      .post("/api/goals")
      .send({
        id,
        objective: `Satisfy ${id}`,
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks", commands: [`node ${COUNTING_CHECK} ${marker} ${failTimes}`] },
        maxIterations,
        instructions: "Iterate until the check passes.",
      })
      .expect(201)
    return marker
  }

  async function runGoal(id: string): Promise<string> {
    const start = await request(app.getHttpServer())
      .post(`/api/goals/${id}/run`)
      .send({ project: "proj" })
      .expect(201)
    expect(start.body.status).toBe("running")
    return start.body.goalRunId
  }

  function getRun(goalRunId: string) {
    return request(app.getHttpServer()).get(`/api/goals/runs/${goalRunId}`).expect(200)
  }

  async function boot(): Promise<INestApplication> {
    process.env.GOALS_DIR = goalsDir
    process.env.GOAL_RUNS_DIR = goalRunsDir
    process.env.PIPELINES_DIR = pipelinesDir
    process.env.PIPELINE_RUNS_DIR = pipelineRunsDir
    process.env.PROJECTS_DIR = projectsDir
    process.env.TASKS_DIR = tasksDir
    process.env.VAULT_DIR = vaultDir
    process.env.TASK_TICK_MS = "0"
    process.env.AUTOMATION_TICK_MS = "0"
    process.env.AGENT_DEMO_STEPS = "1"
    process.env.AGENT_DEMO_DELAY_MS = "10"
    process.env.AGENT_RUNNER_MODE = "demo"
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    goalsDir = await fs.mkdtemp(path.join(os.tmpdir(), "goals-e2e-"))
    goalRunsDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-runs-e2e-"))
    pipelinesDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-pipelines-e2e-"))
    pipelineRunsDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-pipeline-runs-e2e-"))
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-projects-e2e-"))
    tasksDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-tasks-e2e-"))
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-vault-e2e-"))
    markersDir = await fs.mkdtemp(path.join(os.tmpdir(), "goal-markers-e2e-"))
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "goal-proj-"))
    await initGitRepo(projectPath)
    app = await boot()

    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "proj", name: "proj", path: projectPath })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({ id: "delivery", phases: [agentPhase("build")], instructions: "build it" })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of [
      goalsDir, goalRunsDir, pipelinesDir, pipelineRunsDir, projectsDir, tasksDir, vaultDir, markersDir, projectPath,
    ]) {
      await fs.rm(d, { recursive: true, force: true })
    }
    for (const k of [
      "GOALS_DIR", "GOAL_RUNS_DIR", "PIPELINES_DIR", "PIPELINE_RUNS_DIR", "PROJECTS_DIR",
      "TASKS_DIR", "VAULT_DIR", "TASK_TICK_MS", "AUTOMATION_TICK_MS", "AGENT_DEMO_STEPS",
      "AGENT_DEMO_DELAY_MS", "AGENT_RUNNER_MODE",
    ]) {
      delete process.env[k]
    }
  })

  it("cuts a worktree, runs one iteration to done when the verifier passes first try", async () => {
    await makeGoal("ship", 0, 3) // failTimes 0 → passes on the first check
    const goalRunId = await runGoal("ship")
    const start = (await getRun(goalRunId)).body
    expect(start.workspace?.branch ?? (await getRun(goalRunId)).body.workspace?.branch).toMatch(/^zibby\//)

    const final = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "running" ? res.body : null
    })
    expect(final.status).toBe("done")
    expect(final.iterations).toHaveLength(1)
    expect(final.iterations[0].verifier.satisfied).toBe(true)

    const raw = await fs.readFile(path.join(goalRunsDir, goalRunId, "run.json"), "utf8")
    expect(JSON.parse(raw).iterations).toHaveLength(1)
  })

  it("iterates maker → verifier until green (fails twice, then passes → 3 iterations)", async () => {
    await makeGoal("flaky", 2, 5)
    const goalRunId = await runGoal("flaky")
    const final = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "running" ? res.body : null
    })
    expect(final.status).toBe("done")
    expect(final.iterations).toHaveLength(3)
    expect(final.iterations[0].verifier.satisfied).toBe(false)
    expect(final.iterations[2].verifier.satisfied).toBe(true)
  })

  it("parks (reason iterations) when never green, then resume-with-note finishes it", async () => {
    // failTimes 2 with maxIterations 2 → both attempts fail → parked. Resume re-runs
    // the same iteration (3rd invocation of the marker) → passes → done.
    await makeGoal("persist", 2, 2)
    const goalRunId = await runGoal("persist")
    const parked = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status === "parked" ? res.body : null
    })
    expect(parked.parkedReason).toBe("iterations")
    expect(parked.parked.verdictFile).toContain("iteration-1.verdict.txt")
    const verdict = await fs.readFile(parked.parked.verdictFile, "utf8")
    expect(verdict).toContain("check failed")

    // 409 if we resume something not parked — sanity on a fresh non-parked goal.
    await request(app.getHttpServer())
      .post(`/api/goals/runs/${goalRunId}/resume`)
      .send({ note: "Try once more — the fix should be in." })
      .expect(200)

    const done = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "parked" && res.body.status !== "running" ? res.body : null
    })
    expect(done.status).toBe("done")
  })

  it("rejects resuming a non-parked run with 409", async () => {
    await makeGoal("notparked", 0, 3)
    const goalRunId = await runGoal("notparked")
    await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status === "done" ? res.body : null
    })
    await request(app.getHttpServer())
      .post(`/api/goals/runs/${goalRunId}/resume`)
      .send({})
      .expect(409)
  })

  it("a goal-targeted task dispatches through the goal runner and writes its outcome back", async () => {
    await makeGoal("tasked", 0, 3)
    const scheduler = app.get(TaskSchedulerService)
    const tasks = app.get(ScheduledTasksStorageService)

    const result = await scheduler.createTask(
      { text: "drive the tasked goal" },
      Date.now(),
      "proj",
      { kind: "goal", id: "tasked", name: "Satisfy tasked", glyph: "retry" },
    )
    expect(result.outcome).toBe("dispatched")
    if (result.outcome !== "dispatched") throw new Error("not dispatched")
    expect(result.target.kind).toBe("goal")
    expect(result.runRef).toMatch(/^tasked_/)

    const outcome = await until(async () => {
      const task = await tasks.get(result.task.id).catch(() => null)
      return task?.outcome ?? null
    })
    expect(["done", "error"]).toContain(outcome?.status)
  })

  it("survives an API restart mid-loop — reconstruct continues to done", async () => {
    await makeGoal("restartgoal", 0, 3)
    const goalRunId = await runGoal("restartgoal")

    // Kill the API while the maker iteration is in flight; its child dies with it.
    await app.close()
    // Re-boot against the same dirs: reconstruct sees a `running` goal whose maker
    // reconciled to a dead state and re-dispatches the iteration (continuation).
    app = await boot()

    const final = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "running" ? res.body : null
    })
    expect(final.status).toBe("done")
  })
})
