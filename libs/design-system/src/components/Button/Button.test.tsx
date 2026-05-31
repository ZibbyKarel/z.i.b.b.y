import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "./Button"

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Spustit</Button>)
    expect(screen.getByRole("button", { name: "Spustit" })).toBeInTheDocument()
  })

  it("fires onClick", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Spustit</Button>)
    await userEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("renders a leading icon", () => {
    const { container } = render(<Button icon="play">Spustit</Button>)
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("does not fire when disabled", async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Spustit
      </Button>,
    )
    await userEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("defaults to type=button", () => {
    render(<Button>Spustit</Button>)
    expect(screen.getByRole("button")).toHaveAttribute("type", "button")
  })

  it("forwards a ref", () => {
    let node: HTMLButtonElement | null = null
    render(
      <Button
        ref={(el) => {
          node = el
        }}
      >
        Spustit
      </Button>,
    )
    expect(node).toBeInstanceOf(HTMLButtonElement)
  })
})
