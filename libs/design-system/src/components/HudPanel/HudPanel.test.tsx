import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HudPanel } from "./HudPanel"

describe("HudPanel", () => {
  it("renders children", () => {
    render(<HudPanel>obsah</HudPanel>)
    expect(screen.getByText("obsah")).toBeInTheDocument()
  })

  it("renders a title with the // prefix", () => {
    render(<HudPanel title="běžící agenti">x</HudPanel>)
    expect(screen.getByText(/běžící agenti/)).toBeInTheDocument()
    expect(screen.getByText("//")).toBeInTheDocument()
  })

  it("renders an action slot", () => {
    render(
      <HudPanel title="rozpočty" action={<button>Přidat</button>}>
        x
      </HudPanel>,
    )
    expect(screen.getByRole("button", { name: "Přidat" })).toBeInTheDocument()
  })
})
