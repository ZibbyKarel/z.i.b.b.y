import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DesignSystemProvider } from "../../DesignSystemContext/DesignSystemProvider";
import { Alert } from "./Alert";

function wrap(ui: React.ReactNode) {
  return render(<DesignSystemProvider theme="dark">{ui}</DesignSystemProvider>);
}

describe("Alert", () => {
  it("renders its message", () => {
    wrap(<Alert>Hotovo</Alert>);
    expect(screen.getByText("Hotovo")).toBeInTheDocument();
  });

  it("has role=alert", () => {
    wrap(<Alert>Zpráva</Alert>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders a title when provided", () => {
    wrap(<Alert title="Pozor">Detail</Alert>);
    expect(screen.getByText("Pozor")).toBeInTheDocument();
  });

  it("calls onClose when the dismiss button is clicked", async () => {
    const onClose = vi.fn();
    wrap(<Alert onClose={onClose}>Zpráva</Alert>);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits the close button when onClose is absent", () => {
    wrap(<Alert>Zpráva</Alert>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
