import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { SkillRun } from "@zibby/contracts"
import { RunnerCore } from "../runner/runner-core"
import { SkillsStorageService } from "./skills.storage.service"
import { type SkillRunRecord, skillStrategy, toSkillRun } from "./skill-run.record"

/** DI token carrying the absolute path of the directory that holds skill run artifacts. */
export const SKILL_RUNS_DIR = "SKILL_RUNS_DIR"

// Re-exported so the controller can map it to a 404 without importing the core.
export { RunNotFoundError } from "../runner/runner-core"

/**
 * Runs skills as child processes, tracked durably. A thin wrapper over the shared
 * {@link RunnerCore} (kind `skill`) — identical machinery to agent runs, differing
 * only in the existence check and the record shape. Demo by default; `claude -p`
 * when `AGENT_RUNNER_MODE=claude`.
 */
@Injectable()
export class SkillRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string
  private readonly core: RunnerCore<SkillRunRecord>

  constructor(
    @Inject(SKILL_RUNS_DIR) dir: string,
    private readonly skills: SkillsStorageService,
  ) {
    this.dir = path.resolve(dir)
    this.core = new RunnerCore(this.dir, skillStrategy)
  }

  onModuleInit(): Promise<void> {
    return this.core.init()
  }

  onModuleDestroy(): void {
    this.core.shutdown()
  }

  async start(skillId: string, prompt: string, project: string): Promise<SkillRun> {
    // Throws SkillNotFoundError / InvalidSkillIdError when the skill is unknown.
    await this.skills.get(skillId)

    const startedMs = Date.now()
    const cwd = path.join(this.dir, `${skillId}_${startedMs}`)
    const { command, args } = this.buildCommand(prompt, cwd)

    const rec = await this.core.start({
      kind: "skill",
      ownerId: skillId,
      command,
      args,
      cwd,
      startedMs,
      extra: { skillId, prompt, project },
    })
    return toSkillRun(rec)
  }

  listRunning(): SkillRun[] {
    return this.core.list().map(toSkillRun)
  }

  get(runId: string): SkillRun {
    return toSkillRun(this.core.get(runId))
  }

  stop(runId: string): SkillRun {
    return toSkillRun(this.core.stop(runId))
  }

  readLog(runId: string, offset: number): Promise<{
    content: string
    nextOffset: number
    done: boolean
  }> {
    return this.core.readLog(runId, offset)
  }

  private buildCommand(prompt: string, cwd: string): { command: string; args: string[] } {
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      return { command: "claude", args: ["-p", prompt] }
    }
    const script = process.env.AGENT_DEMO_SCRIPT ?? path.resolve(__dirname, "..", "agent-runs", "demo-task.mjs")
    return { command: process.execPath, args: [script, cwd] }
  }
}
