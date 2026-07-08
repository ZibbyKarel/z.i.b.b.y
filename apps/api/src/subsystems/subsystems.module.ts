import { Module } from "@nestjs/common";
import { SubsystemsController } from "./subsystems.controller";
import { SubsystemsService } from "./subsystems.service";

/**
 * The subsystem-federation registry endpoint (design doc
 * `docs/superpowers/specs/2026-07-08-subsystem-federation-design.md`). Phase 80
 * is identity + a stub status; no dependencies on other modules yet.
 */
@Module({
  controllers: [SubsystemsController],
  providers: [SubsystemsService],
})
export class SubsystemsModule {}
