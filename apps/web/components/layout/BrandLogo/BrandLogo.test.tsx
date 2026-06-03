import { describe, expect, it } from "vitest"
import { renderWithProviders, screen } from "../../../test/render"
import { BrandLogo } from "./BrandLogo"

describe("BrandLogo", () => {
  it("renders the tagline", () => {
    renderWithProviders(<BrandLogo />)
    expect(
      screen.getByText("Zestful Intuitive Brainy Butler for You"),
    ).toBeInTheDocument()
  })
})
