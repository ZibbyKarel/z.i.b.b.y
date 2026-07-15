import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFileAtomic } from "./file-utils";

/** List `.tmp` leftovers in `dir` (tolerant of the dir having been removed). */
async function tmpLeftovers(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  return entries.filter((f) => f.endsWith(".tmp"));
}

describe("writeFileAtomic .tmp cleanup (Task 3)", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "write-file-atomic-test-"));
    file = path.join(dir, "target.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes and renames normally when nothing fails", async () => {
    await writeFileAtomic(file, "hello");
    expect(await fs.readFile(file, "utf8")).toBe("hello");
    expect(await tmpLeftovers(dir)).toEqual([]);
  });

  it("removes the .tmp file when fs.writeFile fails AFTER bytes already landed on disk", async () => {
    // A real `fs.writeFile` failure (e.g. ENOSPC mid-write) can still leave bytes on
    // disk before it rejects — that's the actual leak the audit flagged, not the
    // (uninteresting) case where nothing was ever written. Simulate it by performing
    // a real write via the *unmocked* fs, then rejecting, so the tmp file genuinely
    // exists on disk when writeFileAtomic's catch block runs.
    const { promises: realFs } = await vi.importActual<typeof import("node:fs")>("node:fs");
    const spy = vi
      .spyOn(fs, "writeFile")
      .mockImplementationOnce(async (targetPath, data) => {
        await realFs.writeFile(targetPath as string, data as string, "utf8");
        throw new Error("disk full");
      });

    await expect(writeFileAtomic(file, "hello")).rejects.toThrow("disk full");

    await expect(fs.access(file)).rejects.toThrow();
    expect(await tmpLeftovers(dir)).toEqual([]);
    spy.mockRestore();
  });

  it("removes the .tmp file when fs.rename fails", async () => {
    const spy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("EXDEV"));

    await expect(writeFileAtomic(file, "hello")).rejects.toThrow("EXDEV");

    await expect(fs.access(file)).rejects.toThrow();
    expect(await tmpLeftovers(dir)).toEqual([]);
    spy.mockRestore();
  });
});
