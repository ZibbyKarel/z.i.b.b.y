import { Module } from "@nestjs/common";
import { MachineConfigModule } from "../machine/machine-config.module";
import { ProjectsModule } from "../projects/projects.module";
import { SelfController } from "./self.controller";
import { SelfService } from "./self.service";

/**
 * The ZIBBY install repo's own freshness (Phase 79). Reads local git/`gh` state
 * directly via {@link SelfService}; imports the projects + machine-config modules
 * only for `ensureSelfProject` (register ZIBBY as its own project).
 */
@Module({
  // Projects storage (registry) + machine config (`cloneRoot`) for `ensureSelfProject`.
  imports: [ProjectsModule, MachineConfigModule],
  controllers: [SelfController],
  providers: [SelfService],
})
export class SelfModule {}
