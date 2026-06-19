import { renderWithProviders as render, screen } from "../../../../test/render";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Approval } from "../../../../domain";
import { ApprovalCard } from "./ApprovalCard";

const approval: Approval = {
  id: "ap1",
  skill: "rohlik",
  action: "Objednat košík",
  detail: "14 položek · 1 248 Kč",
  risk: "platba",
};

/**
 * Drives the HoldButton's rAF-based hold loop deterministically: the first
 * scheduled frame runs synchronously `frameTime` ms after the hold started
 * (see the HoldButton's own tests for the same harness).
 */
function mockFrames(frameTime: number) {
  let now = 0;
  let firstFrame = true;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    if (firstFrame) {
      firstFrame = false;
      now = frameTime;
      cb(now);
    }
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
}

describe("ApprovalCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows what the agent wants to do", () => {
    render(<ApprovalCard approval={approval} />);
    expect(screen.getByText("Čeká na tvé schválení")).toBeInTheDocument();
    expect(screen.getByText(/Objednat košík/)).toBeInTheDocument();
  });

  it("approves a payment via the hold-to-confirm guardrail", () => {
    mockFrames(1000);
    const onApprove = vi.fn();
    render(<ApprovalCard approval={approval} onApprove={onApprove} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Podržet pro schválení" }));
    expect(onApprove).toHaveBeenCalledWith(approval);
    expect(screen.getByText(/Schváleno/)).toBeInTheDocument();
  });

  it("approves a low-risk action with a plain click", async () => {
    const onApprove = vi.fn();
    render(<ApprovalCard approval={{ ...approval, risk: "low" }} onApprove={onApprove} />);
    await userEvent.click(screen.getByRole("button", { name: /Schválit/ }));
    expect(onApprove).toHaveBeenCalledWith({ ...approval, risk: "low" });
    expect(screen.getByText(/Schváleno/)).toBeInTheDocument();
  });

  it("rejects", async () => {
    const onReject = vi.fn();
    render(<ApprovalCard approval={approval} onReject={onReject} />);
    await userEvent.click(screen.getByRole("button", { name: /Zamítnout/ }));
    expect(onReject).toHaveBeenCalledWith(approval);
    expect(screen.getByText(/Zamítnuto/)).toBeInTheDocument();
  });
});
