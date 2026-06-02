import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { Approval } from "../../../../domain"
import { ApprovalCard } from "./ApprovalCard"

const approval: Approval = {
  id: "ap1",
  skill: "rohlik",
  action: "Objednat košík",
  detail: "14 položek · 1 248 Kč",
  risk: "platba",
}

describe("ApprovalCard", () => {
  it("shows what the agent wants to do", () => {
    render(<ApprovalCard approval={approval} />)
    expect(screen.getByText("Čeká na tvé schválení")).toBeInTheDocument()
    expect(screen.getByText(/Objednat košík/)).toBeInTheDocument()
  })

  it("approves", async () => {
    const onApprove = vi.fn()
    render(<ApprovalCard approval={approval} onApprove={onApprove} />)
    await userEvent.click(screen.getByRole("button", { name: /Schválit/ }))
    expect(onApprove).toHaveBeenCalledWith(approval)
    expect(screen.getByText(/Schváleno/)).toBeInTheDocument()
  })

  it("rejects", async () => {
    const onReject = vi.fn()
    render(<ApprovalCard approval={approval} onReject={onReject} />)
    await userEvent.click(screen.getByRole("button", { name: /Zamítnout/ }))
    expect(onReject).toHaveBeenCalledWith(approval)
    expect(screen.getByText(/Zamítnuto/)).toBeInTheDocument()
  })
})
