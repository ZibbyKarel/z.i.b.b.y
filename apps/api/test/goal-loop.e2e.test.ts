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

  async function boot(autoResume = false): Promise<INestApplication> {
    // Phase 12.4: by default the boot gate parks live goals `awaiting-resume`
    // instead of auto-re-dispatching; `GOAL_AUTO_RESUME=1` restores auto-reconcile.
    if (autoResume) process.env.GOAL_AUTO_RESUME = "1"
    else delete process.env.GOAL_AUTO_RESUME
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
      "AGENT_DEMO_DELAY_MS", "AGENT_RUNNER_MODE", "GOAL_AUTO_RESUME",
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

  it("refuses an unscoped checks verifier — parks (verifier-scope), spawns no maker (12.1)", async () => {
    // A `{kind:"checks"}` verifier with NO commands, run against a project that has
    // NO checks of its own → would fall through to the full-repo DEFAULT_VERIFY_CHECKS.
    // The runner must refuse BEFORE dispatching any maker iteration.
    await request(app.getHttpServer())
      .post("/api/goals")
      .send({
        id: "noscope",
        objective: "Satisfy noscope",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks" },
        maxIterations: 3,
        instructions: "Should never run — no verifier scope.",
      })
      .expect(201)
    const goalRunId = await runGoal("noscope")

    const parked = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status === "parked" ? res.body : null
    })
    expect(parked.parkedReason).toBe("verifier-scope")
    // Parked before the loop → no maker iteration was ever dispatched.
    expect(parked.iterations).toHaveLength(0)
    const verdict = await fs.readFile(parked.parked.verdictFile, "utf8")
    expect(verdict).toMatch(/no verifier scope/)
  })

  it("refuses a scoped checks verifier with no project/worktree — parks (verifier-scope) (12.2)", async () => {
    // Explicit commands, but run with NO project → no worktree, no project path →
    // the only cwd would be run.cwd (inside the repo). Refuse rather than climb to root.
    await request(app.getHttpServer())
      .post("/api/goals")
      .send({
        id: "nocwd",
        objective: "Satisfy nocwd",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks", commands: ["true"] },
        maxIterations: 3,
        instructions: "Scoped, but nowhere safe to run.",
      })
      .expect(201)
    // Run WITHOUT a project (project is optional on the run endpoint).
    const start = await request(app.getHttpServer()).post("/api/goals/nocwd/run").send({}).expect(201)
    const goalRunId = start.body.goalRunId

    const parked = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status === "parked" ? res.body : null
    })
    expect(parked.parkedReason).toBe("verifier-scope")
    expect(parked.iterations).toHaveLength(0)
    const verdict = await fs.readFile(parked.parked.verdictFile, "utf8")
    expect(verdict).toMatch(/no workspace or project/)
  })

  it("parks (reason budget) when the goal's own dailyRuns budget is reached (13.1)", async () => {
    // Always-failing verifier (would loop to maxIterations), but budget.dailyRuns: 1 caps
    // it: iteration 0 runs (fails), then the budget guard parks before iteration 1.
    const marker = path.join(markersDir, "budgeted.marker")
    await request(app.getHttpServer())
      .post("/api/goals")
      .send({
        id: "budgeted",
        objective: "Satisfy budgeted",
        maker: { kind: "pipeline", id: "delivery" },
        verifier: { kind: "checks", commands: [`node ${COUNTING_CHECK} ${marker} 9`] },
        maxIterations: 5,
        budget: { dailyRuns: 1 },
        instructions: "iterate",
      })
      .expect(201)
    const goalRunId = await runGoal("budgeted")

    const parked = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status === "parked" ? res.body : null
    })
    expect(parked.parkedReason).toBe("budget")
    // Exactly one iteration ran before the windowed cap tripped.
    expect(parked.iterations).toHaveLength(1)
    expect(parked.iterations[0].verifier.satisfied).toBe(false)
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

  it("skips the goal verifier when the pipeline maker already passed an equivalent verify phase (12.6)", async () => {
    // A project whose checks trivially pass; a pipeline maker = agent → verify(project
    // checks); a goal whose checks verifier (no commands) would run the SAME checks.
    const vproj = await fs.mkdtemp(path.join(os.tmpdir(), "goal-vproj-"))
    await initGitRepo(vproj)
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "vproj", name: "vproj", path: vproj, checks: ["true"] })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/pipelines")
      .send({
        id: "vpipe",
        phases: [agentPhase("build"), { id: "v", type: "verify" }],
        instructions: "build then verify",
      })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/goals")
      .send({
        id: "doubleverify",
        objective: "Satisfy doubleverify",
        maker: { kind: "pipeline", id: "vpipe" },
        verifier: { kind: "checks" }, // no commands → resolves to vproj.checks = ["true"]
        maxIterations: 2,
        instructions: "iterate",
      })
      .expect(201)

    const start = await request(app.getHttpServer())
      .post("/api/goals/doubleverify/run")
      .send({ project: "vproj" })
      .expect(201)
    const goalRunId = start.body.goalRunId

    const final = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "running" ? res.body : null
    })
    expect(final.status).toBe("done")
    expect(final.iterations).toHaveLength(1) // satisfied on iteration 0, no second pass
    expect(final.iterations[0].verifier.satisfied).toBe(true)
    // The synthesized verdict proves the goal verifier was SKIPPED, not re-run.
    expect(final.iterations[0].verifier.output).toMatch(/skipped a redundant re-run/)

    await fs.rm(vproj, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  })

  it("default boot gate (Law 3): restart parks the goal awaiting-resume — no auto-dispatch", async () => {
    // A looping goal (fails 5×, 10 iterations) is reliably still running when we kill
    // the API right after dispatch. On default reboot the boot gate must rehydrate it
    // and park it `awaiting-resume` — NOT silently re-dispatch a maker (Tier 3).
    await makeGoal("gated", 5, 10)
    const goalRunId = await runGoal("gated")
    await app.close()
    app = await boot() // default: gate ON

    const parked = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status === "parked" ? res.body : null
    })
    expect(parked.parkedReason).toBe("awaiting-resume")

    // The operator resumes explicitly → it continues to done (continuation, not restart).
    await request(app.getHttpServer())
      .post(`/api/goals/runs/${goalRunId}/resume`)
      .send({ note: "ok, continue" })
      .expect(200)
    const done = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "parked" && res.body.status !== "running" ? res.body : null
    })
    expect(done.status).toBe("done")
  })

  it("survives an API restart mid-loop with GOAL_AUTO_RESUME=1 — reconstruct continues to done", async () => {
    await makeGoal("restartgoal", 0, 3)
    const goalRunId = await runGoal("restartgoal")

    // Kill the API while the maker iteration is in flight; its child dies with it.
    await app.close()
    // Re-boot in headless-daemon mode: reconstruct sees a `running` goal whose maker
    // reconciled to a dead state and re-dispatches the iteration (continuation).
    app = await boot(true)

    const final = await until(async () => {
      const res = await getRun(goalRunId)
      return res.body.status !== "running" ? res.body : null
    })
    expect(final.status).toBe("done")
  })
})
