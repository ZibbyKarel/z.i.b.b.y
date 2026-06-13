import { describe, expect, it } from "vitest"
import { DEFAULT_VERIFY_CHECKS } from "@zibby/contracts"
import { buildVerifyCommand } from "./verify-command"

describe("buildVerifyCommand", () => {
  it("prefers explicit commands over project checks and defaults", () => {
    const cmd = buildVerifyCommand({
      commands: ["echo a", "echo b"],
      projectChecks: ["should-not-run"],
    })
    expect(cmd.command).toBe("/bin/sh")
    expect(cmd.args).toEqual(["-c", "echo a && echo b"])
  })

  it("falls back to project checks when no explicit commands", () => {
    const cmd = buildVerifyCommand({ projectChecks: ["pnpm verify"] })
    expect(cmd.args).toEqual(["-c", "pnpm verify"])
  })

  it("falls back to the default checks when neither is set", () => {
    const cmd = buildVerifyCommand({})
    expect(cmd.args).toEqual(["-c", DEFAULT_VERIFY_CHECKS.join(" && ")])
  })

  it("threads spawnCwd when given and omits it otherwise", () => {
    expect(buildVerifyCommand({ spawnCwd: "/tmp/wt" }).spawnCwd).toBe("/tmp/wt")
    expect(buildVerifyCommand({}).spawnCwd).toBeUndefined()
  })
})
