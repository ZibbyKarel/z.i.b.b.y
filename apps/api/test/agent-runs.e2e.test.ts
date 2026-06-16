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
import { AgentRunnerService } from "../src/agents/agent-runner.service"
import { AppModule } from "../src/app.module"

/** Token-free stand-in for the real `claude` CLI (see fixtures/fake-claude.mjs). */
const FAKE_CLAUDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/fake-claude.mjs")

const execFileAsync = promisify(execFile)
const git = async (cwd: string, ...args: string[]) =>
  (await execFileAsync("git", args, { cwd })).stdout.trim()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll `fn` until it returns a truthy value or the timeout elapses. */
async function until<T>(fn: () => Promise<T>, timeoutMs = 8000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error("until: timed out")
    await sleep(50)
  }
}

/** Today's date, the basename of the daily note the recorder appends to. */
const TODAY = new Date().toISOString().slice(0, 10)

describe("Agent runs API (e2e)", () => {
  let app: INestApplication
  let agentsDir: string
  let runsDir: string
  let vaultDir: string

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "runs-e2e-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "runs-e2e-runs-"))
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "runs-e2e-vault-"))
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    // Isolate the vault so the run recorder (Phase 4) writes here, not the dev vault.
    process.env.VAULT_DIR = vaultDir
    // Run the stub instead of the real claude CLI; keep it fast for CI.
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "3"
    process.env.FAKE_CLAUDE_DELAY_MS = "60"

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    // Seed the agent we run.
    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "agent-007", name: "Agent 007", instructions: "test agent" })
      .expect(201)
    // Seed a North Star so grounding has something to inject.
    await request(app.getHttpServer())
      .post("/api/memory/notes")
      .send({ id: "north-star", tier: "memory", title: "North Star", body: "The mission of ZIBBY." })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    await fs.rm(agentsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    await fs.rm(runsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    await fs.rm(vaultDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    delete process.env.AGENTS_DIR
    delete process.env.AGENT_RUNS_DIR
    delete process.env.VAULT_DIR
    delete process.env.CLAUDE_BIN
    delete process.env.FAKE_CLAUDE_STEPS
    delete process.env.FAKE_CLAUDE_DELAY_MS
    delete process.env.FAKE_CLAUDE_DUMP_ARGS_FILE
  })

  it("runs an agent end to end: start → running → logs → finishes, leaving a marker + durable log", async () => {
    const start = await app
      .get(AgentRunnerService)
      .start("agent-007", "do the thing", "zibby-core", [], "")

    const { runId, agentId, status, pid, cwd, logFile } = start
    expect(agentId).toBe("agent-007")
    expect(status).toBe("running")
    expect(runId).toBe(`agent-007_${runId.split("_")[1]}_${pid}`)

    // It shows up in the running list.
    const running = await request(app.getHttpServer()).get("/api/agents/running").expect(200)
    expect(Array.isArray(running.body)).toBe(true)
    expect(running.body.some((r: { runId: string }) => r.runId === runId)).toBe(true)

    // Tail the log by offset until the run reports done.
    let offset = 0
    let log = ""
    const final = await until(async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/runs/${runId}/logs`)
        .query({ offset })
        .expect(200)
      log += res.body.content
      expect(res.body.nextOffset).toBeGreaterThanOrEqual(offset)
      offset = res.body.nextOffset
      return res.body.done ? res.body : null
    })

    expect(final.done).toBe(true)
    expect(log).toContain("PROGRESS 100")

    // The "simple task": a marker file in the sandbox folder.
    const marker = await fs.readFile(path.join(cwd, "agent-007-was-here.txt"), "utf8")
    expect(marker).toContain("ran at")

    // The log file persists on disk (survives a frontend reload).
    const onDisk = await fs.readFile(logFile, "utf8")
    expect(onDisk).toContain("PROGRESS 100")
    expect(path.dirname(logFile)).toBe(path.resolve(runsDir))
  })

  it("records a finished run into today's daily note (Phase 4)", async () => {
    const start = await app.get(AgentRunnerService).start("agent-007", "record me", "", [], "")
    const { runId } = start

    // The recorder appends a daily line on terminal status (async, after finish).
    const daily = await until(async () => {
      const res = await request(app.getHttpServer()).get(`/api/memory/note/${TODAY}`)
      if (res.status !== 200) return null
      return typeof res.body.body === "string" && res.body.body.includes(runId) ? res.body : null
    })
    expect(daily.tier).toBe("daily")
    expect(daily.body).toContain("(agent-007)")
  })

  it("injects the vault grounding into --append-system-prompt (Phase 4)", async () => {
    const dump = path.join(runsDir, "argv-dump.json")
    process.env.FAKE_CLAUDE_DUMP_ARGS_FILE = dump
    try {
      await app.get(AgentRunnerService).start("agent-007", "grounded run", "", [], "")
      const argv = await until<string[] | null>(async () => {
        const raw = await fs.readFile(dump, "utf8").catch(() => null)
        return raw ? (JSON.parse(raw) as string[]) : null
      })
      if (!argv) throw new Error("argv dump never appeared")
      // The system prompt now rides --append-system-prompt-file (spilled to the
      // sandbox so it stays off argv as the prompt grows). Fall back to the
      // inline flag so the assertion covers both code paths.
      const fileIdx = argv.indexOf("--append-system-prompt-file")
      let promptText: string
      if (fileIdx >= 0) {
        const filePath = argv[fileIdx + 1] ?? ""
        promptText = await fs.readFile(filePath, "utf8")
      } else {
        const inlineIdx = argv.indexOf("--append-system-prompt")
        expect(inlineIdx).toBeGreaterThanOrEqual(0)
        promptText = argv[inlineIdx + 1] ?? ""
      }
      expect(promptText).toContain("## Grounding (vault)")
      expect(promptText).toContain("North Star")
    } finally {
      delete process.env.FAKE_CLAUDE_DUMP_ARGS_FILE
    }
  })

  it("stops a running agent", async () => {
    process.env.FAKE_CLAUDE_STEPS = "50"
    process.env.FAKE_CLAUDE_DELAY_MS = "100"
    const start = await app.get(AgentRunnerService).start("agent-007", "long one", "zibby-core", [], "")
    process.env.FAKE_CLAUDE_STEPS = "3"
    process.env.FAKE_CLAUDE_DELAY_MS = "60"

    const { runId } = start
    const stopped = await request(app.getHttpServer())
      .post(`/api/tasks/runs/${runId}/stop`)
      .send({})
      .expect(200)
    expect(stopped.body.runId).toBe(runId)
  })

  it("404s for an unknown agent or run", async () => {
    await expect(app.get(AgentRunnerService).start("no-such-agent", "x", "", [], "")).rejects.toThrow()

    await request(app.getHttpServer())
      .get("/api/tasks/runs/not-a-real-run/logs")
      .query({ offset: 0 })
      .expect(404)
  })

  it("treats GET /api/agents/running as the run list, not an agent lookup", async () => {
    // Guard the route-ordering trick: `running` must not be captured by `:id`.
    const res = await request(app.getHttpServer()).get("/api/agents/running").expect(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe("Agent runs on a git project lands commits on a zibby/* branch (e2e)", () => {
  let app: INestApplication
  let agentsDir: string
  let runsDir: string
  let projectsDir: string
  let repo: string

  async function boot(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    process.env.PROJECTS_DIR = projectsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-runs-"))
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-projects-"))
    repo = await fs.mkdtemp(path.join(os.tmpdir(), "git-repo-"))
    // A git fixture project with one commit so HEAD resolves.
    await git(repo, "init", "-b", "main")
    await git(repo, "config", "user.email", "t@zibby.local")
    await git(repo, "config", "user.name", "T")
    await fs.writeFile(path.join(repo, "README.md"), "# fixture\n", "utf8")
    await git(repo, "add", "-A")
    await git(repo, "commit", "-m", "initial")

    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "2"
    process.env.FAKE_CLAUDE_DELAY_MS = "20"
    process.env.FAKE_CLAUDE_COMMIT = "1"
    app = await boot()

    await request(app.getHttpServer())
      .post("/api/agents")
      .send({ id: "builder", name: "Builder", instructions: "builds" })
      .expect(201)
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({ id: "fixture-proj", name: "Fixture", path: repo })
      .expect(201)
  })

  afterAll(async () => {
    await app.close()
    for (const d of [agentsDir, runsDir, projectsDir, repo]) {
      await fs.rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
    for (const k of [
      "AGENTS_DIR",
      "AGENT_RUNS_DIR",
      "PROJECTS_DIR",
      "CLAUDE_BIN",
      "FAKE_CLAUDE_STEPS",
      "FAKE_CLAUDE_DELAY_MS",
      "FAKE_CLAUDE_COMMIT",
    ]) {
      delete process.env[k]
    }
  })

  it("creates a worktree, lands the commit on its branch, leaves main untouched, and prunes on delete", async () => {
    const mainBefore = await git(repo, "rev-parse", "HEAD")

    const start = await app
      .get(AgentRunnerService)
      .start("builder", "do the thing", "fixture-proj", [], "")
    const { runId, workspace } = start as {
      runId: string
      workspace?: { branch: string; path: string; baseRef: string }
    }
    expect(workspace).toBeTruthy()
    expect(workspace?.branch).toBe(`zibby/${runId.split("_").slice(0, 2).join("_")}-builder`)
    expect(workspace?.baseRef).toBe(mainBefore)

    await until(async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/runs/${runId}/logs`)
        .query({ offset: 0 })
      return res.body.done ? res.body : null
    })

    // The commit landed on the run's branch — not on main.
    expect(await git(repo, "rev-parse", "HEAD")).toBe(mainBefore)
    const branchHead = await git(repo, "rev-parse", workspace!.branch)
    expect(branchHead).not.toBe(mainBefore)
    // The worktree exists and is checked out on the branch.
    expect(await git(workspace!.path, "rev-parse", "--abbrev-ref", "HEAD")).toBe(workspace!.branch)

    // Delete prunes the worktree but keeps the branch (it may carry a PR).
    await request(app.getHttpServer()).delete(`/api/tasks/runs/${runId}`).expect(200)
    const worktrees = await git(repo, "worktree", "list")
    expect(worktrees).not.toContain(workspace!.path)
    expect(await git(repo, "branch", "--list", workspace!.branch)).toContain(workspace!.branch)
  })
})

