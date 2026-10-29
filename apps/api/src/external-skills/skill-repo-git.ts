import { Injectable } from "@nestjs/common";
import { GIT_NETWORK_TIMEOUT_MS, GIT_TIMEOUT_MS, exec } from "../shared/git-exec";
import { SkillRepoGitError } from "./external-skills.errors";

const MAX_MESSAGE = 2000;

type GitFailure = { code?: unknown; stderr?: unknown; message?: string };

const stderrOf = (e: GitFailure): string => String(e.stderr ?? "").trim();

const toError = (args: string[], e: GitFailure): SkillRepoGitError =>
  new SkillRepoGitError(
    `git ${args[0]}: ${stderrOf(e) || e.message || "failed"}`.slice(0, MAX_MESSAGE),
  );

/** Raw `git` call → trimmed stdout; rejects with the child's error. */
async function rawGit(args: string[], timeout: number, cwd?: string): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    // A private/missing repo must fail, not hang on a credential prompt.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return String(stdout).trim();
}

async function git(args: string[], timeout: number, cwd?: string): Promise<string> {
  try {
    return await rawGit(args, timeout, cwd);
  } catch (error) {
    throw toError(args, error as GitFailure);
  }
}

/**
 * The one seam through which external skills touch git (modelled on
 * `MarketplaceCli`). Tests substitute a fake with the same three methods.
 */
@Injectable()
export class SkillRepoGit {
  /** Shallow clone `remote` (at branch/tag `ref`, else the default branch) into `dest`; resolves to HEAD. */
  async clone(remote: string, dest: string, ref?: string): Promise<string> {
    const branch = ref ? ["--branch", ref] : [];
    await git(["clone", "--depth", "1", ...branch, "--", remote, dest], GIT_NETWORK_TIMEOUT_MS);
    return git(["rev-parse", "HEAD"], GIT_TIMEOUT_MS, dest);
  }

  /** The remote's current sha of `ref` (default `HEAD`), without cloning. */
  async lsRemoteHead(remote: string, ref?: string): Promise<string> {
    const pattern = ref ?? "HEAD";
    const out = await git(["ls-remote", "--", remote, pattern], GIT_NETWORK_TIMEOUT_MS);
    const rows = out
      .split("\n")
      .map((line) => line.split("\t"))
      .filter((row): row is [string, string] => Boolean(row[0] && row[1]));
    // `ls-remote` matches on the ref's tail, so "main" may also hit "refs/heads/x/main".
    // Prefer the exact branch, then a peeled tag (the commit, not the tag object).
    const wanted = [
      pattern,
      `refs/heads/${pattern}`,
      `refs/tags/${pattern}^{}`,
      `refs/tags/${pattern}`,
    ];
    const sha = wanted.map((name) => rows.find((r) => r[1] === name)?.[0]).find(Boolean);
    if (!sha) throw new SkillRepoGitError(`git ls-remote: no ${pattern} in ${remote}`);
    return sha;
  }

  /** The git tree sha of `path` at HEAD ("" = repo root); null when the path does not exist. */
  async treeSha(cloneDir: string, path: string): Promise<string | null> {
    const args = ["rev-parse", "--verify", "--quiet", path ? `HEAD:${path}` : "HEAD^{tree}"];
    try {
      return await rawGit(args, GIT_TIMEOUT_MS, cloneDir);
    } catch (error) {
      const e = error as GitFailure;
      // `--verify --quiet` reports a missing object as a bare non-zero exit, nothing on stderr.
      if (typeof e.code === "number" && e.code !== 0 && !stderrOf(e)) return null;
      throw toError(args, e);
    }
  }
}
