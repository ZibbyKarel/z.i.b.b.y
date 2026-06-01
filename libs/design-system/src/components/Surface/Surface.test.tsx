import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Surface, SurfaceTestId } from "./Surface"

describe("Surface", () => {
  it("renders its children inside the content layer", () => {
    render(
      <Surface>
        <span>shell</span>
      </Surface>,
    )
    expect(screen.getByTestId(SurfaceTestId.Content)).toHaveTextContent("shell")
  })

  it("omits decorative overlays by default", () => {
    render(<Surface>x</Surface>)
    expect(
      screen.getByTestId(SurfaceTestId.Root).querySelectorAll('[aria-hidden="true"]'),
    ).toHaveLength(0)
  })

  it("renders grid and scanline overlays when enabled", () => {
    render(
      <Surface grid scanlines>
        x
      </Surface>,
    )
    expect(
      screen.getByTestId(SurfaceTestId.Root).querySelectorAll('[aria-hidden="true"]'),
    ).toHaveLength(2)
  })
})
