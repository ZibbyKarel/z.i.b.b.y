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

  it("launches against a project with the composed request and shows confirmation", async () => {
    const onLaunch = vi.fn()
    render(
      <RunModal agent={agent} file={file} onClose={() => {}} onLaunch={onLaunch} projects={projects} />,
    )
    await userEvent.type(screen.getByLabelText(/Zadání/), "srovnej seriály")
    await userEvent.click(screen.getByRole("button", { name: /Spustit agenta/ }))
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "srovnej seriály", project: "media-vault", files: [] }),
    )
    expect(screen.getByText("Agent spuštěn na pozadí")).toBeInTheDocument()
  })

  it("launches against picked files when the target is switched to Soubory", async () => {
    const onLaunch = vi.fn()
    render(
      <RunModal agent={agent} file={file} onClose={() => {}} onLaunch={onLaunch} projects={projects} />,
    )
    await userEvent.type(screen.getByLabelText(/Zadání/), "ukliď")
    // Switch the target toggle from the project picker to the directory picker.
    await userEvent.click(screen.getByRole("radio", { name: "Soubory" }))
    const picked = new File(["x"], "list.md", { type: "text/markdown" })
    await userEvent.upload(screen.getByLabelText(/Složka/), picked)
    await userEvent.click(screen.getByRole("button", { name: /Spustit agenta/ }))
    expect(onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "ukliď", project: "", files: ["list.md"] }),
    )
  })

  it("closes from the close button", async () => {
    const onClose = vi.fn()
    render(<RunModal agent={agent} file={file} onClose={onClose} projects={projects} />)
    await userEvent.click(screen.getByRole("button", { name: "Zavřít" }))
    expect(onClose).toHaveBeenCalled()
  })
})
