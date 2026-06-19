import { Injectable } from "@nestjs/common";
import type { CredentialsInput, Integration, TestResult } from "@zibby/contracts";
import type { ConnectionTester } from "../../integrations/connection-tester";
import type { ChannelAdapter } from "./adapter";
import { CalendarChannelAdapter } from "./calendar.adapter";
import { EmailChannelAdapter } from "./email.adapter";
import { FakeChannelAdapter } from "./fake.adapter";
import { GitHubChannelAdapter } from "./github.adapter";
import { JiraChannelAdapter } from "./jira.adapter";
import { SlackChannelAdapter } from "./slack.adapter";

/**
 * Resolves the {@link ChannelAdapter} for an integration. In production it always picks
 * the real adapter by `integration.kind`. The kind-agnostic {@link FakeChannelAdapter}
 * is a test-only seam: it is substituted for every kind ONLY when `CHANNEL_FAKE_DIR` is
 * set (the offline e2e/unit mode), an env the harness owns — never operator-facing config.
 * This is ALSO the integrations module's {@link ConnectionTester} — the 5.1 stub is gone;
 * `test()` now performs the real (or faked) probe through the resolved adapter.
 */
@Injectable()
export class AdapterRegistry implements ConnectionTester {
  private readonly slack = new SlackChannelAdapter();
  private readonly email = new EmailChannelAdapter();
  private readonly jira = new JiraChannelAdapter();
  private readonly github = new GitHubChannelAdapter();
  private readonly calendar = new CalendarChannelAdapter();
  private readonly fake = new FakeChannelAdapter();

  /** Test-only fake-channel seam — on iff the harness set `CHANNEL_FAKE_DIR`. */
  private fakeMode(): boolean {
    return Boolean(process.env.CHANNEL_FAKE_DIR);
  }

  /** The adapter that should service this integration this run. */
  resolve(kind: Integration["kind"]): ChannelAdapter {
    if (this.fakeMode()) return this.fake;
    switch (kind) {
      case "slack":
        return this.slack;
      case "email":
        return this.email;
      case "jira":
        return this.jira;
      case "github":
        return this.github;
      case "calendar":
        return this.calendar;
    }
  }

  /** ConnectionTester: probe the integration through its resolved adapter. */
  test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    return this.resolve(integration.kind).test(integration, creds);
  }
}
