import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { GridTestId } from "@zibby/design-system"
import { CardGrid } from "./CardGrid"

describe("CardGrid", () => {
  it("renders each child inside a grid", () => {
    render(
      <CardGrid>
        <div>a</div>
        <div>b</div>
      </CardGrid>,
    )
    expect(screen.getByTestId(GridTestId.Root)).toBeInTheDocument()
    expect(screen.getByText("a")).toBeInTheDocument()
    expect(screen.getByText("b")).toBeInTheDocument()
  })

  it("lays out as a CSS grid", () => {
    render(<CardGrid>x</CardGrid>)
    expect(screen.getByTestId(GridTestId.Root)).toHaveStyle({ display: "grid" })
  })
})
