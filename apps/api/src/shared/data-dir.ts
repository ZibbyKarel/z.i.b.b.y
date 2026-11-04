import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * The per-user ZibbyOS home: `~/Library/Application Support/ZibbyOS`. It lives
 * OUTSIDE any repo checkout on purpose — the packaged ZibbyOS.app and the dev
 * server both default to it, so they share one data tree while the repo they
 * edit stays free of live state (an agent editing the checkout must never be
 * editing the data the running instance reads).
 */
export function zibbyHome(): string {
  return path.join(os.homedir(), "Library", "Application Support", "ZibbyOS");
}

/**
 * The single data-root switch. Every file-backed store lives under one base
 * directory; `ZIBBY_DATA_DIR` repoints them all at once — e.g. a test root vs.
 * the live root — without touching the per-resource `*_DIR` vars (those still
 * win when set, which is how the e2e harness isolates each store). A relative
 * `ZIBBY_DATA_DIR` is resolved against the cwd, so `ZIBBY_DATA_DIR=.zibby/data-test`
 * from the repo root lands in the repo's test fixture tree.
 *
 * Unset → the shared live root `<zibbyHome>/data`.
 *
 * Runtime state (runs, activity, approvals, locks, ledgers, credentials) always
 * lives here; operator-authored recipes may live elsewhere — see
 * {@link resolveRecipesRoot}.
 */
export function resolveDataRoot(): string {
  const root = process.env.ZIBBY_DATA_DIR;
  if (root) return path.resolve(root);

  // Tripwire (Phase 12.5): under the test runner the global `vitest.setup.ts`
  // always pins `ZIBBY_DATA_DIR` at a temp root. Reaching here without one means
  // a suite booted before the setup, or the setup was removed — refuse the live
  // data root loudly rather than silently reading/writing real data.
  if (process.env.VITEST) {
    throw new Error(
      "resolveDataRoot: refusing the live data root under VITEST — " +
        "set ZIBBY_DATA_DIR (vitest.setup.ts does this globally). This guards " +
        "against tests touching real data (Phase 12.5).",
    );
  }

  return path.join(zibbyHome(), "data");
}

/** Join sub-path segments onto the resolved data root. */
export function dataDir(...segments: string[]): string {
  return path.join(resolveDataRoot(), ...segments);
}

/**
 * Opt-in shared folder for recipes: `~/Documents/AI/ZibbyOS/recipes`, which iCloud
 * syncs across the operator's machines when "Desktop & Documents" is on.
 */
export const ICLOUD_RECIPES_DIR = path.join(os.homedir(), "Documents", "AI", "ZibbyOS", "recipes");

/**
 * Root of the recipes: operator-authored definitions (agents, workflows, skills,
 * automations, departments, teams, commands, hooks, mcp-servers, companies).
 * Runtime state (runs, activity, approvals, locks, ledgers, credentials) NEVER
 * goes here — iCloud has no cross-machine locking and makes conflict copies.
 *
 * Order: `ZIBBY_RECIPES_DIR`; an explicit `ZIBBY_DATA_DIR` / VITEST (isolated
 * roots keep recipes inside their root); the iCloud folder if it exists
 * (opt-in: create it, a second Mac picks it up once iCloud syncs); else the
 * data root.
 */
export function resolveRecipesRoot(): string {
  const explicit = process.env.ZIBBY_RECIPES_DIR;
  if (explicit) return path.resolve(explicit);
  if (process.env.ZIBBY_DATA_DIR || process.env.VITEST) return resolveDataRoot();
  try {
    if (fs.statSync(ICLOUD_RECIPES_DIR).isDirectory()) return ICLOUD_RECIPES_DIR;
  } catch {
    // not opted in
  }
  return resolveDataRoot();
}

/** Join sub-path segments onto the resolved recipes root. */
export function recipesDir(...segments: string[]): string {
  return path.join(resolveRecipesRoot(), ...segments);
}

/**
 * The Obsidian vault (second brain). `VAULT_DIR` wins; otherwise a run on the
 * live root uses the operator's vault at `~/AI/Vault`, while any explicit
 * `ZIBBY_DATA_DIR` (tests, the `:test` scripts, an isolated root) keeps its
 * vault inside that root — so an isolated run can never write the real vault.
 */
export function resolveVaultDir(): string {
  const explicit = process.env.VAULT_DIR;
  if (explicit) return path.resolve(explicit);
  if (process.env.ZIBBY_DATA_DIR || process.env.VITEST) return dataDir("vault");
  return path.join(os.homedir(), "AI", "Vault");
}

/**
 * Phase 76 — the ZibbyOS install root: the source checkout ZibbyOS runs from (and
 * develops itself in). `ZIBBY_SOURCE_ROOT` wins — the packaged app sets it to the
 * checkout it was built from, since its own code lives inside the .app bundle.
 * Otherwise an explicit `ZIBBY_DATA_DIR` keeps the legacy `<root>/.zibby/data`
 * arithmetic (two levels up), and a plain dev run resolves the repo from this
 * file's location (`apps/api/src/shared` → four levels up).
 */
export function installRoot(): string {
  const source = process.env.ZIBBY_SOURCE_ROOT;
  if (source) return path.resolve(source);
  if (process.env.ZIBBY_DATA_DIR) return path.resolve(resolveDataRoot(), "..", "..");
  return path.resolve(__dirname, "..", "..", "..", "..");
}

/**
 * Phase 76 — the default per-machine clone root when no `MachineConfig`
 * override exists: the parent folder of the ZibbyOS install root, so a fresh
 * clone of project `<id>` lands as a sibling of the ZibbyOS repo itself
 * (`<installRoot>/../<id>`), not inside it.
 */
export function defaultCloneRoot(): string {
  return path.resolve(installRoot(), "..");
}
