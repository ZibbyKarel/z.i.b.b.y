import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { MaestroController } from "./maestro.controller";
import { MaestroService } from "./maestro.service";

/**
 * NS2 F5b — Maestro's read-side merge queue. A leaf module (like
 * `SentinelModule`): `ProjectsModule` (for `ProjectsStorageService` +
 * `ProjectPrService`, the exact pulls-fetch it reuses), `ResolvedProjectModule`
 * + `IntegrationsModule` (the shared `resolveGithubToken` seam). No cycle risk
 * — none of these import `MaestroModule` back.
 */
@Module({
  imports: [ProjectsModule, ResolvedProjectModule, IntegrationsModule],
  controllers: [MaestroController],
  providers: [MaestroService],
  exports: [MaestroService],
})
export class MaestroModule {}
