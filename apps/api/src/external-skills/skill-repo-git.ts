import { Injectable } from "@nestjs/common";
import { GIT_NETWORK_TIMEOUT_MS, GIT_TIMEOUT_MS, exec } from "../shared/git-exec";
import { SkillRepoGitError } from "./external-skills.errors";

const MAX_MESSAGE = 2000;

async function git(args: string[], timeout: number, cwd?: string): Promise<string> {
  try {
    const { stdout } = await exec("git", args, {
      cwd,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      // A private/missing repo must fail, not hang on a credential prompt.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return String(stdout).trim();
  } catch (error) {
    const e = error as { stderr?: unknown; message?: string };
    const message = String(e.stderr ?? "").trim() || e.message || "failed";
    throw new SkillRepoGitError(`git ${args[0]}: ${message}`.slice(0, MAX_MESSAGE));
  }
}

/**
 * The one seam through which external skills touch git (modelled on
 * `MarketplaceCli`). Tests substitute a fake with the same three methods.
 */
@Injectable()
export class SkillRepoGit {
  /** Shallow clone `remote` into `dest`; resolves to the cloned HEAD sha. */
  async clone(remote: string, dest: string): Promise<string> {
    await git(["clone", "--depth", "1", "--", remote, dest], GIT_NETWORK_TIMEOUT_MS);
    return git(["rev-parse", "HEAD"], GIT_TIMEOUT_MS, dest);
  }

  /** The remote's current HEAD sha, without cloning. */
  async lsRemoteHead(remote: string): Promise<string> {
    const out = await git(["ls-remote", "--", remote, "HEAD"], GIT_NETWORK_TIMEOUT_MS);
    const sha = out.split(/\s/)[0];
    if (!sha) throw new SkillRepoGitError(`git ls-remote: no HEAD for ${remote}`);
    return sha;
  }

  /** The git tree sha of `path` at HEAD ("" = repo root); null when it does not exist. */
  async treeSha(cloneDir: string, path: string): Promise<string | null> {
    const rev = path ? `HEAD:${path}` : "HEAD^{tree}";
    try {
      return await git(["rev-parse", "--verify", "--quiet", rev], GIT_TIMEOUT_MS, cloneDir);
    } catch {
      return null;
    }
  }
}
