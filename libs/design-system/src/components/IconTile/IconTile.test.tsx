import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { IconTile, IconTileTestId } from "./IconTile"
import { IconTestId } from "../Icon/Icon"

describe("IconTile", () => {
  it("renders the glyph at the size paired to the tile", () => {
    render(<IconTile glyph="bot" size="xl" />)
    const tile = screen.getByTestId(IconTileTestId.Root)
    expect(tile.style.width).toBe("56px")
    expect(tile.style.height).toBe("56px")
    expect(screen.getByTestId(IconTestId.Root)).toBeInTheDocument()
  })

  it("renders children instead of a glyph when provided", () => {
    render(
      <IconTile>
        <span>X</span>
      </IconTile>,
    )
    expect(screen.getByText("X")).toBeInTheDocument()
    expect(screen.queryByTestId(IconTestId.Root)).toBeNull()
  })

  it("acts as a button and fires onClick when interactive", async () => {
    const onClick = vi.fn()
    render(<IconTile as="button" interactive glyph="edit" onClick={onClick} />)
    await userEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
