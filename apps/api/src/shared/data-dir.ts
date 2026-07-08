import * as path from "node:path";

/**
 * The single data-root switch. Every file-backed store lives under one base
 * directory; `ZIBBY_DATA_DIR` repoints them all at once — e.g. a test root vs.
 * the live/dev root — without touching the per-resource `*_DIR` vars (those
 * still win when set, which is how the e2e harness isolates each store).
 *
 * Anchored to the repo-root `.zibby/data` via this file's location rather than
 * the process cwd, so dev (`ts-node`, cwd `apps/api`) and the test runner (cwd =
 * repo root) resolve to the same place. A relative `ZIBBY_DATA_DIR` is resolved
 * against the cwd, so `ZIBBY_DATA_DIR=.zibby/data-test` from the repo root lands
 * a sibling of the default `.zibby/data`.
 */
export function resolveDataRoot(): string {
  const root = process.env.ZIBBY_DATA_DIR;
  if (root) return path.resolve(root);

  // Tripwire (Phase 12.5): under the test runner the global `vitest.setup.ts`
  // always pins `ZIBBY_DATA_DIR` at a temp root. Reaching here without one means
  // a suite booted before the setup, or the setup was removed — refuse the live
  // `.zibby/data` anchor loudly rather than silently reading/writing real data
  // (the meta-circular contamination the phase exists to close).
  if (process.env.VITEST) {
    throw new Error(
      "resolveDataRoot: refusing the live .zibby/data anchor under VITEST — " +
        "set ZIBBY_DATA_DIR (vitest.setup.ts does this globally). This guards " +
        "against tests touching real data (Phase 12.5).",
    );
  }

  return path.resolve(__dirname, "..", "..", "..", "..", ".zibby", "data");
}

/** Join sub-path segments onto the resolved data root. */
export function dataDir(...segments: string[]): string {
  return path.join(resolveDataRoot(), ...segments);
}

/**
 * Phase 76 — the ZIBBY install root: the repo root, i.e. the parent of
 * `.zibby` (`resolveDataRoot()` is `<repo-root>/.zibby/data`, so this is two
 * levels up from there). Used to derive {@link defaultCloneRoot}, the
 * per-machine default destination for local project clones.
 */
export function installRoot(): string {
  return path.resolve(resolveDataRoot(), "..", "..");
}

/**
 * Phase 76 — the default per-machine clone root when no `MachineConfig`
 * override exists: the parent folder of the ZIBBY install root, so a fresh
 * clone of project `<id>` lands as a sibling of the ZIBBY repo itself
 * (`<installRoot>/../<id>`), not inside it.
 */
export function defaultCloneRoot(): string {
  return path.resolve(installRoot(), "..");
}
