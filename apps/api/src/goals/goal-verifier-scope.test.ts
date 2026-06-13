import { describe, expect, it } from "vitest"
import { checksVerifierBlocker } from "./goal-runner.service"

/**
 * Phase 12.1/12.2 — the predicate that refuses an unsafe goal `checks` verifier
 * before it can run the full-monorepo `DEFAULT_VERIFY_CHECKS` (12.1) or run with
 * cwd inside this repo (12.2). `null` = safe to run; a string = readable refusal.
 */
describe("checksVerifierBlocker", () => {
  const CWD = "/tmp/worktree"

  it("refuses (no scope) when neither commands nor project checks exist", () => {
    const blocker = checksVerifierBlocker(undefined, undefined, CWD)
    expect(blocker).toMatch(/no verifier scope/)
  })

  it("refuses (no scope) for empty command/checks arrays", () => {
    expect(checksVerifierBlocker([], [], CWD)).toMatch(/no verifier scope/)
  })

  it("allows explicit commands with a cwd", () => {
    expect(checksVerifierBlocker(["pnpm --filter app test"], undefined, CWD)).toBeNull()
  })

  it("allows project checks with a cwd", () => {
    expect(checksVerifierBlocker(undefined, ["pnpm test"], CWD)).toBeNull()
  })

  it("refuses (no cwd) even when scoped — never runs checks inside the repo", () => {
    const blocker = checksVerifierBlocker(["pnpm test"], undefined, undefined)
    expect(blocker).toMatch(/no workspace or project/)
  })

  it("reports the no-scope root cause first when both scope and cwd are missing", () => {
    // The bombed shape: no commands, no project, no worktree.
    expect(checksVerifierBlocker(undefined, undefined, undefined)).toMatch(/no verifier scope/)
  })
})
