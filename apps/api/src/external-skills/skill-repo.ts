import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { AGENT_ID_REGEX } from "@zibby/contracts";
import matter from "gray-matter";

export class InvalidSkillRepoUrlError extends Error {
  constructor(url: string) {
    super(`Not a supported GitHub skill repo URL: ${url}`);
    this.name = "InvalidSkillRepoUrlError";
  }
}

export type SkillCandidate = {
  /** Repo-relative directory, "" for the repo root. */
  path: string;
  id: string;
  name: string;
  desc?: string;
  instructions: string;
};

const NAME_RE = /^[A-Za-z0-9_.-]+$/;

const slugify = (v: string): string =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function parseGitHubSkillUrl(url: string): {
  owner: string;
  repo: string;
  remote: string;
  /** Branch/tag from `/tree/<ref>/…`; absent = the default branch. */
  ref?: string;
  subpath?: string;
} {
  const bad = () => new InvalidSkillRepoUrlError(url);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw bad();
  }
  if (u.protocol !== "https:" || u.hostname !== "github.com") throw bad();
  // Raw string check: URL() would silently resolve ".." segments away.
  if (url.split(/[/\\]/).includes("..")) throw bad();
  const parts = u.pathname.split("/").filter(Boolean);
  const [owner, rawRepo, kind, ref, ...rest] = parts;
  const repo = rawRepo?.replace(/\.git$/, "");
  if (!owner || !repo || !NAME_RE.test(owner) || !NAME_RE.test(repo)) throw bad();
  // Known limitation: a ref containing "/" in /tree/<ref>/... is mis-split (ref = first segment).
  if (parts.length > 2 && kind !== "tree") throw bad();
  if (kind === "tree" && parts.length < 4) throw bad();
  return {
    owner,
    repo,
    remote: `https://github.com/${owner}/${repo}.git`,
    ...(ref ? { ref } : {}),
    ...(rest.length ? { subpath: rest.join("/") } : {}),
  };
}

const refuseCode = () => {
  throw new Error("Executable frontmatter is not allowed in SKILL.md");
};

export function parseSkillMd(
  text: string,
  fallbackId: string,
): { id: string; name: string; desc?: string; instructions: string } {
  // Repo content is untrusted: gray-matter's default js engine would eval `---js` frontmatter.
  const parsed = matter(text, {
    engines: { js: refuseCode, javascript: refuseCode },
  });
  const fm = parsed.data as Record<string, unknown>;
  const name = typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackId;
  const fromName = slugify(name);
  const id = AGENT_ID_REGEX.test(fromName) ? fromName : slugify(fallbackId);
  if (!AGENT_ID_REGEX.test(id)) throw new Error(`No valid skill id for "${name}"`);
  const desc =
    typeof fm.description === "string" && fm.description.trim() ? fm.description.trim() : undefined;
  return { id, name, ...(desc ? { desc } : {}), instructions: parsed.content.trim() };
}

/** Is `<root>/<subpath>` a real directory inside root, with no symlinked segment? */
async function subpathIsSafe(root: string, subpath: string): Promise<boolean> {
  try {
    let cur = root;
    for (const seg of subpath.split("/")) {
      cur = join(cur, seg);
      if ((await lstat(cur)).isSymbolicLink()) return false;
    }
    const [real, realRoot] = await Promise.all([realpath(cur), realpath(root)]);
    return real === realRoot || real.startsWith(realRoot + sep);
  } catch {
    return false; // missing subpath
  }
}

export async function scanSkillDir(
  root: string,
  subpath?: string,
  repoName?: string,
): Promise<SkillCandidate[]> {
  if (subpath && subpath.split("/").some((s) => s === ".." || s === "")) {
    throw new InvalidSkillRepoUrlError(subpath);
  }
  if (subpath && !(await subpathIsSafe(root, subpath))) return [];
  const found: SkillCandidate[] = [];
  const rootName = repoName ?? basename(root);
  async function walk(rel: string): Promise<void> {
    const entries = await readdir(join(root, rel), { withFileTypes: true });
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        await walk(rel ? `${rel}/${e.name}` : e.name);
      } else if (e.isFile() && e.name === "SKILL.md") {
        const text = await readFile(join(root, rel, e.name), "utf8");
        const dir = rel ? basename(rel) : rootName;
        try {
          found.push({ path: rel, ...parseSkillMd(text, dir) });
        } catch {
          // ponytail: unparseable / unsafe SKILL.md is skipped silently; surface per-skill errors if needed
        }
      }
    }
  }
  await walk(subpath ?? "");
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
