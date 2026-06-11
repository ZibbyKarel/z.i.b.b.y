import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusDotTestId } from "../StatusDot/StatusDot"
import { StatusChip, StatusChipTestId } from "./StatusChip"

const dotOf = (chip: HTMLElement) =>
  within(chip).getByTestId(StatusDotTestId.Dot)

describe("StatusChip", () => {
  it("renders the default label for a state", () => {
    render(<StatusChip state="ok" />)
    expect(screen.getByTestId(StatusChipTestId.Root)).toHaveTextContent("done")
  })

  it("children override the default label", () => {
    render(<StatusChip state="run">běží</StatusChip>)
    expect(screen.getByTestId(StatusChipTestId.Root)).toHaveTextContent("běží")
  })

  it("pulses the dot only for live states", () => {
    const { rerender } = render(<StatusChip state="run" />)
    expect(dotOf(screen.getByTestId(StatusChipTestId.Root)).className).toContain(
      "animate-live",
    )

    rerender(<StatusChip state="ok" />)
    expect(dotOf(screen.getByTestId(StatusChipTestId.Root)).className).not.toContain(
      "animate-live",
    )
  })
})
