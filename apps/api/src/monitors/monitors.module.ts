import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { dataDir } from "../shared/data-dir";
import { TasksModule } from "../tasks/tasks.module";
import { GithubCiMonitor } from "./github-ci.monitor";
import { MonitorAdapterRegistry } from "./monitor-adapter";
import { MONITOR_EVENTS_DIR, MonitorEventStore } from "./monitor-event.store";
import { MonitorWatcherService } from "./monitor-watcher.service";
import { MonitorsController } from "./monitors.controller";

/** Default monitor events dir, anchored to the data root. */
export function resolveMonitorEventsDir(): string {
  return process.env.MONITOR_EVENTS_DIR ?? dataDir("monitors");
}

/**
 * CI/CD monitoring (N3). The registry ships with the GitHub Actions monitor;
 * a future source (Sentry) is one `registry.register(...)` here — the seam's
 * whole point, no watcher/runtime change. Reuses the integrations store +
 * credentials (a monitor rides the integration that owns the source) and the
 * task scheduler (an alert's investigation dispatches like any other task).
 */
@Module({
  imports: [IntegrationsModule, TasksModule],
  controllers: [MonitorsController],
  providers: [
    { provide: MONITOR_EVENTS_DIR, useFactory: resolveMonitorEventsDir },
    MonitorEventStore,
    {
      provide: MonitorAdapterRegistry,
      useFactory: () => {
        const registry = new MonitorAdapterRegistry();
        registry.register(new GithubCiMonitor());
        return registry;
      },
    },
    MonitorWatcherService,
  ],
  exports: [MonitorEventStore, MonitorAdapterRegistry],
})
export class MonitorsModule {}
