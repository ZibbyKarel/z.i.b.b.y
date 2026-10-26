import { Injectable } from "@nestjs/common";
import { GIT_NETWORK_TIMEOUT_MS, exec } from "../shared/git-exec";
import { MarketplaceCliError } from "./marketplaces.errors";

/** `claude plugin …` can clone/fetch a marketplace — a generous but finite bound. */
export const CLAUDE_PLUGIN_TIMEOUT_MS = 120_000;

const MAX_MESSAGE = 2000;

async function run(file: string, args: string[], cwd: string | undefined, timeout: number) {
  try {
    const { stdout } = await exec(file, args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024 });
    return String(stdout);
  } catch (error) {
    const e = error as { stderr?: unknown; stdout?: unknown; message?: string };
    const message =
      String(e.stderr ?? "").trim() || String(e.stdout ?? "").trim() || e.message || "failed";
    throw new MarketplaceCliError(
      `${file} ${args.slice(0, 2).join(" ")}: ${message}`.slice(0, MAX_MESSAGE),
    );
  }
}

/**
 * The one seam through which marketplaces touch the outside world: `claude plugin …`
 * and `git …` children (env via `agentBaseEnv`, through `exec`). Tests substitute a
 * fake with the same two methods. A failure throws {@link MarketplaceCliError}
 * carrying the child's trimmed stderr.
 */
@Injectable()
export class MarketplaceCli {
  /** `claude plugin <args>` → stdout. `CLAUDE_BIN` is the same test seam the runner uses. */
  plugin(args: string[]): Promise<string> {
    return run(
      process.env.CLAUDE_BIN ?? "claude",
      ["plugin", ...args],
      undefined,
      CLAUDE_PLUGIN_TIMEOUT_MS,
    );
  }

  /** `git <args>` (clone / pull) → stdout. */
  git(args: string[], cwd?: string): Promise<string> {
    return run("git", args, cwd, GIT_NETWORK_TIMEOUT_MS);
  }
}
