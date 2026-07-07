import { Module, forwardRef } from "@nestjs/common";
import { AdapterRegistry } from "../channels/adapters/adapter-registry";
import { ProjectsModule } from "../projects/projects.module";
import { ResolvedProjectModule } from "../projects/resolved-project.module";
import { dataDir } from "../shared/data-dir";
import { CONNECTION_TESTER } from "./connection-tester";
import { CREDENTIALS_DIR, CredentialsStore } from "./credentials.store";
import { IntegrationsController } from "./integrations.controller";
import {
  INTEGRATIONS_DIR,
  INTEGRATION_STATE_DIR,
  IntegrationsStorageService,
} from "./integrations.storage.service";

/** Default integrations dir, anchored to `apps/api/data/integrations`. */
export function resolveIntegrationsDir(): string {
  return process.env.INTEGRATIONS_DIR ?? dataDir("integrations");
}

/**
 * Default integration sync-state dir (gitignored), anchored to
 * `apps/api/data/integration-state`. Holds the volatile status/lastSyncAt/lastError
 * stamped on every poll, so the versioned integration config never churns.
 */
export function resolveIntegrationStateDir(): string {
  return process.env.INTEGRATION_STATE_DIR ?? dataDir("integration-state");
}

/** Default credentials dir (gitignored), anchored to `apps/api/data/credentials`. */
export function resolveCredentialsDir(): string {
  return process.env.CREDENTIALS_DIR ?? dataDir("credentials");
}

/**
 * Integrations (Phase 5.1): the configured inbound channels plus their separate,
 * gitignored credentials store. {@link CONNECTION_TESTER} is bound to the channels
 * {@link AdapterRegistry} (the real probe). The storage service + credentials store
 * + registry are exported so the channels watcher (5.2) reuses them.
 *
 * Phase 70: also imports {@link ResolvedProjectModule} (via `forwardRef` — see that
 * module's doc comment for why) so `IntegrationsController.listIntegrations` can
 * return a project's EFFECTIVE (company-merged) integrations instead of a raw
 * `projectId` filter.
 */
@Module({
  imports: [ProjectsModule, forwardRef(() => ResolvedProjectModule)],
  controllers: [IntegrationsController],
  providers: [
    { provide: INTEGRATIONS_DIR, useFactory: resolveIntegrationsDir },
    { provide: INTEGRATION_STATE_DIR, useFactory: resolveIntegrationStateDir },
    { provide: CREDENTIALS_DIR, useFactory: resolveCredentialsDir },
    IntegrationsStorageService,
    CredentialsStore,
    AdapterRegistry,
    { provide: CONNECTION_TESTER, useExisting: AdapterRegistry },
  ],
  exports: [IntegrationsStorageService, CredentialsStore, AdapterRegistry],
})
export class IntegrationsModule {}
