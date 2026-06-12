import { Injectable } from "@nestjs/common"
import type { CredentialsInput, Integration, TestResult } from "@zibby/contracts"
import type { ConnectionTester } from "../../integrations/connection-tester"
import type { ChannelAdapter } from "./adapter"
import { EmailChannelAdapter } from "./email.adapter"
import { FakeChannelAdapter } from "./fake.adapter"
import { SlackChannelAdapter } from "./slack.adapter"

/**
 * Resolves the {@link ChannelAdapter} for an integration, honoring
 * `CHANNEL_ADAPTER_MODE`: `"real"` (default) picks by `integration.kind`,
 * `"fake"` substitutes the kind-agnostic {@link FakeChannelAdapter} for every
 * kind (the e2e mode). This is ALSO the integrations module's
 * {@link ConnectionTester} — the 5.1 stub is gone; `test()` now performs the real
 * (or faked) probe through the resolved adapter.
 */
@Injectable()
export class AdapterRegistry implements ConnectionTester {
  private readonly slack = new SlackChannelAdapter()
  private readonly email = new EmailChannelAdapter()
  private readonly fake = new FakeChannelAdapter()

  private fakeMode(): boolean {
    return process.env.CHANNEL_ADAPTER_MODE === "fake"
  }

  /** The adapter that should service this integration this run. */
  resolve(kind: Integration["kind"]): ChannelAdapter {
    if (this.fakeMode()) return this.fake
    switch (kind) {
      case "slack":
        return this.slack
      case "email":
        return this.email
    }
  }

  /** ConnectionTester: probe the integration through its resolved adapter. */
  test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    return this.resolve(integration.kind).test(integration, creds)
  }
}
