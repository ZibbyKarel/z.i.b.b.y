import * as path from "node:path"

/**
 * The single data-root switch. Every file-backed store lives under one base
 * directory; `ZIBBY_DATA_DIR` repoints them all at once — e.g. a test root vs.
 * the live/dev root — without touching the per-resource `*_DIR` vars (those
 * still win when set, which is how the e2e harness isolates each store).
 *
 * Anchored to `apps/api/data` via this file's location rather than the process
 * cwd, so dev (`ts-node`, cwd `apps/api`) and the test runner (cwd = repo root)
 * resolve to the same place. A relative `ZIBBY_DATA_DIR` is resolved against the
 * cwd, so `ZIBBY_DATA_DIR=apps/api/data-test` from the repo root lands a sibling
 * of the default `apps/api/data`.
 */
export function resolveDataRoot(): string {
  const root = process.env.ZIBBY_DATA_DIR
  return root ? path.resolve(root) : path.resolve(__dirname, "..", "..", "data")
}

/** Join sub-path segments onto the resolved data root. */
export function dataDir(...segments: string[]): string {
  return path.join(resolveDataRoot(), ...segments)
}
