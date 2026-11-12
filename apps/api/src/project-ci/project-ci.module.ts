import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { TasksModule } from "../tasks/tasks.module";
import { ProjectCiController } from "./project-ci.controller";
import { ProjectCiService } from "./project-ci.service";

/** todo-10 — base-branch CI per project (Bridge "Project status" widget). */
@Module({
  imports: [ProjectsModule, ResolvedProjectModule, IntegrationsModule, TasksModule],
  controllers: [ProjectCiController],
  providers: [ProjectCiService],
})
export class ProjectCiModule {}
