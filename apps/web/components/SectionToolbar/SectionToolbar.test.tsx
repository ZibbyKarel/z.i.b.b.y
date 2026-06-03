import userEvent from "@testing-library/user-event"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SectionToolbar } from "./SectionToolbar"

describe("SectionToolbar", () => {
  it("renders the section label", () => {
    render(<SectionToolbar label="moje skilly" />)
    expect(screen.getByText("moje skilly")).toBeInTheDocument()
  })

  it("renders an add button and fires onAdd", async () => {
    const onAdd = vi.fn()
    render(
      <SectionToolbar addLabel="Přidat skill" label="skilly" onAdd={onAdd} />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Přidat skill/ }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it("omits the button when no addLabel is given", () => {
    render(<SectionToolbar label="skilly" />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
