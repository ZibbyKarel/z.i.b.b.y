import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Law 1: registering ZIBBY a workspace root is an operator-only act. The grant
 * mutation (`useCreateProjectMutation`) may only be reached from the projects feature's
 * own explicit CRUD UI. No other surface — and crucially no autonomous one (discovery,
 * channel triage, voice) — may import it, so a path arriving from a non-interactive
 * source can never auto-register a project.
 *
 * The New Task composer no longer grants: a path referenced in the description is
 * folded straight into the run's allowed directories via the task's `paths`, which
 * needs no project registration. Project membership is managed solely in the projects
 * feature.
 *
 * This is a static guard: it walks every feature file and asserts the only consumer of
 * the grant mutation is the projects feature itself.
 */
// Resolve the features dir from the run cwd (repo root or apps/web, depending on
// how vitest is invoked) — `import.meta.url` is not a file: URL under the transform.
const FEATURES_DIR =
  [resolve(process.cwd(), "apps/web/features"), resolve(process.cwd(), "features")].find((dir) =>
    existsSync(dir),
  ) ?? resolve(process.cwd(), "features");
const GRANT_HOOK = "useCreateProjectMutation";

/** Allowed to consume the grant mutation: the projects CRUD UI, and nothing else. */
const ALLOWED = [/\/features\/projects\//];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(full) && !full.endsWith(".test.ts") && !full.endsWith(".test.tsx")
      ? [full]
      : [];
  });
}

describe("grant is operator-only (Law 1)", () => {
  it("only the projects UI references the grant mutation", () => {
    const offenders = walk(FEATURES_DIR).filter((file) => {
      if (ALLOWED.some((re) => re.test(file))) return false;
      return readFileSync(file, "utf8").includes(GRANT_HOOK);
    });
    expect(offenders).toEqual([]);
  });
});
