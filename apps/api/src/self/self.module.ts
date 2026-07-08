import { Module } from "@nestjs/common";
import { SelfController } from "./self.controller";
import { SelfService } from "./self.service";

/**
 * The ZIBBY install repo's own freshness (Phase 79). Standalone — reads local
 * git/`gh` state directly via {@link SelfService}, no dependency on any other
 * module (unlike `HealthModule`, which composes several subsystem probes).
 */
@Module({
  controllers: [SelfController],
  providers: [SelfService],
})
export class SelfModule {}
