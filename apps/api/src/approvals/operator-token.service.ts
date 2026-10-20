import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const OPERATOR_TOKEN_ENV = "ZIBBY_OPERATOR_TOKEN";
export const OPERATOR_TOKEN_FILE_ENV = "ZIBBY_OPERATOR_TOKEN_FILE";

/**
 * The operator-only credential that authorizes deciding approvals (Laws 1 & 4).
 * Env wins; otherwise a 0600 file outside the repo and data dir, created on first
 * read. Agent processes never inherit either env var (runner-core strips them) and
 * the approval hook denies Bash access to the file.
 */
@Injectable()
export class OperatorTokenService {
  private cached: string | null | undefined;

  token(): string | null {
    if (this.cached !== undefined) return this.cached;
    const fromEnv = process.env[OPERATOR_TOKEN_ENV]?.trim();
    this.cached = fromEnv || this.fromFile();
    return this.cached;
  }

  private fromFile(): string | null {
    const file =
      process.env[OPERATOR_TOKEN_FILE_ENV] ?? join(homedir(), ".config", "zibby", "operator-token");
    try {
      if (!existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(file, randomBytes(32).toString("hex") + "\n", { mode: 0o600 });
      }
      chmodSync(file, 0o600);
      return readFileSync(file, "utf8").trim() || null;
    } catch {
      return null; // fail closed: guard rejects every mutation
    }
  }
}
