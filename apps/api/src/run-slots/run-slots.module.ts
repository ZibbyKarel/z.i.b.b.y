import { Module } from "@nestjs/common";
import { RunSlots } from "./run-slots.service";

/**
 * Leaf module holding the run-slot limiter (`RunSlots`), imported by `TasksModule`.
 * It sits below it so it closes no cycle (`SystemConfigStore` is global).
 */
@Module({ providers: [RunSlots], exports: [RunSlots] })
export class RunSlotsModule {}
