import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { AgentSdkCredit, ClaudeLimits } from "../../domain"
import { TopBar } from "./TopBar"

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
  byAgent: [],
  byPipeline: [],
  byContext: [["work", 57]],
  trend: [1, 2, 3],
}

describe("TopBar", () => {
  it("renders the breadcrumb and context switch", () => {
    render(
      <TopBar
        context="home"
        onContextChange={() => {}}
        breadcrumb="Přehled"
        limits={limits}
        credit={credit}
      />,
    )
    expect(screen.getByText("Přehled")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Přepínač kontextu" })).toBeInTheDocument()
  })
})
