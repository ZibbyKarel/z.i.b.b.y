import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SectionLabel } from "./SectionLabel"

describe("SectionLabel", () => {
  it("renders the label text", () => {
    render(<SectionLabel>Pipeline · work</SectionLabel>)
    expect(screen.getByText("Pipeline · work")).toBeInTheDocument()
  })

  it("renders an action", () => {
    render(
      <SectionLabel action={<button>Přidat pipeline</button>}>Pipeline</SectionLabel>,
    )
    expect(
      screen.getByRole("button", { name: "Přidat pipeline" }),
    ).toBeInTheDocument()
  })
})
