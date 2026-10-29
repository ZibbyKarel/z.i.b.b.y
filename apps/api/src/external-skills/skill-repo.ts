import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
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

export function parseGitHubSkillUrl(url: string): {
  owner: string;
  repo: string;
  remote: string;
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
  const [owner, rawRepo, kind, , ...rest] = parts;
  const repo = rawRepo?.replace(/\.git$/, "");
  if (!owner || !repo) throw bad();
  if (parts.length > 2 && kind !== "tree") throw bad();
  if (kind === "tree" && parts.length < 4) throw bad();
  const out = { owner, repo, remote: `https://github.com/${owner}/${repo}.git` };
  return rest.length ? { ...out, subpath: rest.join("/") } : out;
}

export function parseSkillMd(
  text: string,
  fallbackId: string,
): { id: string; name: string; desc?: string; instructions: string } {
  const parsed = matter(text);
  const fm = parsed.data as Record<string, unknown>;
  const name = typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : fallbackId;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const id = AGENT_ID_REGEX.test(slug) ? slug : fallbackId;
  const desc =
    typeof fm.description === "string" && fm.description.trim() ? fm.description.trim() : undefined;
  return { id, name, ...(desc ? { desc } : {}), instructions: parsed.content.trim() };
}

export async function scanSkillDir(root: string, subpath?: string): Promise<SkillCandidate[]> {
  if (subpath && subpath.split("/").some((s) => s === ".." || s === "")) {
    throw new InvalidSkillRepoUrlError(subpath);
  }
  const found: SkillCandidate[] = [];
  const rootName = basename(root);
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
        found.push({ path: rel, ...parseSkillMd(text, dir) });
      }
    }
  }
  await walk(subpath ?? "");
  return found.sort((a, b) => a.path.localeCompare(b.path));
}
