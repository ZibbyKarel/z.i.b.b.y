import { readFileSync } from "node:fs"
import * as path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Phase 13.3 — guard the unattended-builder launchd plist. It carries the load-bearing
 * daemon semantics (crash-restart + goal auto-resume); a corrupted or trimmed plist would
 * silently break overnight operation. This is a static-content guard, not a launchctl test.
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

  it("enables unattended goal auto-resume (GOAL_AUTO_RESUME=1) — the daemon opt-in", () => {
    expect(PLIST).toMatch(/<key>GOAL_AUTO_RESUME<\/key>\s*<string>1<\/string>/)
  })

  it("pins the worktree root outside the repo/data tree", () => {
    expect(PLIST).toContain("<key>ZIBBY_WORKTREE_ROOT</key>")
  })
})
