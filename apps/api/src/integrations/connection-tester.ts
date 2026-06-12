import { Injectable } from "@nestjs/common"
import type { CredentialsInput, Integration, TestResult } from "@zibby/contracts"

/**
 * The seam the `POST /integrations/:id/test` endpoint calls to probe a live
 * connection. Behind the {@link CONNECTION_TESTER} token so 5.2 can swap the
 * thin stub below for the real adapter registry (Slack `auth.test`, IMAP login)
 * without touching the controller.
 */
export interface ConnectionTester {
  test(integration: Integration, creds: CredentialsInput): Promise<TestResult>
}

/** DI token for the active {@link ConnectionTester}. */
export const CONNECTION_TESTER = Symbol("CONNECTION_TESTER")

/**
 * Placeholder tester for 5.1 — credentials are present (the controller already
 * 409s when they're not), so it reports a successful, kind-aware probe. The 5.2
 * commit replaces this provider with the adapter registry, which performs the
 * real network probe; grep for this class at 5.2 exit to confirm it's gone.
 */
@Injectable()
export class StubConnectionTester implements ConnectionTester {
  test(integration: Integration): Promise<TestResult> {
    return Promise.resolve({
      ok: true,
      detail: `${integration.kind} credentials present (stub tester)`,
    })
  }
}
