import { Controller, Inject } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import type { Integration } from "@zibby/contracts"
import { integrationsContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import { CONNECTION_TESTER, type ConnectionTester } from "./connection-tester"
import { credentialMatchesKind } from "./credential-kind"
import { CredentialsStore } from "./credentials.store"
import {
  IntegrationConflictError,
  IntegrationNotFoundError,
  IntegrationsStorageService,
  InvalidIntegrationIdError,
} from "./integrations.storage.service"

const errors = makeErrorMapper("Integration", {
  missing: [IntegrationNotFoundError, InvalidIntegrationIdError],
  conflict: [IntegrationConflictError],
})

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } })

/**
 * Implements `integrationsContract`. Credentials live in a separate, gitignored
 * store and are write-only: the entity returned to clients carries only the
 * computed `hasCredentials`, never the secret. `kind` is immutable (a config whose
 * kind disagrees → 422). Deleting an integration cascades its credentials file.
 */
@Controller()
export class IntegrationsController {
  constructor(
    private readonly storage: IntegrationsStorageService,
    private readonly credentials: CredentialsStore,
    @Inject(CONNECTION_TESTER) private readonly tester: ConnectionTester,
  ) {}

  /** Layer the read-time `hasCredentials` onto an entity for the wire. */
  private async withCredentialState(integration: Integration): Promise<Integration> {
    return { ...integration, hasCredentials: await this.credentials.has(integration.id) }
  }

  @TsRestHandler(integrationsContract)
  handler() {
    return tsRestHandler(integrationsContract, {
      createIntegration: ({ body }) => {
        if (body.kind !== body.config.kind) {
          return Promise.resolve(unprocessable("config kind must match the integration kind"))
        }
        return errors.created(async () => this.withCredentialState(await this.storage.create(body)))
      },

      listIntegrations: async () => {
        const all = await this.storage.list()
        return { status: 200, body: await Promise.all(all.map((i) => this.withCredentialState(i))) }
      },

      getIntegration: ({ params: { id } }) =>
        errors.or404(id, async () => this.withCredentialState(await this.storage.get(id))),

      updateIntegration: ({ params: { id }, body }) =>
        errors.or404(
          id,
          async () => {
            const existing = await this.storage.get(id)
            if (body.config && body.config.kind !== existing.kind) {
              throw new ImmutableKindViolation()
            }
            return this.withCredentialState(await this.storage.update(id, body))
          },
          (error) => (error instanceof ImmutableKindViolation ? unprocessable("kind is immutable") : undefined),
        ),

      deleteIntegration: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id) // 404 before any side effect
          await this.storage.delete(id)
          await this.credentials.remove(id)
          return { id }
        }),

      setCredentials: ({ params: { id }, body }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id)
          if (!credentialMatchesKind(existing.kind, body)) {
            throw new CredentialKindViolation()
          }
          await this.credentials.write(id, body)
          return this.withCredentialState(existing)
        }, (error) =>
          error instanceof CredentialKindViolation
            ? unprocessable("credential kind does not match the integration kind")
            : undefined,
        ),

      deleteCredentials: ({ params: { id } }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id)
          await this.credentials.remove(id)
          return this.withCredentialState(existing)
        }),

      testIntegration: ({ params: { id } }) =>
        errors.or404(
          id,
          async () => {
            const integration = await this.storage.get(id)
            const creds = await this.credentials.read(id)
            if (!creds) throw new NoCredentialsViolation()
            const result = await this.tester.test(integration, creds)
            await this.storage.markSync(
              id,
              result.ok
                ? { status: "connected", lastSyncAt: new Date().toISOString(), lastError: undefined }
                : { status: "error", lastError: result.detail },
            )
            return result
          },
          (error) =>
            error instanceof NoCredentialsViolation
              ? ({ status: 409 as const, body: { message: "no credentials configured" } })
              : undefined,
        ),
    })
  }
}

/** Internal control-flow markers mapped to 422/409 by the handler's `extra` callbacks. */
class ImmutableKindViolation extends Error {}
class CredentialKindViolation extends Error {}
class NoCredentialsViolation extends Error {}
