import { Module } from "@nestjs/common";
import { ApprovalsModule } from "../approvals/approvals.module";
import { dataDir } from "../shared/data-dir";
import { AUTOMATIONS_DIR, AutomationsStorageService } from "./automations.storage.service";
import { SignalBusService } from "./signal-bus.service";
import { SIGNAL_BUS_DIR, SignalBusStore } from "./signal-bus.store";

/**
 * The signal bus — a leaf module the producers (Security/Arch/Release/Workflows)
 * import to `emit` a signal. It reads automations through its own
 * `AutomationsStorageService` instance (same read-through file store `MemoryModule`
 * already mirrors) rather than importing `AutomationsModule`, which imports the
 * producers — that would be a cycle. `SchedulerService` registers the dispatcher.
 */
@Module({
  imports: [ApprovalsModule],
  providers: [
    {
      provide: AUTOMATIONS_DIR,
      useFactory: () => process.env.AUTOMATIONS_DIR ?? dataDir("automations"),
    },
    AutomationsStorageService,
    {
      provide: SIGNAL_BUS_DIR,
      useFactory: () => process.env.SIGNAL_BUS_DIR ?? dataDir("automations-fired"),
    },
    SignalBusStore,
    SignalBusService,
  ],
  exports: [SignalBusService],
})
export class SignalBusModule {}
