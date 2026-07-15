import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isValidGitRemote } from "@zibby/contracts";

/**
 * Task 8 — shared git primitives: (a) the bounded-`execFile` wrapper
 * `WorkspaceService` and `SelfService` used to each define byte-for-byte
 * independently, and (b) the clone-remote allowlist gate. Flat `shared/` dir,
 * one concern per file — same home as `ticking-watcher-base.ts`/`retry.ts`.
 */

/** `promisify(execFile)` — the exact wrapper both services used to redefine. */
export const exec = promisify(execFile);

/** Local-only git invocations (no network) — a short timeout bounds a hang. */
export const GIT_TIMEOUT_MS = 10_000;

/**
 * `git fetch`/`git clone`/`git pull` touch the network — a much longer bound
 * than the local-only calls above, but still finite so a dead remote fails
 * soft (or fails the run) rather than hanging indefinitely.
 */
export const GIT_NETWORK_TIMEOUT_MS = 60_000;

/** Is `dir` inside a git work tree? A cheap `rev-parse` probe (no network). */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--git-dir"], { cwd: dir, timeout: GIT_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

/**
 * The single source-of-truth "is this a legit git clone remote" predicate,
 * re-exported here so `validateRemote()` below and every apps/api caller
 * reach it through one module. The predicate itself is DEFINED in
 * `@zibby/contracts` (`project.schema.ts`), not here — `libs/contracts` is
 * the dependency-free base layer apps/api already depends on (contract-first
 * — CLAUDE.md), so the `gitRemote` Zod refinement imports it directly there,
 * while apps/api reaches the identical definition via this re-export.
 * Defining it in `apps/api/src/shared` and having `libs/contracts` import it
 * back would invert that dependency direction — and there is no module path
 * for it anyway (no package name / tsconfig alias points from
 * `libs/contracts` at `apps/api`).
 */
export { isValidGitRemote };

/**
 * Raised by {@link validateRemote} — mirrors `WorkspaceSetupError`'s style: a
 * small named domain error, not a generic `Error`. Modeled on the existing
 * `machine.service.ts` `assertHttpUrl()` precedent (narrow allowlist, throw
 * typed, re-validate at the point of use).
 */
export class InvalidGitRemoteError extends Error {
  constructor(public readonly remote: string) {
    super(`Invalid git remote (rejected by allowlist): "${remote}"`);
    this.name = "InvalidGitRemoteError";
  }
}

/**
 * Fail-closed allowlist gate for a git clone remote. Called at
 * `ProjectLocalService.clone()` — the one production call site that receives
 * an operator-authored `project.gitRemote` — BEFORE `WorkspaceService.clone()`
 * ever runs, so a malicious value never reaches git's argv/transport layer.
 * Throws {@link InvalidGitRemoteError} (not a generic `Error`) so callers/tests
 * can assert the specific rejection.
 */
export function validateRemote(url: string): void {
  if (!isValidGitRemote(url)) {
    throw new InvalidGitRemoteError(url);
  }
}
