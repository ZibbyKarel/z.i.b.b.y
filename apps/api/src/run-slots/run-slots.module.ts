import { Module } from "@nestjs/common";
import { WorkingAgentsFuse } from "./working-agents-fuse";

/**
 * Leaf module holding the machine fuse (`WorkingAgentsFuse`). Imported by both
 * `TasksModule` and `WorkflowsModule`; it sits below both so it closes no cycle
 * (`SystemConfigStore` is global).
 */
@Module({ providers: [WorkingAgentsFuse], exports: [WorkingAgentsFuse] })
export class RunSlotsModule {}
