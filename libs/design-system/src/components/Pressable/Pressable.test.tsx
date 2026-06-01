import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Pressable } from "./Pressable"

describe("Pressable", () => {
  it("renders an accessible button with its content", () => {
    render(<Pressable aria-label="změnit">badge</Pressable>)
    expect(screen.getByRole("button", { name: "změnit" })).toHaveTextContent("badge")
  })

  it("fires onClick", async () => {
    const onClick = vi.fn()
    render(<Pressable onClick={onClick}>x</Pressable>)
    await userEvent.click(screen.getByRole("button"))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
