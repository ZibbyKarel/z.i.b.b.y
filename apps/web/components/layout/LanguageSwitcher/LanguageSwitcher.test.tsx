import { describe, expect, it } from "vitest"
import { renderWithProviders, screen } from "../../../test/render"
import { LanguageSwitcher } from "./LanguageSwitcher"

describe("LanguageSwitcher", () => {
  it("renders a labelled language trigger", () => {
    renderWithProviders(<LanguageSwitcher />)
    expect(
      screen.getByRole("button", { name: "Jazyk rozhraní" }),
    ).toBeInTheDocument()
  })
})
