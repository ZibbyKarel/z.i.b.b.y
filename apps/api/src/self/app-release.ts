/**
 * The ZibbyOS.app release feed, as seen by the API: which desktop release is the
 * newest published one. Mirrors `apps/desktop/src/updater/release.ts` (tag prefix,
 * repo, version parsing) without importing from the desktop app.
 */
const RELEASE_TAG_PREFIX = "desktop-v";
export const RELEASES_URL =
  "https://api.github.com/repos/ZibbyKarel/z.i.b.b.y/releases?per_page=30";

const HOUR_MS = 60 * 60 * 1000;
/** A failed lookup is retried sooner than a successful one is refreshed. */
const FAILURE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

type Version = readonly [number, number, number];

function parseVersion(raw: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

/** `a` is a strictly higher `major.minor.patch` than `b`; unparseable → false. */
export function isNewer(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  return va !== undefined && vb !== undefined && compareVersions(va, vb) > 0;
}

export interface LatestDesktopRelease {
  version: string;
  url: string;
}

/** The highest published (non-draft, non-prerelease) `desktop-v*` release. */
export function pickLatestDesktopVersion(releases: unknown): LatestDesktopRelease | undefined {
  if (!Array.isArray(releases)) return undefined;
  let best: { parsed: Version; release: LatestDesktopRelease } | undefined;
  for (const raw of releases) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (r.draft === true || r.prerelease === true) continue;
    if (typeof r.tag_name !== "string" || !r.tag_name.startsWith(RELEASE_TAG_PREFIX)) continue;
    const version = r.tag_name.slice(RELEASE_TAG_PREFIX.length);
    const parsed = parseVersion(version);
    if (!parsed || (best && compareVersions(parsed, best.parsed) <= 0)) continue;
    const url = typeof r.html_url === "string" ? r.html_url : "";
    best = { parsed, release: { version, url } };
  }
  return best?.release;
}

/**
 * Fetches the latest desktop release from GitHub, cached in memory (1 h on
 * success). Never throws — offline, rate limit (403) or a garbage body all
 * resolve to `undefined`.
 */
export class LatestDesktopReleaseCache {
  private cached?: { value: LatestDesktopRelease | undefined; expiresAt: number };

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<LatestDesktopRelease | undefined> {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.value;
    const value = await this.fetchLatest().catch(() => undefined);
    this.cached = { value, expiresAt: this.now() + (value ? HOUR_MS : FAILURE_TTL_MS) };
    return value;
  }

  private async fetchLatest(): Promise<LatestDesktopRelease | undefined> {
    const res = await this.fetchImpl(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "ZibbyOS-api" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GitHub releases request failed: HTTP ${res.status}`);
    return pickLatestDesktopVersion(await res.json());
  }
}
