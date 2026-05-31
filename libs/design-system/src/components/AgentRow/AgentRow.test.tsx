import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { RunningAgent } from "../../domain"
import { AgentRow } from "./AgentRow"

const agent: RunningAgent = {
  id: "a1",
  skill: "tmdb-renamer",
  ctx: "home",
  prompt: "Srovnej /media/downloads/seriály",
  state: "running",
  pct: 72,
  started: "3m",
  project: "media-vault",
}

describe("AgentRow", () => {
  it("renders skill, project and progress", () => {
    render(<AgentRow agent={agent} />)
    expect(screen.getByText("tmdb-renamer")).toBeInTheDocument()
    expect(screen.getByText("· media-vault")).toBeInTheDocument()
    expect(screen.getByText("72%")).toBeInTheDocument()
  })

  it("stops the agent", async () => {
    const onStop = vi.fn()
    render(<AgentRow agent={agent} onStop={onStop} />)
    await userEvent.click(screen.getByRole("button", { name: /Zastavit/ }))
    expect(onStop).toHaveBeenCalledWith(agent)
  })
})
