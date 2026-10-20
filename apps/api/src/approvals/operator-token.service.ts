import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OPERATOR_TOKEN_ENV, OPERATOR_TOKEN_FILE_ENV } from "../shared/agent-env";

export { OPERATOR_TOKEN_ENV, OPERATOR_TOKEN_FILE_ENV };

/**
 * The operator-only credential that authorizes deciding approvals and the inbox
 * clicks that auto-approve (Laws 1 & 4). Env wins; otherwise a 0600 file outside
 * the repo and data dir, created at boot. Agent processes never inherit either env
 * var (agentBaseEnv strips them) and the approval hook denies the obvious reads of
 * the file. The guarantee: an agent cannot decide approvals unless it obtains the
 * token. It is not a hard boundary against the same OS user — see "Known ceiling"
 * in docs/api/approvals.md.
 */
@Injectable()
export class OperatorTokenService implements OnModuleInit {
  private readonly logger = new Logger(OperatorTokenService.name);
  private cached: string | null = null;

  onModuleInit(): void {
    const token = this.token();
    if (process.env.VITEST) return;
    if (!token) {
      this.logger.warn(
        `No operator token could be resolved (${this.filePath()}) — approval decisions will 401.`,
      );
    } else if (process.env[OPERATOR_TOKEN_ENV]?.trim()) {
      this.logger.log(`Operator token from ${OPERATOR_TOKEN_ENV} env.`);
    } else {
      this.logger.log(
        `Operator token at ${this.filePath()} — paste it into Settings → General to decide approvals.`,
      );
    }
  }

  /** The token, or null (fail closed). Only a non-null token is cached; null retries next call. */
  token(): string | null {
    if (this.cached) return this.cached;
    this.cached = process.env[OPERATOR_TOKEN_ENV]?.trim() || this.fromFile();
    return this.cached;
  }

  private filePath(): string {
    return (
      process.env[OPERATOR_TOKEN_FILE_ENV] ?? join(homedir(), ".config", "zibby", "operator-token")
    );
  }

  private fromFile(): string | null {
    const file = this.filePath();
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      try {
        writeFileSync(file, randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o600 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
      chmodSync(file, 0o600);
      return readFileSync(file, "utf8").trim() || null;
    } catch {
      return null; // fail closed: guard rejects every mutation
    }
  }
}
