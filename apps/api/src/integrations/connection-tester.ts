import type { CredentialsInput, Integration, TestResult } from "@zibby/contracts"

/**
 * The seam the `POST /integrations/:id/test` endpoint calls to probe a live
 * connection. Behind the {@link CONNECTION_TESTER} token; the active binding is
 * the channels {@link AdapterRegistry}, which performs the real (or, under
 * `CHANNEL_ADAPTER_MODE=fake`, faked) probe through the resolved adapter.
 */
export interface ConnectionTester {
  test(integration: Integration, creds: CredentialsInput): Promise<TestResult>
}

/** DI token for the active {@link ConnectionTester}. */
export const CONNECTION_TESTER = Symbol("CONNECTION_TESTER")
