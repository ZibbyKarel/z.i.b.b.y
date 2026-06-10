import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HudCard } from "./HudCard"

describe("HudCard", () => {
  it("renders the title and description", () => {
    render(<HudCard description="dělá věci" title="reviewer" />)
    expect(screen.getByText("reviewer")).toBeInTheDocument()
    expect(screen.getByText("dělá věci")).toBeInTheDocument()
  })

  it("renders the subtitle meta line and the header aside", () => {
    render(
      <HudCard
        aside={<span>připojeno</span>}
        subtitle="~/Projects/zibby"
        title="reviewer"
      />,
    )
    expect(screen.getByText("~/Projects/zibby")).toBeInTheDocument()
    expect(screen.getByText("připojeno")).toBeInTheDocument()
  })

  it("renders badge rows and skips empty rows", () => {
    render(
      <HudCard
        badges={[[<span key="a">sonnet</span>], [null, false]]}
        title="reviewer"
      />,
    )
    expect(screen.getByText("sonnet")).toBeInTheDocument()
  })

  it("renders footer actions", () => {
    render(<HudCard actions={<button>Spustit</button>} title="reviewer" />)
    expect(screen.getByRole("button", { name: "Spustit" })).toBeInTheDocument()
  })

  it("opens the body when onOpen is provided", () => {
    const onOpen = vi.fn()
    render(<HudCard onOpen={onOpen} openLabel="otevřít reviewer" title="reviewer" />)
    fireEvent.click(screen.getByRole("button", { name: "otevřít reviewer" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("toggles the pin with the next state", () => {
    const onPinChange = vi.fn()
    render(
      <HudCard
        onPinChange={onPinChange}
        pinLabel="připnout reviewer"
        pinned={false}
        title="reviewer"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "připnout reviewer" }))
    expect(onPinChange).toHaveBeenCalledWith(true)
  })

  it("hides the pin toggle without onPinChange", () => {
    render(<HudCard pinLabel="připnout reviewer" title="reviewer" />)
    expect(screen.queryByRole("button", { name: "připnout reviewer" })).toBeNull()
  })
})
