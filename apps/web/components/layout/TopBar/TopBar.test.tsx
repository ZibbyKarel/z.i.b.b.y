import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TopBar } from "./TopBar"

describe("TopBar", () => {
  it("renders the breadcrumb, context switch and wallet slot", () => {
    render(
      <TopBar
        breadcrumb="Přehled"
        context="home"
        onContextChange={() => {}}
        walletSlot={<div>wallet</div>}
      />,
    )
    expect(screen.getByText("Přehled")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Přepínač kontextu" })).toBeInTheDocument()
    expect(screen.getByText("wallet")).toBeInTheDocument()
  })
})
