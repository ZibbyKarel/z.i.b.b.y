import { describe, expect, it } from "vitest"
import { SearchMenuTestId } from "@zibby/design-system"
import { renderWithProviders, screen } from "../../../test/render"
import { CatalogProvider } from "../../../state/store"
import { TopBar } from "./TopBar"

describe("TopBar", () => {
  it("renders the breadcrumb, wallet slot and the global search", () => {
    renderWithProviders(
      <CatalogProvider>
        <TopBar breadcrumb="Přehled" walletSlot={<div>wallet</div>} />
      </CatalogProvider>,
    )
    expect(screen.getByText("Přehled")).toBeInTheDocument()
    expect(screen.getByText("wallet")).toBeInTheDocument()
    // The command bar is now the functional global-search input.
    expect(screen.getByTestId(SearchMenuTestId.Input)).toHaveAccessibleName(
      "Hledat v pracovním prostoru",
    )
  })
})
