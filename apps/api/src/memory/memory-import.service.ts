import { type Dirent, promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { ImportResult } from "@zibby/contracts";
import matter from "gray-matter";
import { dataDir } from "../shared/data-dir";
import {
  ensureDir,
  fileExists,
  isErrnoException,
  writeFileAtomic,
} from "../shared/file-storage/file-utils";
import { DuplicateNoteError, VaultService } from "./vault.service";

/** Raised when `sourcePath` does not exist (→ 400, a bad/empty path). */
export class ImportPathNotFoundError extends Error {
  constructor(public readonly sourcePath: string) {
    super(`Import source path not found: "${sourcePath}"`);
    this.name = "ImportPathNotFoundError";
  }
}

/** Raised when `sourcePath` exists but is not a directory (→ 422). */
export class ImportPathNotDirectoryError extends Error {
  constructor(public readonly sourcePath: string) {
    super(`Import source path is not a directory: "${sourcePath}"`);
    this.name = "ImportPathNotDirectoryError";
  }
}

/** Raised when `sourcePath` exists but cannot be read — permissions, a walk
 *  failure, ... (→ 422). */
export class ImportPathUnreadableError extends Error {
  constructor(public readonly sourcePath: string) {
    super(`Import source path is not readable: "${sourcePath}"`);
    this.name = "ImportPathUnreadableError";
  }
}

/**
 * Per-staged-file size cap (5 MiB). Generous for markdown/text notes — even a
 * sprawling Obsidian note or an exported chat log rarely exceeds a few hundred
 * KB; this only guards against an operator pointing the importer at a folder
 * that happens to contain a large misnamed `.md`/`.txt` (e.g. a renamed
 * binary). Oversized files are skipped and counted
 * (`skippedByReason.oversized`), never silently dropped.
 */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_EXTENSIONS = new Set([".md", ".txt"]);

/** Absolute path of the import staging queue — a SIBLING of the vault dir
 *  (`dataDir("vault")`), never a subdir of it, so `VaultService.scan()` never
 *  walks into it (phase 112, binding decision 2). */
export function importQueueDir(): string {
  return dataDir("import");
}

/** Absolute path of the archive subdir ingested source files are moved into
 *  (`import/_imported/<YYYY-MM-DD>/`) — the idempotency guard: an archived
 *  file is never re-ingested because it is no longer in the queue. */
export function importArchiveDir(): string {
  return path.join(importQueueDir(), "_imported");
}

/**
 * Recursively collect regular files under `dir`, skipping dot-prefixed
 * directories (mirrors `VaultService`'s own `walk()`) and NEVER following a
 * symlink — the simplest way to guarantee nothing ever escapes the source
 * tree. A nested directory that can't be read is skipped (fail-open); only a
 * failure reading `root` itself propagates, so the caller can surface it as a
 * typed "source path unreadable" error.
 */
async function walk(root: string, dir: string = root, isRoot = true): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isRoot) throw error;
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      out.push(...(await walk(root, full, false)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A filesystem-safe destination filename inside `dir`, resolving a collision
 * (against both `taken` — names already claimed earlier in the same run — and
 * the actual directory contents) by appending a numeric suffix before the
 * extension: `notes.md` → `notes-2.md` → `notes-3.md` ...
 */
async function uniqueDestName(dir: string, base: string, taken: Set<string>): Promise<string> {
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length) || "file";
  let candidate = base;
  let n = 1;
  while (taken.has(candidate) || (await fileExists(path.join(dir, candidate)))) {
    n++;
    candidate = `${stem}-${n}${ext}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Leaves headroom under `NoteIdSchema`'s 120-char cap for a `-<n>` collision suffix. */
const NOTE_ID_MAX = 100;

/**
 * Slug a source basename (no extension) into a filesystem/`NoteIdSchema`-safe
 * id: alnum-first, then `[a-zA-Z0-9._ -]`. Diacritics are stripped rather than
 * dropped (e.g. "Poznámky" → "poznamky") so a non-ASCII filename still yields
 * a readable id instead of falling through to the `imported-note` fallback.
 */
function slugifyNoteId(stem: string): string {
  const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
  const id = stem
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9._ -]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._\s]+/, "")
    .slice(0, NOTE_ID_MAX);
  if (id.length === 0) return "imported-note";
  return /^[a-z0-9]/.test(id) ? id : `n-${id}`.slice(0, NOTE_ID_MAX);
}

/** Human title derived from a filename stem when the source has no title of its own. */
function titleFromFilename(stem: string): string {
  const humanized = stem.replace(/_+/g, " ").trim();
  return humanized.length > 0 ? humanized : stem;
}

/**
 * The inbound door for bulk memory import (phase 112): copy an external
 * folder's `.md`/`.txt` files into the halda queue, then turn each queued
 * file into a raw ("halda") knowledge note for the EXISTING nightly triage
 * sweep to pick up — no new triage logic, this only feeds it. See
 * `docs/plans/phase-112-memory-import.md` for the binding design decisions.
 */
@Injectable()
export class MemoryImportService {
  private readonly logger = new Logger(MemoryImportService.name);

  constructor(private readonly vault: VaultService) {}

  /**
   * Validate `sourcePath` (exists / is a directory / readable — else a typed
   * error the controller maps to 400/422), then copy every `.md`/`.txt` file
   * under it into the queue with a collision-safe filename. The operator's
   * source folder is only ever READ — never moved, never deleted. Any other
   * file is skipped and counted; a single bad file never aborts the walk
   * (fail-open, aggregated into the returned tally).
   */
  async stageFrom(sourcePath: string): Promise<ImportResult> {
    const resolved = path.resolve(sourcePath);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(resolved);
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new ImportPathNotFoundError(sourcePath);
      }
      throw new ImportPathUnreadableError(sourcePath);
    }
    if (!stat.isDirectory()) throw new ImportPathNotDirectoryError(sourcePath);

    let files: string[];
    try {
      files = await walk(resolved);
    } catch {
      throw new ImportPathUnreadableError(sourcePath);
    }

    const queueDir = importQueueDir();
    await ensureDir(queueDir);
    const taken = new Set(
      (await fs.readdir(queueDir).catch((): string[] => [])).filter((n) => n !== "_imported"),
    );

    let staged = 0;
    let skipped = 0;
    const skippedByReason: Record<string, number> = {};
    const bump = (reason: string): void => {
      skipped++;
      skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
    };

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.has(ext)) {
        bump("unsupported-type");
        continue;
      }
      try {
        const info = await fs.stat(file);
        if (info.size > MAX_IMPORT_FILE_BYTES) {
          bump("oversized");
          continue;
        }
        const content = await fs.readFile(file);
        const destName = await uniqueDestName(queueDir, path.basename(file), taken);
        await writeFileAtomic(path.join(queueDir, destName), content);
        staged++;
      } catch (error) {
        this.logger.warn(`could not stage ${file}: ${String(error)}`);
        bump("unreadable");
      }
    }

    return { staged, skipped, skippedByReason, distillTriggered: false };
  }

  /**
   * Turn every file currently in the queue (never the `_imported/` archive)
   * into a raw knowledge note, then move its source into
   * `_imported/<YYYY-MM-DD>/`. Fail-open per file: a bad file is logged and
   * left in the queue — reconsidered on the next call — never fatal. Returns
   * the count ingested.
   */
  async ingestQueue(): Promise<number> {
    const queueDir = importQueueDir();
    await ensureDir(queueDir);

    let names: string[];
    try {
      names = (await fs.readdir(queueDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && ACCEPTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name);
    } catch (error) {
      this.logger.warn(`could not read the import queue: ${String(error)}`);
      return 0;
    }

    let ingested = 0;
    for (const name of names) {
      try {
        await this.ingestOne(queueDir, name);
        ingested++;
      } catch (error) {
        this.logger.warn(`could not ingest queued import "${name}": ${String(error)}`);
      }
    }
    return ingested;
  }

  private async ingestOne(queueDir: string, name: string): Promise<void> {
    const file = path.join(queueDir, name);
    const ext = path.extname(name).toLowerCase();
    const stem = path.basename(name, ext);
    const raw = await fs.readFile(file, "utf8");

    let title: string;
    let body: string;
    if (ext === ".md") {
      // Preserve the source's own frontmatter title when it has one (decision
      // 4); everything else about the source's organisation/frontmatter is
      // deliberately discarded — the nightly triage re-derives it.
      const parsed = matter(raw);
      const frontmatterTitle = parsed.data.title;
      title =
        typeof frontmatterTitle === "string" && frontmatterTitle.trim().length > 0
          ? frontmatterTitle
          : titleFromFilename(stem);
      body = parsed.content;
    } else {
      title = titleFromFilename(stem);
      body = raw;
    }

    await this.createWithCollisionRetry(slugifyNoteId(stem), title, body);

    const day = new Date().toISOString().slice(0, 10);
    const archiveDayDir = path.join(importArchiveDir(), day);
    await ensureDir(archiveDayDir);
    const archiveName = await uniqueDestName(archiveDayDir, name, new Set());
    await fs.rename(file, path.join(archiveDayDir, archiveName));
  }

  /**
   * Create the note, retrying with a numeric-suffixed id on an exact-id
   * collision (e.g. two differently-sourced files that share a basename).
   * `tier` is OMITTED — `VaultService.createNote` defaults it to `"knowledge"`
   * and unconditionally forces `raw: true`, the halda path (decision 3).
   */
  private async createWithCollisionRetry(baseId: string, title: string, body: string): Promise<void> {
    let id = baseId;
    for (let suffix = 1; suffix <= 1000; suffix++) {
      try {
        await this.vault.createNote({ id, title, body });
        return;
      } catch (error) {
        if (!(error instanceof DuplicateNoteError)) throw error;
        id = `${baseId}-${suffix + 1}`;
      }
    }
    throw new Error(`could not allocate a unique note id for "${baseId}"`);
  }
}
