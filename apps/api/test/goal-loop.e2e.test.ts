import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../src/app.module"
import { TaskSchedulerService } from "../src/tasks/task-scheduler.service"
import { ScheduledTasksStorageService } from "../src/tasks/scheduled-tasks.storage.service"

const exec = promisify(execFile)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until<T>(fn: () => Promise<T>, timeoutMs = 15000): Promise<T> {
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
  let projectPath: string

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
    // Pin demo mode — a local .env may force claude (memory: project_phase9_delivered).
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
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "goal-proj-"))
    await initGitRepo(projectPath)
    app = await boot()

    // A git project (so the goal cuts a worktree), a pipeline maker, and the goal.
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "proj", name: "proj", path: projectPath })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({ id: "delivery", phases: [agentPhase("build")], instructions: "build it" })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/goals")
      .send({
        id: "ship",
        objective: "Ship feature Y",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks" },
        maxIterations: 3,
        instructions: "Iterate until green.",
      })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of [goalsDir, goalRunsDir, pipelinesDir, pipelineRunsDir, projectsDir, tasksDir, vaultDir, projectPath]) {
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

  it("startGoalRun cuts a worktree, runs one iteration, and persists run.json", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/goals/ship/run")
      .send({ project: "proj" })
      .expect(201)
    const { goalRunId, status, workspace } = start.body
    expect(status).toBe("running")
    expect(workspace?.branch).toMatch(/^zibby\//)

    const final = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/goals/runs/${goalRunId}`).expect(200)
      return res.body.status !== "running" ? res.body : null
    })
    // Scaffold (10.1, no verifier yet): one iteration, then a terminal status.
    expect(["done", "failed"]).toContain(final.status)
    expect(final.iterations).toHaveLength(1)
    expect(final.iterations[0].makerKind).toBe("pipeline")
    expect(final.iterations[0].makerRunRef).toBeTruthy()

    // run.json is on disk under the run dir.
    const raw = await fs.readFile(path.join(goalRunsDir, goalRunId, "run.json"), "utf8")
    const persisted = JSON.parse(raw)
    expect(persisted.goalRunId).toBe(goalRunId)
    expect(persisted.iterations).toHaveLength(1)
  })

  it("a goal-targeted task dispatches through the goal runner and writes its outcome back", async () => {
    const scheduler = app.get(TaskSchedulerService)
    const tasks = app.get(ScheduledTasksStorageService)

    const result = await scheduler.createTask(
      { text: "drive the ship goal" },
      Date.now(),
      "proj",
      { kind: "goal", id: "ship", name: "Ship feature Y", glyph: "retry" },
    )
    expect(result.outcome).toBe("dispatched")
    if (result.outcome !== "dispatched") throw new Error("not dispatched")
    expect(result.target.kind).toBe("goal")
    // The run ref is a goal run id (goalId_<ts>).
    expect(result.runRef).toMatch(/^ship_/)

    const outcome = await until(async () => {
      const task = await tasks.get(result.task.id).catch(() => null)
      return task?.outcome ?? null
    })
    expect(["done", "error"]).toContain(outcome?.status)
  })
})
