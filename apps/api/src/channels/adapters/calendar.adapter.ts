import { createSign } from "node:crypto";
import type { CredentialsInput, ExternalRef, Integration, TestResult } from "@zibby/contracts";
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** The fields we read out of a Google service-account JSON key. */
interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface CalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  updated?: string;
  htmlLink?: string;
  organizer?: { displayName?: string; email?: string };
  creator?: { displayName?: string; email?: string };
  start?: { dateTime?: string; date?: string };
}

interface EventsResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
  error?: { message?: string };
}

/**
 * Safety bound on pagination: a single poll drains at most this many pages
 * (250 events each) of the look-ahead window. Hitting it is surfaced, not silently
 * swallowed — `orderBy=startTime` plus an `updatedMin` cursor would otherwise drop
 * events past an un-drained cap (their `updated` falls below the advanced cursor).
 */
const MAX_PAGES = 20;

/** Parse the service-account JSON key out of the single `token` credential. */
function serviceAccountOf(creds: CredentialsInput): ServiceAccount | null {
  if (!("token" in creds)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(creds.token);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { client_email, private_key } = parsed as Record<string, unknown>;
  if (typeof client_email !== "string" || typeof private_key !== "string") return null;
  return { client_email, private_key };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Google Calendar adapter over plain `fetch` (Node 20+ global). Auth is a Google
 * service account: the SA JSON key (single `token` credential) signs a short-lived
 * RS256 JWT, exchanged at the OAuth2 token endpoint for an access token — no client
 * secret, no refresh-token expiry, which suits an autonomous heartbeat poller. The
 * operator shares the calendar with the SA's email (no domain-wide delegation for a
 * personal calendar). `poll` lists upcoming events (`timeMin`..`timeMax`), narrows to
 * those changed since the cursor (`updatedMin`), normalizes each to an
 * {@link InboundMessage} with a deterministic `gcal-<eventId>` id, and advances the
 * cursor to the newest `updated` seen. Read-only — `send` rejects (Calendar items
 * are notifications, not a reply surface). No method sleeps on a rate limit; a
 * failure surfaces to the watcher (which retries with backoff, M8).
 */
export class CalendarChannelAdapter implements ChannelAdapter {
  readonly kind = "calendar" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** Self-sign a JWT for the SA and exchange it for an OAuth2 access token. */
  private async accessToken(sa: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: SCOPE,
        aud: TOKEN_ENDPOINT,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = base64url(
      createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key),
    );
    const assertion = `${header}.${claims}.${signature}`;
    const res = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const body = (await res.json()) as {
      access_token?: string;
      error_description?: string;
      error?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new Error(
        `google token exchange: ${body.error_description ?? body.error ?? `HTTP ${res.status}`}`,
      );
    }
    return body.access_token;
  }

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    if (integration.config.kind !== "calendar")
      return { ok: false, detail: "not a calendar integration" };
    const sa = serviceAccountOf(creds);
    if (!sa) return { ok: false, detail: "no service account key configured" };
    try {
      const token = await this.accessToken(sa);
      const res = await this.fetchImpl(
        `${CALENDAR_API}/calendars/${encodeURIComponent(integration.config.calendarId)}`,
        { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
      );
      if (!res.ok) return { ok: false, detail: `calendar lookup: HTTP ${res.status}` };
      const body = (await res.json()) as { summary?: string };
      return { ok: true, detail: `connected${body.summary ? ` to ${body.summary}` : ""}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    if (integration.config.kind !== "calendar") throw new Error("not a calendar integration");
    const sa = serviceAccountOf(creds);
    if (!sa) throw new Error("no service account key configured");
    const { calendarId, lookaheadDays } = integration.config;
    const token = await this.accessToken(sa);

    const now = new Date();
    const timeMax = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

    const items: InboundMessage[] = [];
    let newest = cursor;
    let pageToken: string | undefined;
    let page = 0;
    // Drain every page of the look-ahead window before advancing the cursor: with
    // `orderBy=startTime` an un-drained page would leave events whose `updated` is
    // below the new cursor permanently excluded on the next incremental poll.
    do {
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      // Incremental filter (`updatedMin` is compatible with the time window, unlike
      // `syncToken`).
      if (cursor) params.set("updatedMin", cursor);
      if (pageToken) params.set("pageToken", pageToken);

      const res = await this.fetchImpl(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
      );
      if (res.status === 429)
        throw new Error(
          `google calendar rate limited (retry_after ${res.headers.get("retry-after") ?? "?"})`,
        );
      const body = (await res.json()) as EventsResponse;
      if (!res.ok)
        throw new Error(`google calendar events: ${body.error?.message ?? `HTTP ${res.status}`}`);

      for (const event of body.items ?? []) {
        if (!event.id || event.status === "cancelled") continue;
        const updated = event.updated ?? new Date(0).toISOString();
        const start = event.start?.dateTime ?? event.start?.date ?? "";
        const ref: ExternalRef = { channel: calendarId, messageId: event.id };
        items.push({
          id: `gcal-${event.id}`,
          externalRef: ref,
          from: event.organizer?.displayName ?? event.organizer?.email ?? event.creator?.email,
          receivedAt: new Date(updated).toISOString(),
          text: `${start ? `[${start}] ` : ""}${event.summary ?? "(no title)"}`.trim(),
          raw: event,
        });
        if (newest === undefined || updated > newest) newest = updated;
      }

      pageToken = body.nextPageToken;
      page += 1;
      if (pageToken && page >= MAX_PAGES) {
        // Don't advance the cursor past an un-read tail — keep the old cursor so the
        // window is re-scanned next tick rather than silently dropping events.
        throw new Error(
          `google calendar: look-ahead window exceeds ${MAX_PAGES} pages; narrow lookaheadDays`,
        );
      }
    } while (pageToken);

    return { items, cursor: newest };
  }

  /** Calendar items are read-only notifications, not a reply surface. */
  async send(): Promise<void> {
    throw new Error("calendar integration is read-only");
  }
}
