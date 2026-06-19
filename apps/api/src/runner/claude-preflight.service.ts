import { spawn } from "node:child_process";
import { Injectable, Optional } from "@nestjs/common";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** Outcome of one preflight probe of the `claude` CLI. */
export interface ClaudePreflight {
  ok: boolean;
  /** CLI version string, present when the probe succeeded. */
  version?: string;
  /** Short failure reason — `"missing"` when the binary isn't on PATH. */
  reason?: string;
}

/**
 * Thrown when a claude-shaped run is refused because the CLI is unavailable.
 * Controllers map it to a 503; the task scheduler's dispatch catch turns it into
 * a `failed` task record carrying the readable reason — no dead run records.
 */
export class ClaudeUnavailableError extends Error {
  constructor(public readonly reason: string) {
    super(`Claude CLI unavailable: ${reason}`);
    this.name = "ClaudeUnavailableError";
  }
}

/** Probe timeout: a healthy `claude --version` answers well under this. */
const PROBE_TIMEOUT_MS = 5_000;
/** A passing probe is trusted for this long before re-probing. */
const OK_TTL_MS = 30_000;
/** A failing probe is retried sooner so recovery (e.g. PATH fix) shows quickly. */
const FAIL_TTL_MS = 5_000;

/**
 * Answers "can this machine run `claude -p` right now?" — spawns
 * `${CLAUDE_BIN ?? "claude"} --version` with a short timeout and caches the
 * verdict (30s ok / 5s failure). Health reports `degraded` from it, and the
 * runners refuse to start a claude-shaped run while it fails (503), so a typed
 * task never produces a dead run record when the CLI is missing or broken.
 */
@Injectable()
export class ClaudePreflightService {
  private cache: { result: ClaudePreflight; expiresAt: number } | null = null;
  private readonly log?: ScopedLogger;

  constructor(@Optional() logger?: LoggerService) {
    this.log = logger?.child(ClaudePreflightService.name);
  }

  /** Probe the CLI, serving the cached verdict while its TTL holds. */
  async probe(opts?: { force?: boolean }): Promise<ClaudePreflight> {
    if (!opts?.force && this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.result;
    }
    let result = await this.versionProbe();
    if (result.ok) result = await this.authProbe(result);
    if (!result.ok) {
      this.log?.warn("claude preflight failed", { reason: result.reason });
    }
    this.cache = {
      result,
      expiresAt: Date.now() + (result.ok ? OK_TTL_MS : FAIL_TTL_MS),
    };
    return result;
  }

  /** Throw {@link ClaudeUnavailableError} unless the CLI currently probes ok. */
  async assertAvailable(): Promise<void> {
    const result = await this.probe();
    if (!result.ok) throw new ClaudeUnavailableError(result.reason ?? "unknown");
  }

  /** Spawn `claude --version`; resolves (never rejects) with the verdict. */
  private async versionProbe(): Promise<ClaudePreflight> {
    const probe = await this.capture(["--version"], "version probe");
    if (!probe.ok) return probe;
    return { ok: true, version: probe.stdout.trim() };
  }

  /**
   * Auth probe — pinned by the Phase 1.4 smoke audit: `claude auth status`
   * prints a JSON object with `loggedIn` and exits 0. A binary that exists but
   * has no session would accept every run only to fail it at spawn; this turns
   * that into an up-front refusal.
   */
  private async authProbe(versionResult: ClaudePreflight): Promise<ClaudePreflight> {
    const probe = await this.capture(["auth", "status"], "auth probe");
    if (!probe.ok) return probe;
    try {
      const status = JSON.parse(probe.stdout) as { loggedIn?: boolean };
      if (status.loggedIn === true) return versionResult;
      return { ok: false, reason: "not logged in" };
    } catch {
      return { ok: false, reason: "auth probe returned unparseable output" };
    }
  }

  /** Spawn the CLI with `args`; capture stdout; never rejects. */
  private capture(
    args: string[],
    label: string,
  ): Promise<{ ok: true; stdout: string } | { ok: false; reason: string }> {
    return new Promise((resolve) => {
      const bin = process.env.CLAUDE_BIN ?? "claude";
      let settled = false;
      const settle = (result: { ok: true; stdout: string } | { ok: false; reason: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      } catch (error) {
        settle({ ok: false, reason: error instanceof Error ? error.message : String(error) });
        return;
      }

      const timer = setTimeout(() => {
        child.kill();
        settle({ ok: false, reason: `${label} timed out` });
      }, PROBE_TIMEOUT_MS);
      timer.unref?.();

      let out = "";
      child.stdout?.on("data", (buf: Buffer) => {
        out += buf.toString("utf8");
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        settle({ ok: false, reason: error.code === "ENOENT" ? "missing" : error.message });
      });
      child.on("exit", (code) => {
        if (code === 0) settle({ ok: true, stdout: out });
        else settle({ ok: false, reason: `${label} exited with code ${code}` });
      });
    });
  }
}
