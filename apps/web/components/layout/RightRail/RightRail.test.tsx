import { describe, expect, it } from "vitest"
import { renderWithProviders, screen } from "../../../test/render"
import { CatalogProvider } from "../../../state/store"
import { RightRail } from "./RightRail"

describe("RightRail", () => {
  it("renders the persistent rail panels (limits + approvals queue)", () => {
    // No live API under test, so the queries stay pending and each panel renders
    // its empty/fallback state — enough to assert the rail is wired up.
    renderWithProviders(
      <CatalogProvider>
        <RightRail />
      </CatalogProvider>,
    )
    expect(screen.getByText(/interaktivní limity/)).toBeInTheDocument()
    expect(screen.getByText("fronta schválení")).toBeInTheDocument()
  })
})
