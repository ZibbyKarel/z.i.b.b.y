import { Module } from "@nestjs/common"
import { AdapterRegistry } from "../channels/adapters/adapter-registry"
import { dataDir } from "../shared/data-dir"
import { CONNECTION_TESTER } from "./connection-tester"
import { CREDENTIALS_DIR, CredentialsStore } from "./credentials.store"
import { IntegrationsController } from "./integrations.controller"
import { INTEGRATIONS_DIR, IntegrationsStorageService } from "./integrations.storage.service"

/** Default integrations dir, anchored to `apps/api/data/integrations`. */
export function resolveIntegrationsDir(): string {
  return process.env.INTEGRATIONS_DIR ?? dataDir("integrations")
}

/** Default credentials dir (gitignored), anchored to `apps/api/data/credentials`. */
export function resolveCredentialsDir(): string {
  return process.env.CREDENTIALS_DIR ?? dataDir("credentials")
}

/**
 * Integrations (Phase 5.1): the configured inbound channels plus their separate,
 * gitignored credentials store. {@link CONNECTION_TESTER} is bound to the channels
 * {@link AdapterRegistry} (the real probe). The storage service + credentials store
 * + registry are exported so the channels watcher (5.2) reuses them.
 */
@Module({
  controllers: [IntegrationsController],
  providers: [
    { provide: INTEGRATIONS_DIR, useFactory: resolveIntegrationsDir },
    { provide: CREDENTIALS_DIR, useFactory: resolveCredentialsDir },
    IntegrationsStorageService,
    CredentialsStore,
    AdapterRegistry,
    { provide: CONNECTION_TESTER, useExisting: AdapterRegistry },
  ],
  exports: [IntegrationsStorageService, CredentialsStore, AdapterRegistry],
})
export class IntegrationsModule {}
