import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initInstanceRole,
  instanceLockPath,
  isPrimaryInstance,
  resetInstanceRoleForTest,
} from "./instance-role";

/** A pid that is certainly not alive (above the macOS/Linux pid ceiling). */
const DEAD_PID = 9_999_999;

describe("initInstanceRole", () => {
  const original = { data: process.env.ZIBBY_DATA_DIR, role: process.env.ZIBBY_ROLE };
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "zibby-role-"));
    process.env.ZIBBY_DATA_DIR = root;
    delete process.env.ZIBBY_ROLE;
    resetInstanceRoleForTest();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    process.env.ZIBBY_DATA_DIR = original.data;
    if (original.role === undefined) delete process.env.ZIBBY_ROLE;
    else process.env.ZIBBY_ROLE = original.role;
    resetInstanceRoleForTest();
  });

  const writeLock = (pid: number) =>
    writeFileSync(
      instanceLockPath(),
      JSON.stringify({ pid, role: "primary", port: 4333, label: "app", startedAt: "" }),
    );

  it("defaults to primary when never initialised (tests booting modules directly)", () => {
    expect(isPrimaryInstance()).toBe(true);
  });

  it("auto takes a free lock and becomes primary", () => {
    expect(initInstanceRole({ port: 3333 })).toBe("primary");
    expect(isPrimaryInstance()).toBe(true);
    const lock = JSON.parse(readFileSync(instanceLockPath(), "utf8")) as {
      pid: number;
      port: number;
    };
    expect(lock).toMatchObject({ pid: process.pid, port: 3333 });
  });

  it("auto replaces a stale lock (dead pid)", () => {
    writeLock(DEAD_PID);
    expect(initInstanceRole({ port: 3333 })).toBe("primary");
  });

  it("auto becomes secondary while a live process holds the lock", () => {
    writeLock(process.ppid);
    expect(initInstanceRole({ port: 3333, waitForStaleMs: 0 })).toBe("secondary");
    expect(isPrimaryInstance()).toBe(false);
    // The holder's lock is left untouched.
    expect(JSON.parse(readFileSync(instanceLockPath(), "utf8"))).toMatchObject({
      pid: process.ppid,
    });
  });

  it("primary refuses to boot over a live holder", () => {
    process.env.ZIBBY_ROLE = "primary";
    writeLock(process.ppid);
    expect(() => initInstanceRole({ port: 4333 })).toThrow(/already owns/);
  });

  it("secondary never takes the lock", () => {
    process.env.ZIBBY_ROLE = "secondary";
    expect(initInstanceRole({ port: 3333 })).toBe("secondary");
    expect(existsSync(instanceLockPath())).toBe(false);
  });
});
