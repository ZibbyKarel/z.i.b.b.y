import { Global, Module } from "@nestjs/common";
import { WatcherHealthRegistry } from "./watcher-health.registry";

/**
 * NS2 F6c — `@Global()` (the LoggingModule precedent) so all five watcher
 * services inject {@link WatcherHealthRegistry} without a per-module import
 * edit. One-directional by construction: watchers register INTO the registry;
 * the registry imports nothing from them, so no cycle is possible.
 */
@Global()
@Module({
  providers: [WatcherHealthRegistry],
  exports: [WatcherHealthRegistry],
})
export class WatcherHealthModule {}
