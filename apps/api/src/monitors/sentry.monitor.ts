import type { CredentialsInput, Integration } from "@zibby/contracts";
import type { MonitorAdapter, MonitorAlert, MonitorPollResult } from "./monitor-adapter";

const DEFAULT_BASE = "https://sentry.io";

/** Sentry issue actionability, ranked so `minLevel` is a floor comparison. */
const LEVEL_RANK: Record<string, number> = { warning: 1, error: 2, fatal: 3 };

/** Tolerant shape of one Sentry issue — only the fields we read. */
interface SentryIssue {
  id?: string;
  shortId?: string;
  title?: string;
  culprit?: string;
  level?: string;
  permalink?: string;
  firstSeen?: string;
  lastSeen?: string;
  count?: string;
}

/** PAT from the closed credentials union (null if absent) — mirrors github-ci's helper. */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}

/** Satisfy `EVENT_ID_REGEX` (`monitor-event.store.ts`) — no slashes/colons from a slug. */
function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

/**
 * The second monitor (NS2 F7a): Sentry. Polls
 * `/api/0/projects/{org}/{project}/issues/?query=is:unresolved` for an
 * integration of kind `"sentry"` (no `streams` gate — every sentry integration
 * is a monitor), keeps a `firstSeen` cursor, and yields one alert per
 * unresolved issue at or above the integration's configured `minLevel` — the
 * adapter's analogue of github-ci emitting only red runs. Deterministic id
 * `sentry-<org>-<project>-<issueId>` (slugified) makes a re-poll a pure dedup
 * hit. No status snapshot: Sentry has no clean red/green like CI, so v1 omits
 * it (optional on `MonitorPollResult`). Rate limits / auth failures throw (the
 * watcher's retry/backoff owns the failure boundary), exactly like github-ci.
 */
export class SentryMonitor implements MonitorAdapter {
  readonly kind = "sentry" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  wants(integration: Integration): boolean {
    return integration.config.kind === "sentry";
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<MonitorPollResult> {
    if (integration.config.kind !== "sentry") throw new Error("not a sentry integration");
    const token = tokenOf(creds);
    if (!token) throw new Error("no sentry token configured");
    const { org, project, baseUrl, minLevel } = integration.config;
    const base = baseUrl ?? DEFAULT_BASE;

    const res = await this.fetchImpl(
      `${base}/api/0/projects/${org}/${project}/issues/?query=is%3Aunresolved&sort=new&limit=25`,
      { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
    );
    if (res.status === 429 || res.status === 403 || res.status === 401) {
      throw new Error(`sentry rate limited or unauthorized (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`sentry issues: HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    const issues = Array.isArray(body) ? (body as SentryIssue[]) : [];

    const minRank = LEVEL_RANK[minLevel] ?? 2;
    const events: MonitorAlert[] = [];
    let newest = cursor;
    for (const issue of issues) {
      if (!issue.id) continue;
      const firstSeen = issue.firstSeen ?? new Date(0).toISOString();
      if (newest === undefined || firstSeen > newest) newest = firstSeen;
      if (cursor !== undefined && firstSeen <= cursor) continue;
      const rank = LEVEL_RANK[issue.level ?? ""] ?? 0;
      if (rank < minRank) continue;
      events.push({
        id: `sentry-${slug(org)}-${slug(project)}-${issue.id}`,
        kind: "error-unresolved",
        title: `Sentry: ${issue.title ?? "unresolved error"}`,
        detail: [
          `Project: ${project}`,
          `Level: ${issue.level ?? "?"}`,
          `Culprit: ${issue.culprit ?? "?"}`,
          `Count: ${issue.count ?? "?"}`,
        ]
          .join("\n")
          .slice(0, 4000),
        ...(issue.permalink ? { url: issue.permalink } : {}),
        occurredAt: firstSeen,
      });
    }
    return { events, cursor: newest };
  }
}
