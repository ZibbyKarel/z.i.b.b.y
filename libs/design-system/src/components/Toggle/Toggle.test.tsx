import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toggle, ToggleTestId } from "./Toggle";

describe("Toggle", () => {
  it("exposes a switch role with the label as its accessible name", () => {
    render(<Toggle checked={false} label="Caffeinate" onChange={() => {}} />);
    const el = screen.getByTestId(ToggleTestId.Root);
    expect(el).toHaveRole("switch");
    expect(el).toHaveAccessibleName("Caffeinate");
    expect(el).toHaveAttribute("aria-checked", "false");
  });

  it("reflects the checked state via aria-checked", () => {
    render(<Toggle checked label="On" onChange={() => {}} />);
    expect(screen.getByTestId(ToggleTestId.Root)).toHaveAttribute("aria-checked", "true");
  });

  it("calls onChange with the toggled value on click", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Toggle" onChange={onChange} />);
    await userEvent.click(screen.getByTestId(ToggleTestId.Root));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire onChange when disabled", async () => {
    const onChange = vi.fn();
    render(<Toggle disabled checked={false} label="Toggle" onChange={onChange} />);
    const el = screen.getByTestId(ToggleTestId.Root);
    expect(el).toBeDisabled();
    await userEvent.click(el);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a ref as a regular prop (React 19)", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Toggle checked label="r" onChange={() => {}} ref={ref} />);
    expect(ref.current).toBe(screen.getByTestId(ToggleTestId.Root));
  });
});
