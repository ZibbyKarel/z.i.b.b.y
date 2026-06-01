import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Stat, StatTestId } from "./Stat"

describe("Stat", () => {
  it("renders value and label", () => {
    render(<Stat value="02" label="běžící agenti" icon="pulse" tone="accent" />)
    expect(screen.getByTestId(StatTestId.Value)).toHaveTextContent("02")
    expect(screen.getByTestId(StatTestId.Label)).toHaveTextContent("běžící agenti")
  })
})
