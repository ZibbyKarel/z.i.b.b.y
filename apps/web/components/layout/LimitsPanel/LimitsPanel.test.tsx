import { describe, expect, it } from "vitest"
import { renderWithProviders, screen } from "../../../test/render"
import { LimitsPanel } from "./LimitsPanel"

describe("LimitsPanel", () => {
  it("renders the panel title and falls back to the static zero-usage config", () => {
    renderWithProviders(<LimitsPanel />)
    // Before the first poll the query is pending, so the panel renders from the
    // static CLAUDE_LIMITS fallback rather than flashing empty.
    expect(screen.getByText(/interaktivní limity/)).toBeInTheDocument()
  })
})
