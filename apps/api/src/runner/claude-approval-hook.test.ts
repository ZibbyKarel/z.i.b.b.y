import { spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Direct coverage for the PreToolUse approval hook's destructive-command detector.
 * The Cleaner e2e drives a stubbed `claude` (fake-claude.mjs) that fakes the gate
 * handshake, so the *real* `isDestructive`/`parseTargets` in the hook were never
 * exercised — which is how `find … -delete` slipped the gate in production. These
 * tests run the actual hook binary the way Claude Code does: an event JSON on stdin.
 */
const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "claude-approval-hook.mjs")

interface HookResult {
  stdout: string
  code: number | null
}

/** Run the hook with `event` on stdin, in `cwd`; resolve once it exits. */
function runHook(cwd: string, event: unknown, env?: Record<string, string>): Promise<HookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], { cwd, env: { ...process.env, ...env } })
    let stdout = ""
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString()
    })
    child.on("error", reject)
    child.on("close", (code) => resolve({ stdout, code }))
    child.stdin.write(JSON.stringify(event))
    child.stdin.end()
  })
}

const bashEvent = (command: string, cwd: string) => ({
  tool_name: "Bash",
  tool_input: { command },
  cwd,
})

describe("claude approval hook — destructive-command gate", () => {
  let cwd: string
  const requestFile = () => path.join(cwd, "intent-request.json")
  /** Pre-write an allow decision so the (blocking) hook returns immediately. */
  const preApprove = () =>
    fs.writeFile(path.join(cwd, "intent-decision.json"), JSON.stringify({ decision: "allow" }), "utf8")
  const readRequest = async () => JSON.parse(await fs.readFile(requestFile(), "utf8"))
  const present = (p: string) =>
    fs
      .access(p)
      .then(() => true)
      .catch(() => false)

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "hook-"))
  })
  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true })
  })

  it("lets a non-destructive command through without raising a request", async () => {
    const res = await runHook(cwd, bashEvent("ls -la && cat report.txt", cwd))
    expect(res.code).toBe(0)
    expect(res.stdout).toBe("")
    expect(await present(requestFile())).toBe(false)
  })

  it("ignores a non-Bash tool call entirely", async () => {
    const res = await runHook(cwd, { tool_name: "Read", tool_input: { file_path: "/etc/hosts" }, cwd })
    expect(res.code).toBe(0)
    expect(await present(requestFile())).toBe(false)
  })

  it("gates a plain rm and keeps a quoted, spaced filename as one target", async () => {
    await preApprove()
    const res = await runHook(cwd, bashEvent('rm -rf ".DS_Store" "zibby-ascii 2.txt"', cwd))
    const req = await readRequest()
    expect(req.action).toBe("delete")
    const ctx = JSON.parse(req.context)
    expect(ctx.preview.targets).toEqual([".DS_Store", "zibby-ascii 2.txt"])
    expect(res.stdout).toContain('"permissionDecision":"allow"')
  })

  it("gates `find … -delete` (the .DS_Store sweep that previously slipped the gate)", async () => {
    await preApprove()
    await runHook(cwd, bashEvent("find . -name .DS_Store -delete", cwd))
    expect(await present(requestFile())).toBe(true)
    const ctx = JSON.parse((await readRequest()).context)
    // No enumerable positional targets — the command string is the source of truth.
    expect(ctx.preview.targets).toEqual([])
    expect(ctx.summary).toBe("Delete files matched by the command")
  })

  it("gates `git clean -fdx` but not a commit whose message merely says 'clean'", async () => {
    await preApprove()
    await runHook(cwd, bashEvent("git clean -fdx", cwd))
    expect(await present(requestFile())).toBe(true)

    await fs.rm(requestFile(), { force: true })
    const res = await runHook(cwd, bashEvent('git commit -m "clean up the workspace"', cwd))
    expect(res.code).toBe(0)
    expect(await present(requestFile())).toBe(false)
  })

  it("writes the request into ZIBBY_INTENT_DIR, not the command's cwd", async () => {
    // The regression: a clean agent runs `rm` inside the granted target directory, so
    // the Bash call's cwd is the target — not the sandbox the core watches. The hook
    // must honour the explicit coordination dir and ignore `input.cwd`.
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-"))
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "target-"))
    try {
      await fs.writeFile(
        path.join(sandbox, "intent-decision.json"),
        JSON.stringify({ decision: "allow" }),
        "utf8",
      )
      // Event reports the *target* as cwd; env points the gate at the *sandbox*.
      await runHook(target, bashEvent("rm -rf scratch.tmp", target), {
        ZIBBY_INTENT_DIR: sandbox,
      })
      // Request landed in the sandbox (watched), never in the target (the regression).
      expect(await present(path.join(sandbox, "intent-request.json"))).toBe(true)
      expect(await present(path.join(target, "intent-request.json"))).toBe(false)
    } finally {
      await fs.rm(sandbox, { recursive: true, force: true })
      await fs.rm(target, { recursive: true, force: true })
    }
  })

  it("denies (exit-blocks) when the decision is reject", async () => {
    await fs.writeFile(
      path.join(cwd, "intent-decision.json"),
      JSON.stringify({ decision: "deny" }),
      "utf8",
    )
    const res = await runHook(cwd, bashEvent("rm -rf scratch.tmp", cwd))
    expect(res.stdout).toContain('"permissionDecision":"deny"')
  })
})
