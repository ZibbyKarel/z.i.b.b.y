import { Module } from "@nestjs/common";
import { SkillsModule } from "../skills/skills.module";
import { WorkflowsModule } from "../workflows/workflows.module";
import { ExternalSkillsController } from "./external-skills.controller";
import { ExternalSkillsService } from "./external-skills.service";
import { SkillRepoGit } from "./skill-repo-git";

/**
 * Install skills from public GitHub repos; the store + dir come from `SkillsModule`.
 * `WorkflowsModule` backs the uninstall usage check (it never imports this module).
 */
@Module({
  imports: [SkillsModule, WorkflowsModule],
  controllers: [ExternalSkillsController],
  providers: [SkillRepoGit, ExternalSkillsService],
  // The weekly `external-skills-sync` automation dispatches to `syncAll`.
  exports: [ExternalSkillsService],
})
export class ExternalSkillsModule {}
