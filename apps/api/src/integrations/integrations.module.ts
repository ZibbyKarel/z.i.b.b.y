import { Module } from "@nestjs/common"
import { dataDir } from "../shared/data-dir"
import { CONNECTION_TESTER, StubConnectionTester } from "./connection-tester"
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
 * gitignored credentials store. The connection tester is a stub here; the 5.2
 * commit rebinds {@link CONNECTION_TESTER} to the adapter registry. The storage
 * service is exported so the channels watcher (5.2) can stamp sync health on it.
 */
@Module({
  controllers: [IntegrationsController],
  providers: [
    { provide: INTEGRATIONS_DIR, useFactory: resolveIntegrationsDir },
    { provide: CREDENTIALS_DIR, useFactory: resolveCredentialsDir },
    IntegrationsStorageService,
    CredentialsStore,
    { provide: CONNECTION_TESTER, useClass: StubConnectionTester },
  ],
  exports: [IntegrationsStorageService, CredentialsStore],
})
export class IntegrationsModule {}
