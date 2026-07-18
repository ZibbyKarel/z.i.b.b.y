import type { CredentialsInput, Integration, TestResult } from "@zibby/contracts";
import type { ChannelAdapter, PollResult } from "./adapter";

const DEFAULT_BASE = "https://sentry.io";

/** PAT from the closed credentials union (null if absent). */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}

/**
 * Sentry channel adapter (NS2 F7a, correction 1b) — a `readOnly` no-op. Sentry
 * is a monitor-ONLY integration kind (alerts flow through `SentryMonitor`, not
 * here), but `AdapterRegistry.resolve()` is an exhaustive switch over every
 * `Integration["kind"]` and `ChannelWatcherService` polls every enabled +
 * credentialled integration through it. This adapter keeps the switch total
 * and makes the channel watcher a harmless no-op for a sentry integration —
 * modeled on `CalendarChannelAdapter`'s `readOnly` precedent. `test()` doubles
 * as a real connection-test probe (a lightweight project lookup), so the
 * operator gets a working "Test connection" for free.
 */
export class SentryChannelAdapter implements ChannelAdapter {
  readonly kind = "sentry" as const;
  readonly readOnly = true as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    if (integration.config.kind !== "sentry")
      return { ok: false, detail: "not a sentry integration" };
    const token = tokenOf(creds);
    if (!token) return { ok: false, detail: "no sentry token configured" };
    const { org, project, baseUrl } = integration.config;
    const base = baseUrl ?? DEFAULT_BASE;
    try {
      const res = await this.fetchImpl(`${base}/api/0/projects/${org}/${project}/`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (!res.ok) return { ok: false, detail: `sentry project lookup: HTTP ${res.status}` };
      return { ok: true, detail: `connected to ${org}/${project}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  /** Sentry has no conversational inbound — alerts flow through the monitor watcher. */
  async poll(
    _integration: Integration,
    _creds: CredentialsInput,
    _cursor: string | undefined,
  ): Promise<PollResult> {
    return { items: [], cursor: undefined };
  }

  /** Never reached — `readOnly` short-circuits the reply surface (calendar's posture). */
  async send(): Promise<void> {
    throw new Error("sentry is read-only");
  }
}
