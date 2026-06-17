import { describe, expect, it, vi } from "vitest"
import { SubsystemHealthService } from "./subsystem-health.service"

function build(over: {
  vaultThrows?: boolean
  integrationsThrows?: boolean
  scheduler?: { running: boolean; tickMs: number; lastTickAt: string | null }
}) {
  const vault = { index: vi.fn(async () => (over.vaultThrows ? Promise.reject(new Error("ENOENT")) : [])) }
  const integrations = {
    list: vi.fn(async () => (over.integrationsThrows ? Promise.reject(new Error("EACCES")) : [])),
  }
  const scheduler = { health: () => over.scheduler ?? { running: true, tickMs: 60000, lastTickAt: null } }
  return new SubsystemHealthService(vault as never, integrations as never, scheduler as never)
}

function byName(rows: { name: string; status: string; detail?: string }[], name: string) {
  return rows.find((r) => r.name === name)
}

describe("SubsystemHealthService", () => {
  it("reports all ok when every probe succeeds and the loop is armed", async () => {
    const rows = await build({ scheduler: { running: true, tickMs: 60000, lastTickAt: "2026-06-17T00:00:00.000Z" } }).probeAll()
    expect(rows.map((r) => r.name)).toEqual(["backend", "vault", "integrations", "scheduler"])
    expect(rows.every((r) => r.status === "ok")).toBe(true)
    expect(byName(rows, "scheduler")?.detail).toContain("last tick")
  })

  it("marks vault down when its index throws", async () => {
    const rows = await build({ vaultThrows: true }).probeAll()
    expect(byName(rows, "vault")).toMatchObject({ status: "down", detail: "ENOENT" })
  })

  it("marks integrations down when the registry is unreadable", async () => {
    const rows = await build({ integrationsThrows: true }).probeAll()
    expect(byName(rows, "integrations")).toMatchObject({ status: "down", detail: "EACCES" })
  })

  it("treats a disabled tick loop (tickMs<=0) as ok, not degraded", async () => {
    const rows = await build({ scheduler: { running: false, tickMs: 0, lastTickAt: null } }).probeAll()
    expect(byName(rows, "scheduler")).toMatchObject({ status: "ok" })
    expect(byName(rows, "scheduler")?.detail).toContain("disabled")
  })

  it("degrades the scheduler when configured to run but not armed", async () => {
    const rows = await build({ scheduler: { running: false, tickMs: 60000, lastTickAt: null } }).probeAll()
    expect(byName(rows, "scheduler")).toMatchObject({ status: "degraded" })
  })
})
