import type { ProjectBudget } from "@zibby/contracts"
import { describe, expect, it } from "vitest"
import { goalBudgetExceeded } from "./goal-runner.service"

/**
 * Phase 13.1 — the goal's OWN windowed budget. A goal iteration is one maker run, so the
 * iteration records are the run ledger; count those inside the rolling daily/weekly window.
 */
const NOW = new Date("2026-06-14T12:00:00.000Z")
const hoursAgo = (h: number) => ({ startedAt: new Date(NOW.getTime() - h * 3_600_000).toISOString() })

describe("goalBudgetExceeded (13.1)", () => {
  it("never exceeded without a budget", () => {
    expect(goalBudgetExceeded(undefined, [hoursAgo(1), hoursAgo(2)], NOW)).toBe(false)
  })

  it("never exceeded with an empty (no-cap) budget", () => {
    expect(goalBudgetExceeded({} as ProjectBudget, [hoursAgo(1)], NOW)).toBe(false)
  })

  it("dailyRuns: under the cap → ok, at the cap → exceeded", () => {
    const budget: ProjectBudget = { dailyRuns: 2 }
    expect(goalBudgetExceeded(budget, [hoursAgo(1)], NOW)).toBe(false) // 1 < 2
    expect(goalBudgetExceeded(budget, [hoursAgo(1), hoursAgo(3)], NOW)).toBe(true) // 2 >= 2
  })

  it("iterations older than 24h do not count toward dailyRuns", () => {
    const budget: ProjectBudget = { dailyRuns: 2 }
    // Two iterations, but one is 30h ago → only 1 in the daily window.
    expect(goalBudgetExceeded(budget, [hoursAgo(1), hoursAgo(30)], NOW)).toBe(false)
  })

  it("weeklyRuns windows over 7 days", () => {
    const budget: ProjectBudget = { weeklyRuns: 3 }
    const within = [hoursAgo(1), hoursAgo(48), hoursAgo(120)] // all < 168h
    expect(goalBudgetExceeded(budget, within, NOW)).toBe(true) // 3 >= 3
    expect(goalBudgetExceeded(budget, [hoursAgo(1), hoursAgo(200)], NOW)).toBe(false) // 1 in window
  })

  it("either cap can trip independently", () => {
    const budget: ProjectBudget = { dailyRuns: 5, weeklyRuns: 2 }
    expect(goalBudgetExceeded(budget, [hoursAgo(1), hoursAgo(10)], NOW)).toBe(true) // weekly 2 >= 2
  })
})
