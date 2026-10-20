import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OperatorTokenService } from "./operator-token.service";

describe("OperatorTokenService", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("creates a 0600 token file at boot when no env token is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "op-token-"));
    try {
      delete process.env.ZIBBY_OPERATOR_TOKEN;
      process.env.ZIBBY_OPERATOR_TOKEN_FILE = join(dir, "zibby", "operator-token");
      const svc = new OperatorTokenService();
      svc.onModuleInit();
      expect(statSync(process.env.ZIBBY_OPERATOR_TOKEN_FILE).mode & 0o777).toBe(0o600);
      expect(svc.token()).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not cache a null token — the next call retries", () => {
    const dir = mkdtempSync(join(tmpdir(), "op-token-"));
    try {
      delete process.env.ZIBBY_OPERATOR_TOKEN;
      const blocker = join(dir, "blocker");
      writeFileSync(blocker, ""); // a file where the dir should be → resolution fails
      process.env.ZIBBY_OPERATOR_TOKEN_FILE = join(blocker, "operator-token");
      const svc = new OperatorTokenService();
      expect(svc.token()).toBeNull();
      process.env.ZIBBY_OPERATOR_TOKEN = "now-set";
      expect(svc.token()).toBe("now-set");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
