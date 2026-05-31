import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Stat } from "./Stat"

describe("Stat", () => {
  it("renders value and label", () => {
    render(<Stat value="02" label="běžící agenti" icon="pulse" tone="accent" />)
    expect(screen.getByText("02")).toBeInTheDocument()
    expect(screen.getByText("běžící agenti")).toBeInTheDocument()
  })
})
