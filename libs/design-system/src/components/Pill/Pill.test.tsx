import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Pill } from "./Pill"

describe("Pill", () => {
  it("renders its content", () => {
    render(<Pill tone="ok">hotovo</Pill>)
    expect(screen.getByText("hotovo")).toBeInTheDocument()
  })

  it("applies a solid tone variant", () => {
    render(
      <Pill tone="accent" solid>
        work
      </Pill>,
    )
    expect(screen.getByText("work").className).toContain("text-accent-contrast")
  })
})
