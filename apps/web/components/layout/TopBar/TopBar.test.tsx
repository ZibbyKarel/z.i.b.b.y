import { describe, expect, it } from "vitest"
import { renderWithProviders, screen } from "../../../test/render"
import { TopBar } from "./TopBar"

describe("TopBar", () => {
  it("renders the breadcrumb and wallet slot", () => {
    renderWithProviders(
      <TopBar
        breadcrumb="Přehled"
        walletSlot={<div>wallet</div>}
      />,
    )
    expect(screen.getByText("Přehled")).toBeInTheDocument()
    expect(screen.getByText("wallet")).toBeInTheDocument()
  })
})
