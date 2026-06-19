import { Global, Module } from "@nestjs/common";
import { dataDir } from "../shared/data-dir";
import { SYSTEM_CONFIG_FILE, SystemConfigStore } from "./system-config.store";
import { SystemController } from "./system.controller";

/** Default config file, anchored to `apps/api/data/system-config.json`. */
export function resolveSystemConfigFile(): string {
  return process.env.SYSTEM_CONFIG_FILE ?? dataDir("system-config.json");
}

/**
 * The runtime system config (formerly start-only env vars). `@Global` because the
 * consumers span many modules (the four schedulers, the channel adapter registry, the
 * goal runner) and an import edge into each would be pure noise — the same posture as
 * {@link ActivityLogModule}. Exports {@link SystemConfigStore} so any module injects it
 * without re-importing this one.
 *
 * Note: `SYSTEM_CONFIG_FILE` itself stays env-overridable — it is a path/test-isolation
 * knob (like `ACTIVITY_DIR`), not one of the behavioural knobs the store now owns.
 */
@Global()
@Module({
  controllers: [SystemController],
  providers: [
    { provide: SYSTEM_CONFIG_FILE, useFactory: resolveSystemConfigFile },
    SystemConfigStore,
  ],
  exports: [SystemConfigStore],
})
export class SystemModule {}
