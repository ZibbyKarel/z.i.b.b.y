import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TopBar } from "./TopBar"

describe("TopBar", () => {
  it("renders the breadcrumb and wallet slot", () => {
    render(
      <TopBar
        breadcrumb="Přehled"
        walletSlot={<div>wallet</div>}
      />,
    )
    expect(screen.getByText("Přehled")).toBeInTheDocument()
    expect(screen.getByText("wallet")).toBeInTheDocument()
  })
})