describe("Agent runs persistence across restart (e2e)", () => {
  let agentsDir: string
  let runsDir: string

  async function bootApp(): Promise<INestApplication> {
    process.env.AGENTS_DIR = agentsDir
    process.env.AGENT_RUNS_DIR = runsDir
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const fresh = moduleRef.createNestApplication()
    await fresh.init()
    return fresh
  }

  beforeAll(async () => {
    agentsDir = await fs.mkdtemp(path.join(os.tmpdir(), "restart-e2e-agents-"))
    runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "restart-e2e-runs-"))
    process.env.CLAUDE_BIN = FAKE_CLAUDE
    process.env.FAKE_CLAUDE_STEPS = "3"
    process.env.FAKE_CLAUDE_DELAY_MS = "60"

    const seed = await bootApp()
    await request(seed.getHttpServer())
      .post("/api/agents")
      .send({ id: "agent-007", name: "Agent 007", instructions: "test agent" })
      .expect(201)
    await seed.close()
  })

  afterAll(async () => {
    await fs.rm(agentsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    await fs.rm(runsDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    delete process.env.AGENTS_DIR
    delete process.env.AGENT_RUNS_DIR
    delete process.env.CLAUDE_BIN
    delete process.env.FAKE_CLAUDE_STEPS
    delete process.env.FAKE_CLAUDE_DELAY_MS
  })

  it("a completed run reappears in the list after a backend restart", async () => {
    const app1 = await bootApp()
    const start = await app1.get(AgentRunnerService).start("agent-007", "persist me", "zibby-core", [], "")
    const { runId } = start
    await until(async () => {
      const res = await request(app1.getHttpServer())
        .get(`/api/tasks/runs/${runId}/logs`)
        .query({ offset: 0 })
      return res.body.done ? res.body : null
    })
    await app1.close()

    // Restart: a brand-new app over the same RUNS_DIR rebuilds from disk.
    const app2 = await bootApp()
    const running = await request(app2.getHttpServer()).get("/api/agents/running").expect(200)
    const found = running.body.find((r: { runId: string }) => r.runId === runId)
    expect(found).toBeTruthy()
    expect(found.status).toBe("done")
    expect(found.prompt).toBe("persist me")
    expect(found.project).toBe("zibby-core")
    await app2.close()
  })

  it("reconciles a run left 'running' at crash to 'interrupted'", async () => {
    // Simulate a hard crash: a dangling sidecar (+ log) the runner never finalized.
    const runId = "ghost_1780000000000_4242"
    const logFile = path.join(runsDir, `${runId}.log`)
    await fs.writeFile(logFile, "starting up\nPROGRESS 40\n", "utf8")
    await fs.writeFile(
      path.join(runsDir, `${runId}.json`),
      JSON.stringify({
        runId,
        agentId: "agent-007",
        status: "running",
        pct: 40,
        prompt: "ghost run",
        project: "home-ops",
        cwd: path.join(runsDir, "ghost"),
        startedAt: new Date().toISOString(),
        pid: 4242,
        logFile,
      }),
      "utf8",
    )

    const app = await bootApp()
    const running = await request(app.getHttpServer()).get("/api/agents/running").expect(200)
    const found = running.body.find((r: { runId: string }) => r.runId === runId)
    expect(found?.status).toBe("interrupted")
    expect(found?.pct).toBe(40)
    await app.close()
  })
})
