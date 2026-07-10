import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ImportPathNotDirectoryError,
  ImportPathNotFoundError,
  MAX_IMPORT_FILE_BYTES,
  MemoryImportService,
  importArchiveDir,
  importQueueDir,
} from "./memory-import.service";
import { VaultService } from "./vault.service";

describe("MemoryImportService", () => {
  let sourceDir: string;
  let vaultDir: string;
  let vault: VaultService;
  let importer: MemoryImportService;

  beforeEach(async () => {
    sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "import-source-"));
    vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "import-vault-"));
    vault = new VaultService(vaultDir);
    await vault.onModuleInit();
    importer = new MemoryImportService(vault);
    // The queue dir is anchored to the global ZIBBY_DATA_DIR test root (pinned
    // once per forked test file) — clear it between tests in THIS file so
    // staged/archived state never leaks across `it` blocks.
    await fs.rm(importQueueDir(), { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(vaultDir, { recursive: true, force: true });
    await fs.rm(importQueueDir(), { recursive: true, force: true });
  });

  describe("stageFrom", () => {
    it("stages only .md/.txt files (case-insensitive), counts the rest by reason, and leaves the source untouched", async () => {
      await fs.writeFile(path.join(sourceDir, "note.md"), "# A note\n");
      await fs.writeFile(path.join(sourceDir, "PLAIN.TXT"), "plain text");
      await fs.writeFile(path.join(sourceDir, "image.png"), "not-really-a-png");
      await fs.mkdir(path.join(sourceDir, "sub"), { recursive: true });
      await fs.writeFile(path.join(sourceDir, "sub", "nested.md"), "nested body");
      await fs.mkdir(path.join(sourceDir, ".obsidian"), { recursive: true });
      await fs.writeFile(path.join(sourceDir, ".obsidian", "config.json"), "{}");

      const result = await importer.stageFrom(sourceDir);

      expect(result.staged).toBe(3);
      expect(result.skipped).toBe(1);
      expect(result.skippedByReason).toEqual({ "unsupported-type": 1 });
      expect(result.distillTriggered).toBe(false);

      const staged = await fs.readdir(importQueueDir());
      expect(staged.sort()).toEqual(["PLAIN.TXT", "nested.md", "note.md"].sort());

      // Source folder is untouched — copy, not move.
      const sourceEntries = await fs.readdir(sourceDir);
      expect(sourceEntries.sort()).toEqual([".obsidian", "PLAIN.TXT", "image.png", "note.md", "sub"].sort());
      await expect(fs.access(path.join(sourceDir, "note.md"))).resolves.toBeUndefined();
    });

    it("skips an oversized file and counts it", async () => {
      const big = Buffer.alloc(MAX_IMPORT_FILE_BYTES + 1, "x");
      await fs.writeFile(path.join(sourceDir, "huge.md"), big);
      await fs.writeFile(path.join(sourceDir, "small.md"), "fine");

      const result = await importer.stageFrom(sourceDir);

      expect(result.staged).toBe(1);
      expect(result.skippedByReason).toEqual({ oversized: 1 });
    });

    it("resolves a filename collision in the queue with a numeric suffix", async () => {
      await fs.mkdir(path.join(sourceDir, "a"), { recursive: true });
      await fs.mkdir(path.join(sourceDir, "b"), { recursive: true });
      await fs.writeFile(path.join(sourceDir, "a", "same.md"), "from a");
      await fs.writeFile(path.join(sourceDir, "b", "same.md"), "from b");

      const result = await importer.stageFrom(sourceDir);

      expect(result.staged).toBe(2);
      const staged = (await fs.readdir(importQueueDir())).sort();
      expect(staged).toEqual(["same-2.md", "same.md"]);
    });

    it("throws ImportPathNotFoundError for a non-existent path", async () => {
      await expect(importer.stageFrom(path.join(sourceDir, "nope"))).rejects.toBeInstanceOf(
        ImportPathNotFoundError,
      );
    });

    it("throws ImportPathNotDirectoryError when sourcePath is a file", async () => {
      const file = path.join(sourceDir, "just-a-file.md");
      await fs.writeFile(file, "x");
      await expect(importer.stageFrom(file)).rejects.toBeInstanceOf(ImportPathNotDirectoryError);
    });
  });

  describe("ingestQueue", () => {
    it("turns a staged .md file into a raw knowledge note and archives the source under _imported/<day>", async () => {
      await fs.writeFile(path.join(sourceDir, "my-note.md"), "---\ntitle: My Custom Title\n---\nBody text.\n");
      await importer.stageFrom(sourceDir);

      const ingested = await importer.ingestQueue();
      expect(ingested).toBe(1);

      const note = await vault.note("my-note");
      expect(note.tier).toBe("knowledge");
      expect(note.raw).toBe(true);
      expect(note.title).toBe("My Custom Title");
      expect(note.body).toContain("Body text.");

      const day = new Date().toISOString().slice(0, 10);
      const archived = await fs.readdir(path.join(importArchiveDir(), day));
      expect(archived).toEqual(["my-note.md"]);
      // No longer in the queue root.
      const queued = await fs.readdir(importQueueDir());
      expect(queued).not.toContain("my-note.md");
    });

    it(".txt gets the filename as its title", async () => {
      await fs.writeFile(path.join(sourceDir, "plain_notes.txt"), "just text");
      await importer.stageFrom(sourceDir);
      await importer.ingestQueue();

      const note = await vault.note("plain_notes");
      expect(note.title).toBe("plain notes");
      expect(note.body).toContain("just text");
    });

    it("is idempotent: re-running ingestQueue does not re-ingest an archived file", async () => {
      await fs.writeFile(path.join(sourceDir, "once.md"), "body");
      await importer.stageFrom(sourceDir);
      expect(await importer.ingestQueue()).toBe(1);
      expect(await importer.ingestQueue()).toBe(0);
    });

    it("suffixes the note id on a collision (two staged files sharing a basename-derived id)", async () => {
      await fs.mkdir(path.join(sourceDir, "a"), { recursive: true });
      await fs.mkdir(path.join(sourceDir, "b"), { recursive: true });
      await fs.writeFile(path.join(sourceDir, "a", "dup.md"), "from a");
      await fs.writeFile(path.join(sourceDir, "b", "dup.md"), "from b");
      await importer.stageFrom(sourceDir);

      expect(await importer.ingestQueue()).toBe(2);
      await expect(vault.note("dup")).resolves.toBeDefined();
      await expect(vault.note("dup-2")).resolves.toBeDefined();
    });

    it("is fail-open: a failing file stays queued (reconsidered later) and does not abort the others", async () => {
      await fs.writeFile(path.join(sourceDir, "bad.md"), "boom body");
      await fs.writeFile(path.join(sourceDir, "good.md"), "fine body");
      await importer.stageFrom(sourceDir);

      const original = vault.createNote.bind(vault);
      vi.spyOn(vault, "createNote").mockImplementation(async (input) => {
        if (input.id === "bad") throw new Error("disk exploded");
        return original(input);
      });

      const ingested = await importer.ingestQueue();

      expect(ingested).toBe(1);
      await expect(vault.note("good")).resolves.toBeDefined();
      await expect(vault.note("bad")).rejects.toBeTruthy();
      // The failing file was never archived — it is still sitting in the queue,
      // reconsidered on the next call.
      const queued = await fs.readdir(importQueueDir());
      expect(queued).toContain("bad.md");
    });

    it("does not treat a stray directory in the queue as a file to ingest", async () => {
      await fs.writeFile(path.join(sourceDir, "good.md"), "fine body");
      await importer.stageFrom(sourceDir);
      // `_imported` is always a subdirectory of the queue root, never a file to
      // ingest — assert it's excluded from the scan by construction.
      const ingested = await importer.ingestQueue();
      expect(ingested).toBe(1);
      const queueEntries = await fs.readdir(importQueueDir(), { withFileTypes: true });
      const dirs = queueEntries.filter((e) => e.isDirectory()).map((e) => e.name);
      expect(dirs).toEqual(["_imported"]);
    });
  });
});
