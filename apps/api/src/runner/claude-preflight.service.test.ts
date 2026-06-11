import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node:child_process", () => ({ spawn: vi.fn() }))

import { spawn } from "node:child_process"
import { ClaudePreflightService, ClaudeUnavailableError } from "./claude-preflight.service"

const spawnMock = vi.mocked(spawn)

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

/** Queue the next spawn to behave per `script` (runs on the next macrotask). */
function nextSpawn(script: (child: FakeChild) => void): void {
  spawnMock.mockImplementationOnce(() => {
    const child = fakeChild()
    setTimeout(() => script(child), 0)
    return child as unknown as ReturnType<typeof spawn>
  })
}

describe("ClaudePreflightService", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    spawnMock.mockReset()
    delete process.env.CLAUDE_BIN
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.CLAUDE_BIN
  })

  async function probe(service: ClaudePreflightService, opts?: { force?: boolean }) {
    const promise = service.probe(opts)
    // Let the queued spawn script (and the 5s timeout, when relevant) fire.
    await vi.advanceTimersByTimeAsync(6_000)
    return promise
  }

  it("reports ok with the printed version on exit 0", async () => {
    nextSpawn((child) => {
      child.stdout.emit("data", Buffer.from("1.2.3 (Claude Code)\n"))
      child.emit("exit", 0)
    })
    const result = await probe(new ClaudePreflightService())
    expect(result).toEqual({ ok: true, version: "1.2.3 (Claude Code)" })
  })

  it("probes ${CLAUDE_BIN} when set", async () => {
    process.env.CLAUDE_BIN = "/opt/custom/claude"
    nextSpawn((child) => child.emit("exit", 0))
    await probe(new ClaudePreflightService())
    expect(spawnMock).toHaveBeenCalledWith(
      "/opt/custom/claude",
      ["--version"],
      expect.anything(),
    )
  })

  it("maps ENOENT to the reason 'missing'", async () => {
    nextSpawn((child) => {
      const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException
      err.code = "ENOENT"
      child.emit("error", err)
    })
    const result = await probe(new ClaudePreflightService())
    expect(result).toEqual({ ok: false, reason: "missing" })
  })

  it("reports a non-zero exit as a failure with the code", async () => {
    nextSpawn((child) => child.emit("exit", 7))
    const result = await probe(new ClaudePreflightService())
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("7")
  })

  it("times out a hung probe and kills the child", async () => {
    let child: FakeChild | undefined
    spawnMock.mockImplementationOnce(() => {
      child = fakeChild()
      return child as unknown as ReturnType<typeof spawn>
    })
    const service = new ClaudePreflightService()
    const promise = service.probe()
    await vi.advanceTimersByTimeAsync(5_100)
    const result = await promise
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("timed out")
    expect(child?.kill).toHaveBeenCalled()
  })

  it("caches an ok verdict for 30s and re-probes after the TTL", async () => {
    const service = new ClaudePreflightService()
    nextSpawn((child) => {
      child.stdout.emit("data", Buffer.from("1.0.0\n"))
      child.emit("exit", 0)
    })
    expect((await probe(service)).version).toBe("1.0.0")
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // Within the TTL: served from cache, no new spawn.
    expect((await service.probe()).version).toBe("1.0.0")
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // Past the 30s TTL (the probe helper already advanced 6s): probes again.
    await vi.advanceTimersByTimeAsync(31_000)
    nextSpawn((child) => {
      child.stdout.emit("data", Buffer.from("2.0.0\n"))
      child.emit("exit", 0)
    })
    expect((await probe(service)).version).toBe("2.0.0")
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it("caches a failure for only 5s", async () => {
    const service = new ClaudePreflightService()
    nextSpawn((child) => child.emit("exit", 1))
    expect((await probe(service)).ok).toBe(false)
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // The probe helper advanced 6s — past the 5s failure TTL, so it re-probes.
    nextSpawn((child) => child.emit("exit", 0))
    expect((await probe(service)).ok).toBe(true)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it("force re-probes through a fresh cache", async () => {
    const service = new ClaudePreflightService()
    nextSpawn((child) => child.emit("exit", 0))
    await probe(service)
    nextSpawn((child) => child.emit("exit", 1))
    const result = await probe(service, { force: true })
    expect(result.ok).toBe(false)
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it("assertAvailable throws ClaudeUnavailableError carrying the reason", async () => {
    const service = new ClaudePreflightService()
    nextSpawn((child) => {
      const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException
      err.code = "ENOENT"
      child.emit("error", err)
    })
    const promise = service.assertAvailable()
    // Swallow the rejection while timers advance, then assert on it.
    const outcome = promise.then(
      () => null,
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    const error = await outcome
    expect(error).toBeInstanceOf(ClaudeUnavailableError)
    expect((error as ClaudeUnavailableError).reason).toBe("missing")
  })
})
