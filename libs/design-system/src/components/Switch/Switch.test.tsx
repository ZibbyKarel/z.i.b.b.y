import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch, SwitchTestId } from "./Switch";

describe("Switch", () => {
  it("exposes a switch role with the label as its accessible name", () => {
    render(<Switch checked={false} label="Caffeinate" onChange={() => {}} />);
    const el = screen.getByTestId(SwitchTestId.Root);
    expect(el).toHaveRole("switch");
    expect(el).toHaveAccessibleName("Caffeinate");
    expect(el).toHaveAttribute("aria-checked", "false");
  });

  it("reflects the checked state via aria-checked", () => {
    render(<Switch checked label="On" onChange={() => {}} />);
    expect(screen.getByTestId(SwitchTestId.Root)).toHaveAttribute("aria-checked", "true");
  });

  it("calls onChange with the toggled value on click", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Toggle" onChange={onChange} />);
    await userEvent.click(screen.getByTestId(SwitchTestId.Root));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire onChange when disabled", async () => {
    const onChange = vi.fn();
    render(<Switch disabled checked={false} label="Toggle" onChange={onChange} />);
    const el = screen.getByTestId(SwitchTestId.Root);
    expect(el).toBeDisabled();
    await userEvent.click(el);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("accepts a ref as a regular prop (React 19)", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Switch checked label="r" onChange={() => {}} ref={ref} />);
    expect(ref.current).toBe(screen.getByTestId(SwitchTestId.Root));
  });
});
