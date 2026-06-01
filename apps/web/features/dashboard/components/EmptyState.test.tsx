import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { EmptyState } from "./EmptyState"

describe("EmptyState", () => {
  it("renders title, description and hint", () => {
    render(
      <EmptyState
        description="Vytvoř první SKILL.md."
        glyph="spark"
        hint="~/zibby/skills/"
        title="Zatím žádné skilly"
      />,
    )
    expect(screen.getByText("Zatím žádné skilly")).toBeInTheDocument()
    expect(screen.getByText("Vytvoř první SKILL.md.")).toBeInTheDocument()
    expect(screen.getByText("~/zibby/skills/")).toBeInTheDocument()
  })

  it("fires the action", async () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        actionLabel="+ Přidat skill"
        description="y"
        glyph="spark"
        onAction={onAction}
        title="x"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Přidat skill/ }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it("omits the action button when no label is given", () => {
    render(<EmptyState description="y" glyph="spark" title="x" />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
