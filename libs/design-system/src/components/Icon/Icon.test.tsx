import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Icon, iconNames } from "./Icon"

describe("Icon", () => {
  it("renders an svg for every named glyph", () => {
    for (const name of iconNames) {
      const { container, unmount } = render(<Icon name={name} />)
      expect(container.querySelector("svg")).not.toBeNull()
      unmount()
    }
  })

  it("applies size and stroke", () => {
    const { container } = render(<Icon name="play" size={24} stroke={2} />)
    const svg = container.querySelector("svg")!
    expect(svg.getAttribute("width")).toBe("24")
    expect(svg.getAttribute("stroke-width")).toBe("2")
  })

  it("is hidden from the accessibility tree by default", () => {
    const { container } = render(<Icon name="ok" />)
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })
})
