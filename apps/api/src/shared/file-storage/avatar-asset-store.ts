import { promises as fs, readFileSync } from "node:fs";
import * as path from "node:path";
import { ensureDir, isErrnoException, writeFileAtomic } from "./file-utils";

/** Extension derived from an uploaded avatar's mime type; `png` is the fallback. */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};
const DEFAULT_EXT = "png";

/** Mime derived from an asset file's extension when inlining it back to a data URI. */
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
};
const DEFAULT_MIME = "application/octet-stream";

/** Every extension {@link externalize} can ever produce — used to find/remove stale files. */
const ALL_ASSET_EXTS = Array.from(new Set(Object.values(MIME_TO_EXT)));

/** A parsed `data:image/*;base64,...` avatar URI. */
export interface ParsedAvatarDataUri {
  mime: string;
  ext: string;
  bytes: Buffer;
}

const DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/;

/**
 * A bare on-disk avatar reference must look like `assets/<safe-name>` — no
 * further `/` (rules out nested paths) so a stray `..` segment can't slip past
 * disguised as a single path component; the containment check in
 * {@link AvatarAssetStore.resolveAssetFile} closes the remaining gap (a
 * reference of exactly `assets/..` still matches this character class).
 */
const ASSET_REF_RE = /^assets\/[A-Za-z0-9._-]+$/;

/**
 * Externalizes an uploaded `data:image/*;base64,...` avatar to a file under
 * `<entityDir>/assets/`, so only a bare relative reference (`assets/<id>.<ext>`)
 * needs to sit in the entity's Markdown frontmatter — the multi-megabyte base64
 * blob never lives inline in a human-read, git-diffed text file.
 *
 * The wire contract (`AvatarSchema`) never changes: callers still hand this
 * store a `data:image/*` URI and get one back ({@link inlineSync}) — only the
 * on-disk *storage* shrinks. A `/`-rooted bundled avatar (`/avatars/x.png`) is
 * never something this store touches; {@link parseDataUri} simply returns null
 * for it and the caller leaves the value as-is.
 */
export class AvatarAssetStore {
  private readonly assetsDir: string;

  constructor(entityDir: string) {
    this.assetsDir = path.join(path.resolve(entityDir), "assets");
  }

  /** True if `value` is an on-disk asset reference (`assets/<id>.<ext>`). */
  isAssetRef(value: string): boolean {
    return value.startsWith("assets/");
  }

  /** Parse a `data:image/*;base64,...` URI, or null if `value` isn't one. */
  parseDataUri(value: string): ParsedAvatarDataUri | null {
    const match = DATA_URI_RE.exec(value);
    if (!match) return null;
    const mime = match[1];
    const base64Raw = match[2];
    if (mime === undefined || base64Raw === undefined) return null;
    // Defensive: strip any whitespace a YAML dumper may have folded into the
    // base64 payload (e.g. wrapped long lines) before decoding.
    const base64 = base64Raw.replace(/\s+/g, "");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(base64, "base64");
    } catch {
      return null;
    }
    const ext = MIME_TO_EXT[mime] ?? DEFAULT_EXT;
    return { mime, ext, bytes };
  }

  /**
   * Write the decoded bytes of `dataUri` to `assets/<id>.<ext>` (atomic write),
   * first removing any stale `assets/<id>.*` left by a previous extension.
   * Returns the bare reference to persist in frontmatter, or null if `dataUri`
   * isn't a recognized `data:image/` URI — the caller should leave the original
   * value untouched in that case (e.g. a bundled `/avatars/*.png` path).
   */
  async externalize(id: string, dataUri: string): Promise<string | null> {
    const parsed = this.parseDataUri(dataUri);
    if (!parsed) return null;
    await ensureDir(this.assetsDir);
    await this.remove(id);
    const ref = `assets/${id}.${parsed.ext}`;
    const file = this.resolveAssetFile(`${id}.${parsed.ext}`);
    if (file === null) return null;
    await writeFileAtomic(file, parsed.bytes);
    return ref;
  }

  /**
   * Read `assets/<id>.<ext>` back into a full `data:<mime>;base64,...` URI, or
   * null if `ref` fails the path-safety guard or the file is missing/unreadable.
   * Synchronous on purpose — it slots into the existing sync `fromFrontmatter`.
   */
  inlineSync(ref: string): string | null {
    if (!ASSET_REF_RE.test(ref)) return null;
    const filename = ref.slice("assets/".length);
    const file = this.resolveAssetFile(filename);
    if (file === null) return null;
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = EXT_TO_MIME[ext] ?? DEFAULT_MIME;
    try {
      const bytes = readFileSync(file);
      return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {
      return null;
    }
  }

  /** Unlink any `assets/<id>.*` file (tolerant of it not existing). */
  async remove(id: string): Promise<void> {
    await Promise.all(
      ALL_ASSET_EXTS.map(async (ext) => {
        const file = this.resolveAssetFile(`${id}.${ext}`);
        if (file === null) return;
        try {
          await fs.unlink(file);
        } catch (error) {
          if (isErrnoException(error) && error.code === "ENOENT") return;
          throw error;
        }
      }),
    );
  }

  /**
   * Resolve a bare `<filename>` (already known to come from a fixed, generated
   * extension or a regex-checked ref) to an absolute path *inside*
   * `assetsDir`, or null if it would escape — defense in depth alongside the
   * regex guards above.
   */
  private resolveAssetFile(filename: string): string | null {
    const file = path.resolve(this.assetsDir, filename);
    if (path.dirname(file) !== this.assetsDir) return null;
    return file;
  }
}
