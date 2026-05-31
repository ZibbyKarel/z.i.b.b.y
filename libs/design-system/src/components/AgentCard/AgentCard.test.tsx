import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { AgentDef } from "../../domain"
import { AgentCard } from "./AgentCard"

const agent: AgentDef = {
  id: "architect",
  name: "Architekt",
  glyph: "compass",
  role: "Navrhne řešení a rozepíše plán do design.md",
  model: "opus",
  thinking: "high",
  tools: ["read", "web", "write"],
  ctx: "work",
  state: "idle",
  file: "~/zibby/agents/architect.agent.md",
}

describe("AgentCard", () => {
  it("renders name, role, model and tools", () => {
    render(<AgentCard agent={agent} />)
    expect(screen.getByText("Architekt")).toBeInTheDocument()
    expect(screen.getByText("opus")).toBeInTheDocument()
    expect(screen.getByText("read")).toBeInTheDocument()
  })

  it("edits", async () => {
    const onEdit = vi.fn()
    render(<AgentCard agent={agent} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole("button", { name: /Edit raw/ }))
    expect(onEdit).toHaveBeenCalledWith(agent)
  })
})
