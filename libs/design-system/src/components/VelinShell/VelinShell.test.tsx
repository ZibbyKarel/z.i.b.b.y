import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { AgentSdkCredit, ClaudeLimits, NavItem } from "../../domain"
import { VelinShell } from "./VelinShell"

const navItems: NavItem[] = [
  { id: "overview", label: "Přehled", glyph: "grid" },
  { id: "pipelines", label: "Orchestrace", glyph: "flow" },
]
const limits: ClaudeLimits = {
  rolling: { label: "5h rolling", short: "5h", usedPct: 64, resetIn: "2h", tokens: "x" },
  weekly: { label: "Týdenní", short: "týden", usedPct: 38, resetIn: "Po", tokens: "y" },
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

describe("VelinShell", () => {
  it("renders chrome and content together", () => {
    render(
      <VelinShell
        context="home"
        onContextChange={() => {}}
        navItems={navItems}
        activeNav="overview"
        onNavigate={() => {}}
        breadcrumb="Přehled"
        limits={limits}
        credit={credit}
      >
        <div>tělo velínu</div>
      </VelinShell>,
    )
    expect(screen.getByRole("navigation", { name: "Hlavní navigace" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Přepínač kontextu" })).toBeInTheDocument()
    expect(screen.getByText("tělo velínu")).toBeInTheDocument()
  })
})
