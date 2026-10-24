/**
 * Pure helpers for comparing and persisting the ZIBBY install's `origin` remote.
 * Kept separate from {@link SelfService} so they're trivially unit-testable.
 */

/** scp-like `[user@]host:owner/repo` — no `://`, a `:` before any `/`. */
const SCP_LIKE = /^(?:[^@/]+@)?([^:/]+):(.+)$/;

/**
 * Canonical comparison key for a git remote: `host/owner/repo`, with the host
 * lowercased, a trailing `/` and `.git` stripped, and any userinfo/port dropped.
 * Maps `git@host:o/r(.git)`, `ssh://git@host/o/r(.git)` and
 * `https://[userinfo@]host/o/r(.git)` to the same key. `undefined` when the
 * input isn't a remote it can parse (never matches anything).
 */
export function normalizeRemote(url: string | undefined): string | undefined {
  const raw = url?.trim();
  if (!raw) return undefined;

  let host: string;
  let repoPath: string;
  if (raw.includes("://")) {
    try {
      const parsed = new URL(raw);
      host = parsed.hostname;
      repoPath = parsed.pathname;
    } catch {
      return undefined;
    }
  } else {
    const m = SCP_LIKE.exec(raw);
    if (!m?.[1] || !m[2]) return undefined;
    host = m[1];
    repoPath = m[2];
  }

  const cleaned = repoPath
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!host || !cleaned) return undefined;
  return `${host.toLowerCase()}/${cleaned}`;
}

/**
 * The remote with its secret part removed, safe to persist (the registry is a
 * git-tracked file) or echo in an error message. `https://` drops the whole
 * userinfo (a token usually rides in the username or password slot); `ssh://`
 * drops only the password — the username (`git`) selects the ssh account and
 * is not a secret. scp-like remotes (`git@host:o/r`) carry no secret part and
 * are returned unchanged.
 */
export function redactRemote(url: string): string {
  if (!url.includes("://")) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.username && !parsed.password) return url;
    parsed.password = "";
    if (parsed.protocol !== "ssh:") parsed.username = "";
    return parsed.toString();
  } catch {
    // Unparseable — never echo anything that might be a credential.
    return url.replace(/\/\/[^/@]*@/, "//");
  }
}
