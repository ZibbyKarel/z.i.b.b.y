import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ContextSwitch } from "./ContextSwitch"

describe("ContextSwitch", () => {
  it("marks the active context as pressed", () => {
    render(<ContextSwitch context="home" onContextChange={() => {}} />)
    expect(screen.getByRole("button", { name: /home/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: /work/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("switches context on click", async () => {
    const onChange = vi.fn()
    render(<ContextSwitch context="home" onContextChange={onChange} />)
    await userEvent.click(screen.getByRole("button", { name: /work/ }))
    expect(onChange).toHaveBeenCalledWith("work")
  })

  it("exposes an add-context affordance", async () => {
    const onAdd = vi.fn()
    render(
      <ContextSwitch context="home" onContextChange={() => {}} onAddContext={onAdd} />,
    )
    await userEvent.click(screen.getByRole("button", { name: "Přidat kontext" }))
    expect(onAdd).toHaveBeenCalledOnce()
  })
})
