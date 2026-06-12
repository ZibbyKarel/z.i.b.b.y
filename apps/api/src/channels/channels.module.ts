import { Module } from "@nestjs/common"
import { IntegrationsModule } from "../integrations/integrations.module"
import { dataDir } from "../shared/data-dir"
import { CHANNELS_DIR, ChannelItemStore } from "./channel-item.store"
import { ChannelEventsService } from "./channel-events.service"
import { ChannelWatcherService } from "./channel-watcher.service"
import { ChannelsController } from "./channels.controller"

/** Default channels dir, anchored to `apps/api/data/channels`. */
export function resolveChannelsDir(): string {
  return process.env.CHANNELS_DIR ?? dataDir("channels")
}

/**
 * Channels (Phase 5.2): inbound ingestion. Imports IntegrationsModule for the
 * integrations store, credentials store and adapter registry. Owns the item store,
 * the SSE push source and the watcher heartbeat. 5.3 adds the triage flow + mandate
 * as providers here (bound to CHANNEL_TRIAGE_FLOW). Nothing imports this module, so
 * it can sit above the tasks/gates/approvals modules without a cycle.
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [ChannelsController],
  providers: [
    { provide: CHANNELS_DIR, useFactory: resolveChannelsDir },
    ChannelItemStore,
    ChannelEventsService,
    ChannelWatcherService,
  ],
  exports: [ChannelItemStore, ChannelEventsService],
})
export class ChannelsModule {}
