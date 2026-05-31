import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ModalShell } from "./ModalShell"

describe("ModalShell", () => {
  it("renders a labelled dialog with title and children", () => {
    render(
      <ModalShell label="Nový skill" glyph="spark" title="Nový skill" onClose={() => {}}>
        <div>tělo</div>
      </ModalShell>,
    )
    expect(screen.getByRole("dialog", { name: "Nový skill" })).toBeInTheDocument()
    expect(screen.getByText("tělo")).toBeInTheDocument()
  })

  it("closes via the close button", async () => {
    const onClose = vi.fn()
    render(
      <ModalShell label="x" glyph="spark" title="x" onClose={onClose}>
        <div />
      </ModalShell>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Zavřít" }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
