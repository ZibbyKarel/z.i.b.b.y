import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusDot, StatusDotTestId } from "./StatusDot"

describe("StatusDot", () => {
  it("renders a sized dot", () => {
    render(<StatusDot tone="accent" size="150" />)
    expect(screen.getByTestId(StatusDotTestId.Root).style.width).toBe("12px")
  })

  it("adds a pulse ring when pulse is set", () => {
    render(<StatusDot tone="ok" pulse />)
    expect(screen.queryByTestId(StatusDotTestId.Pulse)).not.toBeNull()
  })

  it("omits the pulse ring by default", () => {
    render(<StatusDot tone="faint" />)
    expect(screen.queryByTestId(StatusDotTestId.Pulse)).toBeNull()
  })
})
