import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleChip, ToggleChipTestId } from "./ToggleChip";

describe("ToggleChip", () => {
  it("reflects pressed via aria-pressed", () => {
    const { rerender } = render(<ToggleChip pressed>ALL</ToggleChip>);
    const root = screen.getByTestId(ToggleChipTestId.Root);
    expect(root).toHaveAttribute("aria-pressed", "true");
    expect(root).toHaveClass("border-foreground");
    rerender(<ToggleChip pressed={false}>ALL</ToggleChip>);
    expect(root).toHaveAttribute("aria-pressed", "false");
    expect(root).toHaveClass("border-border-strong");
  });

  it("renders the leading slot only when given", () => {
    const { rerender } = render(<ToggleChip pressed={false}>A</ToggleChip>);
    expect(screen.queryByTestId(ToggleChipTestId.Leading)).toBeNull();
    rerender(
      <ToggleChip leading="g" pressed={false}>
        A
      </ToggleChip>,
    );
    expect(screen.getByTestId(ToggleChipTestId.Leading)).toHaveTextContent("g");
  });

  it("fires onClick and forwards ref", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <ToggleChip onClick={onClick} pressed={false} ref={ref}>
        A
      </ToggleChip>,
    );
    fireEvent.click(screen.getByTestId(ToggleChipTestId.Root));
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(screen.getByTestId(ToggleChipTestId.Root));
  });
});
