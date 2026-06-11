import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RiskTag, RiskTagTestId } from "./RiskTag"

describe("RiskTag", () => {
  it("renders the default label and glyph for a risk kind", () => {
    render(<RiskTag risk="payment" />)
    expect(screen.getByTestId(RiskTagTestId.Root)).toHaveTextContent("payment")
    expect(screen.getByTestId(RiskTagTestId.Icon)).toBeInTheDocument()
  })

  it("children override the default label", () => {
    render(<RiskTag risk="deletion">mazání</RiskTag>)
    expect(screen.getByTestId(RiskTagTestId.Root)).toHaveTextContent("mazání")
  })
})
