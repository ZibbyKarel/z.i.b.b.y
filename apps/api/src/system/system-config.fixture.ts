import { writeFileSync } from "node:fs";
import { type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import type { SystemConfigListener, SystemConfigStore } from "./system-config.store";

/**
 * Test defaults for the runtime system config: every heartbeat OFF (suites drive
 * `tick()` directly). The fake channel adapter is no longer a config knob — it is
 * selected by the `CHANNEL_FAKE_DIR` env that the global `vitest.setup.ts` seeds. The
 * setup also seeds these defaults into a file so every booted `AppModule` reads them;
 * unit tests use {@link fakeSystemConfigStore}.
 */
export const TEST_SYSTEM_CONFIG: SystemConfig = SystemConfigSchema.parse({
  taskTickMs: 0,
  channelTickMs: 0,
  monitorTickMs: 0,
  automationTickMs: 0,
  limitResumeTickMs: 0,
  // 125c: uncapped by default (today's behaviour) — a test opts into the global
  // cap via `fakeSystemConfigStore({ maxConcurrentRuns: N })`.
  maxConcurrentRuns: null,
});

/**
 * An in-memory {@link SystemConfigStore} for unit tests — no file IO. `write()` updates
 * the in-memory config and fires `onChange` subscribers, so a test can exercise the
 * schedulers' live re-arm. Pass a partial to override the test defaults.
 */
export function fakeSystemConfigStore(partial: Partial<SystemConfig> = {}): SystemConfigStore {
  let config = SystemConfigSchema.parse({ ...TEST_SYSTEM_CONFIG, ...partial });
  const listeners = new Set<SystemConfigListener>();
  const store: Pick<SystemConfigStore, "current" | "read" | "write" | "onChange"> = {
    current: () => config,
    read: async () => config,
    write: async (next) => {
      config = SystemConfigSchema.parse(next);
      for (const listener of listeners) listener(config);
      return config;
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store as SystemConfigStore;
}

/**
 * Seed the file-backed system config an e2e suite's `AppModule` will read at boot.
 * Writes the test defaults merged with `partial` to `SYSTEM_CONFIG_FILE` (set by the
 * global `vitest.setup.ts`). Call BEFORE booting the app — the store loads the file
 * synchronously at construction.
 */
export function writeSystemConfig(partial: Partial<SystemConfig> = {}): void {
  const file = process.env.SYSTEM_CONFIG_FILE;
  if (!file) throw new Error("SYSTEM_CONFIG_FILE is not set (vitest.setup seeds it)");
  const config = SystemConfigSchema.parse({ ...TEST_SYSTEM_CONFIG, ...partial });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}
