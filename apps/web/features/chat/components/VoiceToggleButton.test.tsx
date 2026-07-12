import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { VoiceToggleButton, VoiceToggleButtonTestId } from "./VoiceToggleButton";

describe("VoiceToggleButton", () => {
  it("renders the off state with the start label and unpressed", () => {
    renderWithProviders(<VoiceToggleButton active={false} onToggle={vi.fn()} />);
    const btn = screen.getByTestId(VoiceToggleButtonTestId.Root);
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAccessibleName("Zapnout hlasový režim");
  });

  it("renders the on state with the stop label and pressed", () => {
    renderWithProviders(<VoiceToggleButton active onToggle={vi.fn()} />);
    const btn = screen.getByTestId(VoiceToggleButtonTestId.Root);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveAccessibleName("Vypnout hlasový režim");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    renderWithProviders(<VoiceToggleButton active={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByTestId(VoiceToggleButtonTestId.Root));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
