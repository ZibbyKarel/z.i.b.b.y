import { Global, Module } from "@nestjs/common"
import { dataDir } from "../shared/data-dir"
import { ActivityEventsService } from "./activity-events.service"
import { ACTIVITY_DIR, ActivityLogService } from "./activity-log.service"
import { ActivityController } from "./activity.controller"

/** Default activity dir, anchored to `apps/api/data/activity` (gitignored). */
export function resolveActivityDir(): string {
  return process.env.ACTIVITY_DIR ?? dataDir("activity")
}

/**
 * The activity log (Phase 6.1) — the {@link LoggingModule} twin. `@Global` because
 * the emission points span seven modules (tasks, approvals, gates, channels,
 * briefing, the recorder, the events controller); import edges would be pure noise.
 * Provides the recorder/reader service ({@link ActivityLogService}) and the SSE push
 * source ({@link ActivityEventsService}), both exported so any module injects them
 * without re-importing this one.
 */
@Global()
@Module({
  controllers: [ActivityController],
  providers: [
    { provide: ACTIVITY_DIR, useFactory: resolveActivityDir },
    ActivityLogService,
    ActivityEventsService,
  ],
  exports: [ActivityLogService, ActivityEventsService],
})
export class ActivityLogModule {}
