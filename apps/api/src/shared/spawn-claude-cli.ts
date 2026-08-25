import { spawn } from "node:child_process";
import { Logger } from "@nestjs/common";

const logger = new Logger("spawnClaudeCli");

/**
 * Per-stream cap on accumulated stdout/stderr, in characters. Reuses the exact
 * number already established by `goals/goal-runner.service.ts` `SHELL_OUTPUT_CAP`
 * and `runner/runner-core.ts` `MAX_LOG_READ_BYTES` — don't invent a third.
 */
const DEFAULT_MAX_OUTPUT_CHARS = 1_000_000;

export interface SpawnClaudeCliOptions {
  /** Full `claude` CLI argv, e.g. `["-p", prompt, "--output-format", "json", "--model", "haiku"]`. */
  args: string[];
  /** Milliseconds before the child is killed and the call rejects with a timeout error. */
  timeoutMs: number;
  /** Identifies the caller in the timeout/exit error messages, e.g. "router", "briefer". */
  label: string;
  /** Per-stream output cap, in characters. Defaults to {@link DEFAULT_MAX_OUTPUT_CHARS}. */
  maxOutputBytes?: number;
  /**
   * Working directory for the child. Omitted by every classify/summarize caller
   * (they inherit the API process cwd); set by the reply researcher, which must
   * read the project's repo. Additive — existing callers are unaffected.
   */
  cwd?: string;
}

/**
 * Spawn the `claude` CLI as a one-shot `-p` call, capture stdout, and resolve
 * its trimmed text. Rejects on a non-zero exit, a spawn error, or the timeout
 * (killing the child first). This is the shared body that
 * `tasks/claude-cli-router.ts`, `tasks/claude-cli-task-namer.ts`,
 * `briefing/claude-cli-briefer.ts`, `memory/claude-cli-distiller.ts`, and
 * `channels/triage/claude-cli-triager.ts` each used to hand-roll as a
 * byte-identical copy; every one of them keeps its own prompt-building,
 * parsing, and schema — only this spawn/timeout/collect body was duplicated.
 *
 * **Bare `child.kill()` is intentional here — NOT `killGroup(pgid)`.**
 * `runner-core.ts`/`goal-runner.service.ts` spawn long-running `detached: true`
 * processes that can themselves fork a subprocess tree, so they must kill the
 * whole process group to avoid orphans. Every caller of this helper is a
 * one-shot `claude -p` classify/summarize call — not detached, no group to
 * orphan — so a plain kill of the single child is correct. Do not "fix" this
 * to `killGroup` to match those other two call sites.
 */
export function spawnClaudeCli(opts: SpawnClaudeCliOptions): Promise<string> {
  const maxChars = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_CHARS;

  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN ?? "claude", opts.args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    });

    let stdout = "";
    let stderr = "";
    let stdoutCapped = false;
    let stderrCapped = false;

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${opts.label} timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    timer.unref?.();

    child.stdout?.on("data", (buf: Buffer) => {
      // Head-truncate: stop appending once the cap is hit, rather than
      // goal-runner's tail-keeping. `extractResultText` (each caller's own
      // parser) reads the JSON verdict from the FRONT of the reply (the
      // first `{` … the last `}` within what it captured) — a tail-cap could
      // cut off the opening brace a truncated reply still needs.
      if (stdout.length < maxChars) {
        stdout += buf.toString("utf8");
        if (stdout.length >= maxChars && !stdoutCapped) {
          stdoutCapped = true;
          logger.debug(`${opts.label}: stdout hit the ${maxChars}-char cap, truncating`);
        }
      }
    });
    child.stderr?.on("data", (buf: Buffer) => {
      if (stderr.length < maxChars) {
        stderr += buf.toString("utf8");
        if (stderr.length >= maxChars && !stderrCapped) {
          stderrCapped = true;
          logger.debug(`${opts.label}: stderr hit the ${maxChars}-char cap, truncating`);
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
    });
  });
}
