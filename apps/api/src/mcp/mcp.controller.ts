import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import type { McpCredentialsInput, McpServer } from "@zibby/contracts"
import { mcpContract } from "@zibby/contracts"
import { makeErrorMapper } from "../shared/http/error-mapping"
import { McpCredentialsStore } from "./mcp-credentials.store"
import {
  InvalidMcpServerIdError,
  McpServerConflictError,
  McpServerNotFoundError,
} from "./mcp.errors"
import { McpServersStorageService } from "./mcp.storage.service"

const errors = makeErrorMapper("McpServer", {
  missing: [McpServerNotFoundError, InvalidMcpServerIdError],
  conflict: [McpServerConflictError],
})

const unprocessable = (message: string) => ({ status: 422 as const, body: { message } })

/**
 * Implements `mcpContract`. Credentials live in a separate, gitignored store and
 * are write-only: the entity returned to clients carries only the computed
 * `hasCredentials`, never the secret. `type` is immutable (an update changing it
 * → 422). Deleting a server cascades its credentials file. A stdio server's secret
 * is `env`; an http/sse server's is `headers`/`authToken` — a mismatch → 422.
 */
@Controller()
export class McpController {
  constructor(
    private readonly storage: McpServersStorageService,
    private readonly credentials: McpCredentialsStore,
  ) {}

  /** Layer the read-time `hasCredentials` onto an entity for the wire. */
  private async withCredentialState(server: McpServer): Promise<McpServer> {
    return { ...server, hasCredentials: await this.credentials.has(server.id) }
  }

  /** Whether a credentials body fits the server's transport (env↔stdio, headers/token↔http/sse). */
  private credentialMatchesType(type: McpServer["type"], creds: McpCredentialsInput): boolean {
    if (type === "stdio") return !creds.headers && !creds.authToken
    return creds.env === undefined
  }

  @TsRestHandler(mcpContract)
  handler() {
    return tsRestHandler(mcpContract, {
      createMcpServer: ({ body }) =>
        errors.created(async () => this.withCredentialState(await this.storage.create(body))),

      listMcpServers: async () => {
        const all = await this.storage.list()
        return { status: 200, body: await Promise.all(all.map((s) => this.withCredentialState(s))) }
      },

      getMcpServer: ({ params: { id } }) =>
        errors.or404(id, async () => this.withCredentialState(await this.storage.get(id))),

      updateMcpServer: ({ params: { id }, body }) =>
        errors.or404(id, async () => this.withCredentialState(await this.storage.update(id, body))),

      deleteMcpServer: ({ params: { id } }) =>
        errors.or404(id, async () => {
          await this.storage.get(id) // 404 before any side effect
          await this.storage.delete(id)
          await this.credentials.remove(id)
          return { id }
        }),

      setMcpCredentials: ({ params: { id }, body }) =>
        errors.or404(
          id,
          async () => {
            const existing = await this.storage.get(id)
            if (!this.credentialMatchesType(existing.type, body)) {
              throw new CredentialTypeViolation()
            }
            await this.credentials.write(id, body)
            return this.withCredentialState(existing)
          },
          (error) =>
            error instanceof CredentialTypeViolation
              ? unprocessable("credential shape does not match the server transport")
              : undefined,
        ),

      deleteMcpCredentials: ({ params: { id } }) =>
        errors.or404(id, async () => {
          const existing = await this.storage.get(id)
          await this.credentials.remove(id)
          return this.withCredentialState(existing)
        }),
    })
  }
}

/** Internal control-flow marker mapped to 422 by the handler's `extra` callback. */
class CredentialTypeViolation extends Error {}
