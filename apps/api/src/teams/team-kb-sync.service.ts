import { realpath } from "node:fs/promises";
import { Injectable } from "@nestjs/common";
import { GIT_NETWORK_TIMEOUT_MS, GIT_TIMEOUT_MS, exec, isGitRepo } from "../shared/git-exec";

export interface TeamKbSyncResult {
  updated: boolean;
  before: string;
  after: string;
}

/** Raised when the KB clone cannot be fast-forwarded (not a repo, diverged, dirty overlap, network). */
export class TeamKbSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamKbSyncError";
  }
}

const STDERR_MAX = 300;

/**
 * Operator-triggered `git pull --ff-only --no-rebase` (overrides a user `pull.rebase`, which refuses any dirty tree) of a team's KB checkout. This is the
 * only write the app ever does to a KB clone, and it is fast-forward-only: it
 * never creates commits, never overwrites local changes (git refuses if the
 * incoming changes touch dirty files) and never rewrites history. The KB's
 * `readOnly` law means ZIBBY never authors into it; a ff pull just syncs the
 * operator's clone with its remote.
 */
@Injectable()
export class TeamKbSyncService {
  async sync(kbPath: string): Promise<TeamKbSyncResult> {
    if (!(await isGitRepo(kbPath))) throw new TeamKbSyncError("not a git repository");
    // `rev-parse` walks up: a KB folder nested in some OTHER repo must never pull that repo.
    const { stdout: top } = await exec("git", ["rev-parse", "--show-toplevel"], {
      cwd: kbPath,
      timeout: GIT_TIMEOUT_MS,
    });
    if ((await realpath(top.trim())) !== (await realpath(kbPath))) {
      throw new TeamKbSyncError("knowledge base path is not the root of its own git repository");
    }
    const before = await this.head(kbPath);
    try {
      await exec("git", ["pull", "--ff-only", "--no-rebase"], {
        cwd: kbPath,
        timeout: GIT_NETWORK_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (error) {
      const stderr = (error as { stderr?: unknown }).stderr;
      const raw = typeof stderr === "string" && stderr.trim() ? stderr : String(error);
      throw new TeamKbSyncError(raw.trim().slice(0, STDERR_MAX));
    }
    const after = await this.head(kbPath);
    return { updated: before !== after, before, after };
  }

  private async head(cwd: string): Promise<string> {
    const { stdout } = await exec("git", ["rev-parse", "--short", "HEAD"], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim();
  }
}
