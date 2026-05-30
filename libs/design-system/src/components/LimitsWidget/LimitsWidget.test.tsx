import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import type { AgentSdkCredit, ClaudeLimits } from "../../domain"
import { LimitsWidget } from "./LimitsWidget"

const limits: ClaudeLimits = {
  rolling: { label: "5h rolling", short: "5h", usedPct: 64, resetIn: "2h 11m", tokens: "128k / 200k" },
  weekly: { label: "Týdenní", short: "týden", usedPct: 38, resetIn: "Po 09:00", tokens: "1.9M / 5M" },
}

const credit: AgentSdkCredit = {
  label: "Agent SDK kredit",
  total: 200,
  used: 72,
  remaining: 128,
  usedPct: 36,
  renew: "1. čer",
  byAgent: [["Kodér", "work", 31]],
  byPipeline: [["Build Feature", "work", 38]],
  byContext: [["work", 57], ["home", 15]],
  trend: [4, 6, 9, 7, 12],
}

describe("LimitsWidget", () => {
  it("shows the remaining credit in the collapsed state", () => {
    render(<LimitsWidget limits={limits} credit={credit} />)
    expect(screen.getAllByText("$128").length).toBeGreaterThan(0)
  })

  it("expands to reveal the breakdown", async () => {
    render(<LimitsWidget limits={limits} credit={credit} />)
    const toggle = screen.getByRole("button", { expanded: false })
    await userEvent.click(toggle)
    expect(screen.getByText("PODLE AGENTA")).toBeInTheDocument()
    expect(screen.getByText(/TREND 14 DNÍ/)).toBeInTheDocument()
  })
})
