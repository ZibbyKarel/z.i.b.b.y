import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Alert, AlertTestId } from "./Alert";

describe("Alert", () => {
  it("renders its message", () => {
    render(<Alert>Hotovo</Alert>);
    expect(screen.getByTestId(AlertTestId.Root)).toHaveTextContent("Hotovo");
  });

  it("has role=status for the info severity (default)", () => {
    render(<Alert>Zpráva</Alert>);
    expect(screen.getByTestId(AlertTestId.Root)).toHaveRole("status");
  });

  it("has role=status for the ok severity", () => {
    render(<Alert severity="ok">Zpráva</Alert>);
    expect(screen.getByTestId(AlertTestId.Root)).toHaveRole("status");
  });

  it("has role=alert for the warn severity", () => {
    render(<Alert severity="warn">Zpráva</Alert>);
    expect(screen.getByTestId(AlertTestId.Root)).toHaveRole("alert");
  });

  it("has role=alert for the error severity", () => {
    render(<Alert severity="error">Zpráva</Alert>);
    expect(screen.getByTestId(AlertTestId.Root)).toHaveRole("alert");
  });

  it("renders a title when provided", () => {
    render(<Alert title="Pozor">Detail</Alert>);
    expect(screen.getByTestId(AlertTestId.Title)).toHaveTextContent("Pozor");
  });

  it("calls onClose when the dismiss button is clicked", async () => {
    const onClose = vi.fn();
    render(<Alert onClose={onClose}>Zpráva</Alert>);
    const close = screen.getByTestId(AlertTestId.CloseButton);
    expect(close).toHaveAccessibleName("Dismiss");
    await userEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits the close button when onClose is absent", () => {
    render(<Alert>Zpráva</Alert>);
    expect(screen.queryByTestId(AlertTestId.CloseButton)).toBeNull();
  });
});
