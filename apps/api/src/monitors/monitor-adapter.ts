import type { CredentialsInput, Integration, MonitorEventKind } from "@zibby/contracts";

/**
 * A monitor event as an adapter yields it, BEFORE it becomes a persisted
 * `MonitorEvent` (the watcher attributes it to the integration/project and owns
 * state). The adapter derives the deterministic `id` per source occurrence
 * (GitHub CI: `ci-<repo>-<runId>-<attempt>`), so dedup is a pure id-collision
 * check and a re-poll is replay-safe.
 */
export interface MonitorAlert {
  id: string;
  kind: MonitorEventKind;
  title: string;
  detail: string;
  url?: string;
  occurredAt: string;
}

/** What one monitor poll returns: new alerts plus the advanced opaque cursor. */
export interface MonitorPollResult {
  events: MonitorAlert[];
  cursor: string | undefined;
}

/**
 * The monitor seam (N3) — deliberately DISTINCT from `ChannelAdapter`: a monitor
 * emits **status/alert events about the world** (a red build, later a Sentry
 * error spike), never conversational messages, and has no reply surface. One
 * implementation per source; selection is by `wants()` so a future monitor
 * (Sentry) plugs into the registry without any watcher/runtime change. No method
 * may throw out of a heartbeat tick beyond the poll itself — the watcher owns
 * retry/backoff and the per-integration failure boundary.
 */
export interface MonitorAdapter {
  /** The adapter's own kind tag (diagnostic; e.g. "github-ci", "fake"). */
  readonly kind: string;
  /** Whether this adapter watches the given integration (config opt-in check). */
  wants(integration: Integration): boolean;
  /** Fetch alerts newer than `cursor`; return them + the advanced cursor. */
  poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<MonitorPollResult>;
}

/**
 * The pluggable roster. Adapters self-contain their opt-in (`wants`), so adding
 * a monitor is `register()` + nothing else — the Sentry seam. Multiple adapters
 * may watch the same integration (each keeps its own cursor namespace).
 */
export class MonitorAdapterRegistry {
  private readonly adapters: MonitorAdapter[] = [];

  register(adapter: MonitorAdapter): void {
    this.adapters.push(adapter);
  }

  /** Every registered adapter that wants this integration. */
  forIntegration(integration: Integration): MonitorAdapter[] {
    return this.adapters.filter((a) => a.wants(integration));
  }
}
