import { promises as fs } from "node:fs";
import * as path from "node:path";
import { type ZodType } from "zod";
import {
  ensureDir,
  fileExists,
  isErrnoException,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "./file-utils";

/**
 * Shared base for the file-backed stores: one file per entity, named
 * `<id><fileExt>`, inside a configurable data directory. There is intentionally
 * no database. The base centralizes the crash-safe write (temp + atomic
 * rename), the defense-in-depth id guard (regex + path containment), the
 * tolerant listing (a single corrupt file is skipped, never fatal) and the
 * ENOENT → not-found mapping.
 *
 * A subclass declares only what is unique to its format: the file extension and
 * id regex, how an entity maps to/from its on-disk form (`serialize` /
 * `tryParse`), how the listing is ordered (`compare`) and which domain error
 * classes to throw (`notFound` / `invalidId`, and optionally `corruptError`).
 * `create` / `update` stay in the subclass since their input shapes differ, but
 * are built from {@link writeEntity} / {@link fileExists} / {@link resolveFile}.
 */
export abstract class EntityFileStore<T> {
  protected readonly dir: string;

  /** File suffix, e.g. `.md`, `.pipeline.md`, `.json`. */
  protected abstract readonly fileExt: string;
  /** Allowed-id pattern; the path-containment check is applied on top. */
  protected abstract readonly idRegex: RegExp;

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  /** The id used to derive the on-disk file name for a write. */
  protected abstract idOf(entity: T): string;
  /** Render an entity to its on-disk text form. */
  protected abstract serialize(entity: T): string;
  /**
   * Parse on-disk text back into an entity, or null if structurally broken.
   * `id` is the id derived from the file name (the source of truth for stores
   * that key on the file name; ignored by stores that carry the id in-band).
   */
  protected abstract tryParse(raw: string, id: string): T | null;

  /**
   * Parse a JSON file body against a Zod schema, tolerant of malformed input
   * (returns null rather than throwing). The shared shape of every plain-JSON
   * store's {@link tryParse}; Markdown stores parse frontmatter instead.
   */
  protected parseJson<U>(schema: ZodType<U>, raw: string): U | null {
    const parsed = schema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
  }

  /** Ordering for {@link list}. */
  protected abstract compare(a: T, b: T): number;
  /** Error thrown when an entity is missing. */
  protected abstract notFound(id: string): Error;
  /** Error thrown when an id is malformed or would escape the data directory. */
  protected abstract invalidId(id: string): Error;
  /**
   * Error thrown by {@link get} when a file exists but cannot be parsed.
   * Defaults to {@link notFound} (the JSON stores' behavior); the Markdown
   * stores override this to throw their dedicated corrupt-file error.
   */
  protected corruptError(id: string): Error {
    return this.notFound(id);
  }

  /** Ensure the data directory exists before the app starts serving traffic. */
  async ensureDir(): Promise<void> {
    await ensureDir(this.dir);
  }

  /**
   * NestJS lifecycle hook — ensures the data directory exists before traffic.
   * Every file-backed store needs this, so it lives on the base; a subclass with
   * extra startup work (e.g. seeding) overrides and calls `super.onModuleInit()`.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureDir();
  }

  /** Resolve an id to a safe absolute path, throwing the domain invalid-id error. */
  protected resolveFile(id: string): string {
    const file = resolveSafeFile(this.dir, id, this.fileExt, this.idRegex);
    if (file === null) throw this.invalidId(id);
    return file;
  }

  protected async fileExists(file: string): Promise<boolean> {
    return fileExists(file);
  }

  /** Atomically persist an entity to its id-derived file. */
  protected async writeEntity(entity: T): Promise<void> {
    const file = this.resolveFile(this.idOf(entity));
    await this.ensureDir();
    await writeFileAtomic(file, this.serialize(entity));
  }

  async get(id: string): Promise<T> {
    const file = this.resolveFile(id);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") throw this.notFound(id);
      throw error;
    }
    const parsed = this.tryParse(raw, id);
    if (!parsed) throw this.corruptError(id);
    return parsed;
  }

  async list(): Promise<T[]> {
    await this.ensureDir();
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    const out: T[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(this.fileExt)) continue;
      const id = entry.slice(0, -this.fileExt.length);
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null);
      // Skip corrupt/unreadable files instead of failing the whole listing.
      if (raw === null) continue;
      const parsed = this.tryParse(raw, id);
      if (parsed) out.push(parsed);
    }
    return out.sort((a, b) => this.compare(a, b));
  }

  async delete(id: string): Promise<void> {
    const file = this.resolveFile(id);
    try {
      await fs.unlink(file);
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") throw this.notFound(id);
      throw error;
    }
  }
}
