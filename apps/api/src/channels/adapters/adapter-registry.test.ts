import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterRegistry } from "./adapter-registry";
import { CalendarChannelAdapter } from "./calendar.adapter";
import { EmailChannelAdapter } from "./email.adapter";
import { GitHubChannelAdapter } from "./github.adapter";
import { JiraChannelAdapter } from "./jira.adapter";
import { SentryChannelAdapter } from "./sentry.adapter";
import { SlackChannelAdapter } from "./slack.adapter";

describe("AdapterRegistry.resolve", () => {
  // The global vitest.setup.ts seeds CHANNEL_FAKE_DIR (offline fake-channel mode)
  // for every test file; this suite specifically asserts the REAL per-kind
  // resolution, so it opts out for its own duration.
  let savedFakeDir: string | undefined;
  beforeEach(() => {
    savedFakeDir = process.env.CHANNEL_FAKE_DIR;
    delete process.env.CHANNEL_FAKE_DIR;
  });
  afterEach(() => {
    if (savedFakeDir !== undefined) process.env.CHANNEL_FAKE_DIR = savedFakeDir;
  });

  it("resolves every integration kind to its real adapter (exhaustive switch)", () => {
    const registry = new AdapterRegistry();
    expect(registry.resolve("slack")).toBeInstanceOf(SlackChannelAdapter);
    expect(registry.resolve("email")).toBeInstanceOf(EmailChannelAdapter);
    expect(registry.resolve("jira")).toBeInstanceOf(JiraChannelAdapter);
    expect(registry.resolve("github")).toBeInstanceOf(GitHubChannelAdapter);
    expect(registry.resolve("calendar")).toBeInstanceOf(CalendarChannelAdapter);
  });

  // NS2 F7a — the first monitor-only kind resolves to a readOnly no-op adapter,
  // keeping the exhaustive switch total and the channel watcher a harmless no-op.
  it("resolves 'sentry' to the readOnly no-op SentryChannelAdapter", () => {
    const registry = new AdapterRegistry();
    const adapter = registry.resolve("sentry");
    expect(adapter).toBeInstanceOf(SentryChannelAdapter);
    expect(adapter.readOnly).toBe(true);
  });
});
