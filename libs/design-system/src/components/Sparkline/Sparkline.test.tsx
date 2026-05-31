import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Sparkline } from "./Sparkline"

describe("Sparkline", () => {
  it("renders polylines for data", () => {
    const { container } = render(<Sparkline data={[4, 6, 9, 7, 12]} />)
    expect(container.querySelectorAll("polyline").length).toBe(2)
  })

  it("renders nothing for empty data", () => {
    const { container } = render(<Sparkline data={[]} />)
    expect(container.querySelector("svg")).toBeNull()
  })
})
