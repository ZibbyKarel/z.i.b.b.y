import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentBaseEnv } from "./agent-env";
import { spawnClaudeCli } from "./spawn-claude-cli";

describe("agent env", () => {
  afterEach(() => {
    delete process.env.ZIBBY_OPERATOR_TOKEN;
    delete process.env.ZIBBY_OPERATOR_TOKEN_FILE;
    delete process.env.CLAUDE_BIN;
  });

  it("agentBaseEnv strips the token keys even from extra", () => {
    process.env.ZIBBY_OPERATOR_TOKEN = "secret";
    const env = agentBaseEnv({ ZIBBY_OPERATOR_TOKEN_FILE: "/p", FOO: "bar" });
    expect("ZIBBY_OPERATOR_TOKEN" in env).toBe(false);
    expect("ZIBBY_OPERATOR_TOKEN_FILE" in env).toBe(false);
    expect(env.FOO).toBe("bar");
  });

  it("a real child spawned via spawnClaudeCli never sees the operator token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-env-"));
    try {
      const bin = join(dir, "fake-claude.sh");
      writeFileSync(
        bin,
        '#!/bin/sh\nprintf "%s|%s" "${ZIBBY_OPERATOR_TOKEN-unset}" "${ZIBBY_OPERATOR_TOKEN_FILE-unset}"\n',
      );
      chmodSync(bin, 0o755);
      process.env.CLAUDE_BIN = bin;
      process.env.ZIBBY_OPERATOR_TOKEN = "secret";
      process.env.ZIBBY_OPERATOR_TOKEN_FILE = "/tmp/x";
      const out = await spawnClaudeCli({ args: ["-p", "hi"], timeoutMs: 10_000, label: "test" });
      expect(out).toBe("unset|unset");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
