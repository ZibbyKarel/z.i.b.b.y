import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { ReleaseController } from "./release.controller";
import { ReleaseService } from "./release.service";

/**
 * NS2 F5b — Release's read-side merge queue. A leaf module (like
 * `SecurityModule`): `ProjectsModule` (for `ProjectsStorageService` +
 * `ProjectPrService`, the exact pulls-fetch it reuses), `ResolvedProjectModule`
 * + `IntegrationsModule` (the shared `resolveGithubToken` seam). No cycle risk
 * — none of these import `ReleaseModule` back.
 */
@Module({
  imports: [ProjectsModule, ResolvedProjectModule, IntegrationsModule],
  controllers: [ReleaseController],
  providers: [ReleaseService],
  exports: [ReleaseService],
})
export class ReleaseModule {}
