import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { EmptyState } from "./EmptyState"

describe("EmptyState", () => {
  it("renders title, description and hint", () => {
    render(
      <EmptyState
        glyph="spark"
        title="Zatím žádné skilly"
        description="Vytvoř první SKILL.md."
        hint="~/zibby/skills/"
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
        glyph="spark"
        title="x"
        description="y"
        actionLabel="+ Přidat skill"
        onAction={onAction}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /Přidat skill/ }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it("omits the action button when no label is given", () => {
    render(<EmptyState glyph="spark" title="x" description="y" />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
