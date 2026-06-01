import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Alert } from "./Alert";

describe("Alert", () => {
  it("renders its message", () => {
    render(<Alert>Hotovo</Alert>);
    expect(screen.getByText("Hotovo")).toBeInTheDocument();
  });

  it("has role=alert", () => {
    render(<Alert>Zpráva</Alert>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders a title when provided", () => {
    render(<Alert title="Pozor">Detail</Alert>);
    expect(screen.getByText("Pozor")).toBeInTheDocument();
  });

  it("calls onClose when the dismiss button is clicked", async () => {
    const onClose = vi.fn();
    render(<Alert onClose={onClose}>Zpráva</Alert>);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits the close button when onClose is absent", () => {
    render(<Alert>Zpráva</Alert>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
