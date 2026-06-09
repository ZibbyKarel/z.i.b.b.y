import { renderWithProviders as render, screen } from "../../../../test/render"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Agent } from "@zibby/contracts"
import { RunModal } from "./RunModal"

const agent: Agent = {
  id: "rohlik",
  name: "rohlik",
  glyph: "cart",
  description: "Naplní košík podle seznamu",
  instructions: "Naplní košík podle seznamu",
}

describe("RunModal", () => {
  it("renders as a labelled modal dialog", () => {
    render(<RunModal agent={agent} onClose={() => {}} />)
    expect(screen.getByRole("dialog", { name: "Spustit rohlik" })).toBeInTheDocument()
  })

  it("blocks launch when the target is not an absolute path", async () => {
    const onLaunch = vi.fn()
    render(<RunModal agent={agent} onClose={() => {}} onLaunch={onLaunch} />)
    await userEvent.type(screen.getByLabelText(/Zadání/), "ukliď")
    await userEvent.type(screen.getByLabelText(/Cílová složka/), "relative/path")
    await userEvent.click(screen.getByRole("button", { name: /Spustit agenta/ }))
    expect(onLaunch).not.toHaveBeenCalled()
    expect(await screen.findByText(/absolutní cestu/i)).toBeInTheDocument()
  })

  it("launches against the absolute path typed into the target-directory field", async () => {
    const onLaunch = vi.fn()
    render(<RunModal agent={agent} onClose={() => {}} onLaunch={onLaunch} />)
    await userEvent.type(screen.getByLabelText(/Zadání/), "ukliď")
    await userEvent.type(screen.getByLabelText(/Cílová složka/), "/Users/zibby/test")
    await userEvent.click(screen.getByRole("button", { name: /Spustit agenta/ }))
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "ukliď", files: ["/Users/zibby/test"] }),
    )
    expect(screen.getByText("Agent spuštěn na pozadí")).toBeInTheDocument()
  })

  it("closes from the close button", async () => {
    const onClose = vi.fn()
    render(<RunModal agent={agent} onClose={onClose} />)
    await userEvent.click(screen.getByRole("button", { name: "Zavřít" }))
    expect(onClose).toHaveBeenCalled()
  })
})
