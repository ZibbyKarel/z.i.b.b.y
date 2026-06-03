import { render, screen } from "@testing-library/react"
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

const file = "~/zibby/skills/rohlik/SKILL.md"
const projects = ["media-vault", "home-ops"]

describe("RunModal", () => {
  it("renders as a labelled modal dialog", () => {
    render(<RunModal agent={agent} file={file} onClose={() => {}} projects={projects} />)
    expect(screen.getByRole("dialog", { name: "Spustit rohlik" })).toBeInTheDocument()
  })

  it("launches with the composed request and shows confirmation", async () => {
    const onLaunch = vi.fn()
    render(
      <RunModal agent={agent} file={file} onClose={() => {}} onLaunch={onLaunch} projects={projects} />,
    )
    await userEvent.type(screen.getByLabelText(/Zadání/), "srovnej seriály")
    await userEvent.click(screen.getByRole("button", { name: /Spustit agenta/ }))
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "srovnej seriály", project: "media-vault" }),
    )
    expect(screen.getByText("Agent spuštěn na pozadí")).toBeInTheDocument()
  })

  it("closes from the close button", async () => {
    const onClose = vi.fn()
    render(<RunModal agent={agent} file={file} onClose={onClose} projects={projects} />)
    await userEvent.click(screen.getByRole("button", { name: "Zavřít" }))
    expect(onClose).toHaveBeenCalled()
  })
})
