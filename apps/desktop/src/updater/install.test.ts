import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { buildSwapScript, installedBundlePath } from "./install";

const execFileAsync = promisify(execFile);

describe("installedBundlePath", () => {
  it("climbs from the executable to the .app", () => {
    expect(installedBundlePath("/Applications/ZibbyOS.app/Contents/MacOS/ZibbyOS")).toBe(
      "/Applications/ZibbyOS.app",
    );
  });

  it("refuses a mounted DMG or a translocated copy", () => {
    expect(
      installedBundlePath("/Volumes/ZibbyOS/ZibbyOS.app/Contents/MacOS/ZibbyOS"),
    ).toBeUndefined();
    expect(
      installedBundlePath(
        "/private/var/folders/x/AppTranslocation/ABC/d/ZibbyOS.app/Contents/MacOS/ZibbyOS",
      ),
    ).toBeUndefined();
  });

  it("refuses an unbundled binary", () => {
    expect(installedBundlePath("/usr/local/bin/electron")).toBeUndefined();
  });
});

describe("buildSwapScript", () => {
  function fakeBundle(dir: string, name: string, marker: string): string {
    const bundle = path.join(dir, name);
    mkdirSync(bundle, { recursive: true });
    writeFileSync(path.join(bundle, "marker"), marker);
    return bundle;
  }

  it("quotes paths with spaces and single quotes", () => {
    const script = buildSwapScript({
      pid: 1,
      current: "/Applications/Zib's OS.app",
      next: "/tmp/n.app",
      backup: "/tmp/b.app",
      logFile: "/tmp/l.log",
    });
    expect(script).toContain(`CURRENT='/Applications/Zib'\\''s OS.app'`);
  });

  it.runIf(process.platform === "darwin")(
    "waits for the pid, swaps the bundle and keeps the old one as backup",
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "zibby-swap-"));
      const current = fakeBundle(path.join(dir, "Applications"), "Zibby OS.app", "old");
      const next = fakeBundle(path.join(dir, "staging"), "ZibbyOS.app", "new");
      const backup = path.join(dir, "previous", "Zibby OS.app");
      const logFile = path.join(dir, "updater.log");

      const sleeper = spawn("sleep", ["1"]);
      // `open` on a fake bundle fails harmlessly; strip it so the test never launches anything.
      const script = buildSwapScript({
        pid: sleeper.pid ?? 0,
        current,
        next,
        backup,
        logFile,
      }).replaceAll(/^open .*$/gm, "true");
      const scriptPath = path.join(dir, "swap.sh");
      writeFileSync(scriptPath, script);

      await execFileAsync("/bin/bash", [scriptPath]);

      expect(readFileSync(path.join(current, "marker"), "utf8")).toBe("new");
      expect(readFileSync(path.join(backup, "marker"), "utf8")).toBe("old");
      expect(existsSync(next)).toBe(false);
      expect(sleeper.exitCode).not.toBeNull();
      expect(readFileSync(logFile, "utf8")).toContain("swap: installed");
    },
    10_000,
  );
});
