import type { CredentialsInput, JiraConfig } from "@zibby/contracts";

/** Bounds the pagination loop — a full fetch must still terminate. */
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

/** PAT/API-token from the closed credentials union (null if absent). */
export function tokenOf(creds: CredentialsInput | null): string | null {
  return creds && "token" in creds ? creds.token : null;
}

/** Jira Cloud Basic auth: `email:apiToken`. */
export function jiraAuthHeader(config: JiraConfig, token: string): string {
  return `Basic ${Buffer.from(`${config.email}:${token}`).toString("base64")}`;
}

export interface JiraStatus {
  name?: string;
  statusCategory?: { key?: string };
}

export interface JiraIssue {
  key?: string;
  fields?: {
    summary?: string;
    /** ADF JSON (API v3), not plain text — see `adfToMarkdown`. */
    description?: unknown;
    issuetype?: { name?: string; hierarchyLevel?: number };
    parent?: {
      key?: string;
      fields?: {
        summary?: string;
        status?: JiraStatus;
        issuetype?: { name?: string; hierarchyLevel?: number };
      };
    };
    status?: JiraStatus;
    updated?: string;
    [field: string]: unknown;
  };
}

interface JiraSearchResponse {
  issues?: JiraIssue[];
  /** Cursor pagination (`/search/jql`): the token for the NEXT page, absent on the last. */
  nextPageToken?: string;
  isLast?: boolean;
  errorMessages?: string[];
}

/**
 * Every issue matching `jql` via `/rest/api/3/search/jql`. The old offset-based `/search` was
 * removed by Atlassian (410 Gone); this one paginates by an opaque `nextPageToken` cursor and
 * returns no `total` — a page is the last when it says `isLast` or omits `nextPageToken`.
 */
export async function searchJira(
  fetchImpl: typeof fetch,
  baseUrl: string,
  authHeader: string,
  jql: string,
  fields: string,
): Promise<JiraIssue[]> {
  const out: JiraIssue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({ jql, maxResults: String(PAGE_SIZE), fields });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);
    const res = await fetchImpl(`${baseUrl}/rest/api/3/search/jql?${params}`, {
      headers: { authorization: authHeader, accept: "application/json" },
    });
    if (res.status === 429) {
      throw new Error(`jira rate limited (retry_after ${res.headers.get("retry-after") ?? "?"})`);
    }
    const body = (await res.json()) as JiraSearchResponse;
    if (!res.ok) {
      throw new Error(`jira search: ${body.errorMessages?.join("; ") ?? `HTTP ${res.status}`}`);
    }
    const issues = body.issues ?? [];
    out.push(...issues);
    if (issues.length === 0 || body.isLast || !body.nextPageToken) break;
    nextPageToken = body.nextPageToken;
  }
  return out;
}
