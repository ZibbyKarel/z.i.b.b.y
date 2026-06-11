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

  it("renders no decorative overlay elements", () => {
    render(<Surface background="scene">x</Surface>)
    expect(
      screen.getByTestId(SurfaceTestId.Root).querySelectorAll('[aria-hidden="true"]'),
    ).toHaveLength(0)
  })

  it("paints the scene gradient for the app shell", () => {
    render(<Surface background="scene">x</Surface>)
    expect(screen.getByTestId(SurfaceTestId.Root).className).toContain(
      "bg-[image:var(--gradient-scene)]",
    )
  })
})
