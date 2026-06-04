import * as path from "node:path"
import { Module } from "@nestjs/common"
import { ApprovalsModule } from "../approvals/approvals.module"
import { SKILL_RUNS_DIR, SkillRunnerService } from "./skill-runner.service"
import { SkillRunsController } from "./skill-runs.controller"
import { SkillsController } from "./skills.controller"
import { SKILLS_DIR, SkillsStorageService } from "./skills.storage.service"

/** Default skills dir, anchored to `apps/api/data/skills` the same way agents are. */
export function resolveSkillsDir(): string {
  return process.env.SKILLS_DIR ?? path.resolve(__dirname, "..", "..", "data", "skills")
}

/** Default directory for skill run artifacts (logs + per-run sandboxes). */
export function resolveSkillRunsDir(): string {
  return (
    process.env.SKILL_RUNS_DIR ?? path.resolve(__dirname, "..", "..", "data", "skills", "runs")
  )
}

@Module({
  imports: [ApprovalsModule],
  // SkillRunsController is declared before SkillsController so its static routes
  // (`GET /skills/running`, `/skills/runs/:runId`) register ahead of `/skills/:id`,
  // which would otherwise capture "running"/"runs" as a skill id.
  controllers: [SkillRunsController, SkillsController],
  providers: [
    { provide: SKILLS_DIR, useFactory: resolveSkillsDir },
    { provide: SKILL_RUNS_DIR, useFactory: resolveSkillRunsDir },
    SkillsStorageService,
    SkillRunnerService,
  ],
  exports: [SkillsStorageService],
})
export class SkillsModule {}
