import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { Checkbox, CheckboxTestId } from "./Checkbox";

describe("Checkbox", () => {
  it("exposes a checkbox role with the label as its accessible name", () => {
    render(<Checkbox checked={false} label="Notify" onChange={() => {}} />);
    const el = screen.getByTestId(CheckboxTestId.Root);
    expect(el).toHaveRole("checkbox");
    expect(el).toHaveAccessibleName("Notify");
    expect(el).toHaveAttribute("aria-checked", "false");
  });

  it("reflects the checked state via aria-checked", () => {
    render(<Checkbox checked label="On" onChange={() => {}} />);
    expect(screen.getByTestId(CheckboxTestId.Root)).toHaveAttribute("aria-checked", "true");
  });

  it("calls onChange with the toggled value on click", async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} label="Pick" onChange={onChange} />);
    await userEvent.click(screen.getByTestId(CheckboxTestId.Root));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not fire onChange when disabled", async () => {
    const onChange = vi.fn();
    render(<Checkbox disabled checked={false} label="Pick" onChange={onChange} />);
    const el = screen.getByTestId(CheckboxTestId.Root);
    expect(el).toBeDisabled();
    await userEvent.click(el);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders presentationally with no interactive semantics", () => {
    render(<Checkbox checked presentational data-testid="embedded" />);
    const el = screen.getByTestId("embedded");
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.tagName).toBe("SPAN");
    // The visual box still reflects state.
    expect(screen.getByTestId(CheckboxTestId.Box)).toBeInTheDocument();
  });

  it("accepts a ref as a regular prop (React 19)", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Checkbox checked label="r" onChange={() => {}} ref={ref} />);
    expect(ref.current).toBe(screen.getByTestId(CheckboxTestId.Root));
  });
});
