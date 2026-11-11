import { Injectable, Optional } from "@nestjs/common";
import { codeOwnersOf } from "./pr-reviewers";

/** The operator as CODEOWNERS sees them: their login and their teams as `org/slug`. */
interface CodeOwnerIdentity {
  login: string;
  teams: readonly string[];
}

/** Is one of `owners` the operator (`@login`) or a team they are in (`@org/slug`)? Emails never count. */
function isMine(owners: readonly string[], me: CodeOwnerIdentity): boolean {
  const mine = new Set([me.login, ...me.teams].map((o) => o.toLowerCase()));
  return owners.some((o) => o.startsWith("@") && mine.has(o.slice(1).toLowerCase()));
}

const GITHUB_API = "https://api.github.com";
/** GitHub's own lookup order; the first file found is the only one used. */
const CODEOWNERS_PATHS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"] as const;
const IDENTITY_TTL_MS = 10 * 60_000;
const CODEOWNERS_TTL_MS = 5 * 60_000;

/**
 * Which changed files of a PR a ZIBBY review covers.
 * - `all` — review everything (no CODEOWNERS, every file is mine, or a lookup failed: fail open).
 * - `mine` — only `files`; `owners` are the matched owner ids, `source` is `<path>@<ref>`.
 * - `none` — no changed file is owned by the operator or their teams.
 */
export type ReviewScope =
  | { kind: "all"; reason: string }
  | { kind: "mine"; files: string[]; outOfScope: number; owners: string[]; source: string }
  | { kind: "none"; files: number; source: string };

/**
 * The operator's code-owner identity (`GET /user` + `GET /user/teams`) and a repo's CODEOWNERS,
 * read with the project's token, both cached. Matching is `codeOwnersOf` from the PR "Reviewers"
 * tree (`inbox/pr-reviewers.ts`, last rule wins). Its GraphQL read (InboxPrThreadsService) answers
 * "who is in the PR's teams", not "which teams am I in", hence this REST identity lookup.
 * ponytail: first 100 teams only; in-memory TTL caches, lost on restart.
 */
@Injectable()
export class CodeOwnersService {
  private readonly fetchImpl: typeof fetch;
  private readonly identities = new Map<string, { at: number; me: CodeOwnerIdentity }>();
  private readonly codeowners = new Map<
    string,
    { at: number; file?: { path: string; text: string } }
  >();

  constructor(@Optional() fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  /** Never throws: any lookup failure reads `all` with the reason. `baseRef` absent → default branch. */
  async reviewScope(
    repo: string,
    baseRef: string | undefined,
    token: string,
    files: readonly string[],
  ): Promise<ReviewScope> {
    const at = `${repo}@${baseRef ?? "default branch"}`;
    try {
      const file = await this.codeownersFile(repo, baseRef, token);
      if (!file) return { kind: "all", reason: `no CODEOWNERS in ${at}` };
      const me = await this.identity(token);
      const owners = new Set<string>();
      const mine = files.filter((f) => {
        const o = codeOwnersOf(file.text, f);
        if (!isMine(o, me)) return false;
        for (const id of o) if (isMine([id], me)) owners.add(id);
        return true;
      });
      const source = `${file.path}@${baseRef ?? "default branch"}`;
      if (mine.length === 0) return { kind: "none", files: files.length, source };
      if (mine.length === files.length)
        return { kind: "all", reason: "every changed file is owned by your teams" };
      return {
        kind: "mine",
        files: mine,
        outOfScope: files.length - mine.length,
        owners: [...owners],
        source,
      };
    } catch (error) {
      return {
        kind: "all",
        reason: `code owners unavailable (${error instanceof Error ? error.message : String(error)})`,
      };
    }
  }

  private async identity(token: string): Promise<CodeOwnerIdentity> {
    const hit = this.identities.get(token);
    if (hit && Date.now() - hit.at < IDENTITY_TTL_MS) return hit.me;
    const [user, teams] = await Promise.all([
      this.json<{ login?: unknown }>(token, "/user"),
      this.json<unknown>(token, "/user/teams?per_page=100"),
    ]);
    if (typeof user.login !== "string") throw new Error("github /user: no login");
    const me: CodeOwnerIdentity = {
      login: user.login,
      teams: (Array.isArray(teams) ? teams : []).flatMap((t: unknown) => {
        const { slug, organization } = (t ?? {}) as {
          slug?: unknown;
          organization?: { login?: unknown };
        };
        return typeof slug === "string" && typeof organization?.login === "string"
          ? [`${organization.login}/${slug}`]
          : [];
      }),
    };
    this.identities.set(token, { at: Date.now(), me });
    return me;
  }

  private async codeownersFile(
    repo: string,
    ref: string | undefined,
    token: string,
  ): Promise<{ path: string; text: string } | undefined> {
    const key = `${token}\n${repo.toLowerCase()}@${ref ?? ""}`;
    const hit = this.codeowners.get(key);
    if (hit && Date.now() - hit.at < CODEOWNERS_TTL_MS) return hit.file;
    let file: { path: string; text: string } | undefined;
    for (const path of CODEOWNERS_PATHS) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${repo}/contents/${path}${query}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github.raw" },
      });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`github ${path}: HTTP ${res.status}`);
      file = { path, text: await res.text() };
      break;
    }
    this.codeowners.set(key, { at: Date.now(), file });
    return file;
  }

  private async json<T>(token: string, path: string): Promise<T> {
    const res = await this.fetchImpl(`${GITHUB_API}${path}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(`github ${path.split("?")[0]}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
