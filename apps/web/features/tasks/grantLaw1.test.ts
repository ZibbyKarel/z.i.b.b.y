import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Law 1 (Phase 11.3): granting ZIBBY a workspace root is an operator-only act. The
 * grant mutation (`useCreateProjectMutation`) may only be reached from an explicit,
 * operator-driven surface — the New Task composer's confirm. No autonomous surface
 * (voice-without-confirm, discovery, channel triage views) may import it, so an
 * out-of-project path arriving from a non-interactive source can never auto-grant.
 *
 * This is a static guard: it walks every feature file and asserts the only consumers
 * of the grant mutation are the projects feature itself (its own CRUD UI) and the
 * tasks composer (the gated confirm).
 */
// Resolve the features dir from the run cwd (repo root or apps/web, depending on
// how vitest is invoked) — `import.meta.url` is not a file: URL under the transform.
const FEATURES_DIR =
  [resolve(process.cwd(), "apps/web/features"), resolve(process.cwd(), "features")].find((dir) =>
    existsSync(dir),
  ) ?? resolve(process.cwd(), "features");
const GRANT_HOOK = "useCreateProjectMutation";

/** Allowed to consume the grant mutation: the projects CRUD UI + the gated composer. */
const ALLOWED = [/\/features\/projects\//, /\/features\/tasks\/components\/NewTaskDialog\.tsx$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) && !full.endsWith(".test.ts") && !full.endsWith(".test.tsx")
      ? [full]
      : [];
  });
}

describe("Phase 11.3 grant is operator-only (Law 1)", () => {
  it("only the projects UI and the tasks composer reference the grant mutation", () => {
    const offenders = walk(FEATURES_DIR).filter((file) => {
      if (ALLOWED.some((re) => re.test(file))) return false;
      return readFileSync(file, "utf8").includes(GRANT_HOOK);
    });
    expect(offenders).toEqual([]);
  });
});
