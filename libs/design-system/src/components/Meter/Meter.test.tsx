import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Meter, usageTone } from "./Meter"

describe("Meter", () => {
  it("exposes a progressbar role when labelled", () => {
    render(<Meter value={64} label="5h rolling" />)
    const bar = screen.getByRole("progressbar", { name: "5h rolling" })
    expect(bar).toHaveAttribute("aria-valuenow", "64")
  })

  it("clamps values to 0–100", () => {
    render(<Meter value={150} label="over" />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100")
  })

  it("renders no progressbar role without a label", () => {
    const { container } = render(<Meter value={20} />)
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
  })
})

describe("usageTone", () => {
  it("maps usage to traffic-light tones", () => {
    expect(usageTone(10)).toBe("ok")
    expect(usageTone(70)).toBe("warn")
    expect(usageTone(90)).toBe("bad")
  })
})
