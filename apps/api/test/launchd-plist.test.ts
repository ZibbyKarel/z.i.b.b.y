import { readFileSync } from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Phase 13.3 — guard the unattended-builder launchd plist. It carries the load-bearing
 * daemon semantics (crash-restart + the worktree root); a corrupted or trimmed plist would
 * silently break overnight operation. This is a static-content guard, not a launchctl test.
 *
 * Note: goal auto-resume is no longer an env var here — it moved to the file-backed
 * `goalAutoResume` knob in the runtime system config, so the plist must NOT pin it.
 */
const PLIST = readFileSync(
  path.resolve(__dirname, "..", "..", "..", "ops", "com.zibby.api.plist"),
  "utf8",
)

describe("com.zibby.api.plist (13.3)", () => {
  it("is a plist document for the api label running api:start", () => {
    expect(PLIST).toContain("<!DOCTYPE plist")
    expect(PLIST).toContain("</plist>")
    expect(PLIST).toMatch(/<key>Label<\/key>\s*<string>com\.zibby\.api<\/string>/)
    expect(PLIST).toContain("<string>api:start</string>")
  })

  it("keeps the service alive and starts it at load (crash-restart)", () => {
    expect(PLIST).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/)
    expect(PLIST).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/)
  })

  it("no longer carries GOAL_AUTO_RESUME (moved to the file-backed system config)", () => {
    expect(PLIST).not.toContain("GOAL_AUTO_RESUME")
  })

  it("pins the worktree root outside the repo/data tree", () => {
    expect(PLIST).toContain("<key>ZIBBY_WORKTREE_ROOT</key>")
  })
})
