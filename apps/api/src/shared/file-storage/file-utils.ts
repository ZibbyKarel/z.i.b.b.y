import { randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"

/** Narrow an unknown caught value to a Node fs error (so `.code` is readable). */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

/** Parse JSON, returning null instead of throwing on malformed input. */
export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Create a directory (and parents) if it does not already exist. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/** True if the path is accessible (exists), false otherwise. */
export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

/**
 * Write via a temp file + atomic rename so a crash can't leave a torn file.
 * The caller is responsible for ensuring the target directory exists.
 */
export async function writeFileAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
  await fs.writeFile(tmp, content, "utf8")
  try {
    await fs.rename(tmp, file)
  } catch (error) {
    await fs.rm(tmp, { force: true })
    throw error
  }
}

/**
 * Map an id to an absolute file path *inside* `dir`, or return null if the id
 * could escape it. Two independent guards: a caller-supplied regex (no
 * separators / traversal) and a resolved-path containment check. `dir` must
 * already be absolute (e.g. via `path.resolve`).
 */
export function resolveSafeFile(
  dir: string,
  id: string,
  ext: string,
  idRegex: RegExp,
): string | null {
  if (typeof id !== "string" || !idRegex.test(id)) return null
  const file = path.resolve(dir, `${id}${ext}`)
  if (path.dirname(file) !== dir) return null
  return file
}

/** A fresh, filename-safe, collision-resistant id: `<prefix>_<ms>_<hex>`. */
export function collisionResistantId(prefix: string): string {
  const safe = prefix.replace(/[^a-zA-Z0-9._-]/g, "-")
  return `${safe}_${Date.now()}_${randomBytes(3).toString("hex")}`
}
