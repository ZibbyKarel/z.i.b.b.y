import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusDot } from "./StatusDot"

describe("StatusDot", () => {
  it("renders a sized dot", () => {
    const { container } = render(<StatusDot size={10} />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe("10px")
  })

  it("adds a pulse ring when pulse is set", () => {
    const { container } = render(<StatusDot pulse />)
    expect(container.querySelector(".animate-zpulse")).not.toBeNull()
  })

  it("omits the pulse ring by default", () => {
    const { container } = render(<StatusDot />)
    expect(container.querySelector(".animate-zpulse")).toBeNull()
  })
})
