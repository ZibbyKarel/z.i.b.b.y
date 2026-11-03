/**
 * GitHub Releases is the update feed. A desktop release is tagged
 * `desktop-v<major>.<minor>.<patch>` (other tags in the repo are ignored) and carries
 * the zipped app plus a `<zip>.sha256` sidecar the CI writes next to it.
 */
export const RELEASE_REPO = "ZibbyKarel/z.i.b.b.y";
export const RELEASE_TAG_PREFIX = "desktop-v";
export const DEFAULT_RELEASES_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=30`;

export type Version = readonly [number, number, number];

export function parseVersion(raw: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** `ZibbyOS-0.2.0-arm64.zip` — matches electron-builder's mac `artifactName`. */
export function zipAssetName(version: string, arch: string): string {
  return `ZibbyOS-${version}-${arch}.zip`;
}

export interface AvailableUpdate {
  version: string;
  tag: string;
  notes: string;
  htmlUrl: string;
  zipUrl: string;
  zipSize: number;
  sha256Url: string;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
  html_url: string;
  assets: GitHubAsset[];
}

function isRelease(value: unknown): value is GitHubRelease {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return typeof r.tag_name === "string" && Array.isArray(r.assets);
}

/**
 * Picks the newest published desktop release that is newer than `currentVersion` and
 * ships a zip + checksum for `arch`. Drafts, prereleases and foreign tags never count.
 */
export function pickUpdate(
  releases: unknown,
  currentVersion: string,
  arch: string,
): AvailableUpdate | undefined {
  const current = parseVersion(currentVersion);
  if (!current || !Array.isArray(releases)) return undefined;

  let best: { version: Version; update: AvailableUpdate } | undefined;
  for (const release of releases) {
    if (!isRelease(release) || release.draft || release.prerelease) continue;
    if (!release.tag_name.startsWith(RELEASE_TAG_PREFIX)) continue;
    const versionText = release.tag_name.slice(RELEASE_TAG_PREFIX.length);
    const version = parseVersion(versionText);
    if (!version || compareVersions(version, current) <= 0) continue;
    if (best && compareVersions(version, best.version) <= 0) continue;

    const zipName = zipAssetName(versionText, arch);
    const zip = release.assets.find((a) => a.name === zipName);
    const sha = release.assets.find((a) => a.name === `${zipName}.sha256`);
    if (!zip || !sha) continue;

    best = {
      version,
      update: {
        version: versionText,
        tag: release.tag_name,
        notes: release.body ?? "",
        htmlUrl: release.html_url,
        zipUrl: zip.browser_download_url,
        zipSize: zip.size,
        sha256Url: sha.browser_download_url,
      },
    };
  }
  return best?.update;
}

/** First hex token of a `shasum -a 256` line (`<hex>  <file>`). */
export function parseSha256File(text: string): string | undefined {
  const token = text.trim().split(/\s+/)[0]?.toLowerCase();
  return token && /^[0-9a-f]{64}$/.test(token) ? token : undefined;
}

export async function fetchReleases(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ZibbyOS-updater" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub releases request failed: HTTP ${res.status}`);
  return res.json();
}
