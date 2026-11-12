import userEvent from "@testing-library/user-event";
import { DropdownTestId } from "@zibby/design-system";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import { AiEngineModelPicker, AiEngineModelPickerTestId } from "./AiEngineModelPicker";

const MODELS = [
  { id: "anthropic/claude-x", free: false, subscription: false },
  { id: "opencode/big-pickle", free: true, subscription: false },
  { id: "openai/gpt-y", free: false, subscription: false },
  { id: "opencode/other-free", free: true, subscription: false },
  { id: "claude-agent/sonnet", free: false, subscription: true },
];

describe("AiEngineModelPicker", () => {
  it("lists free models first and marks them free", async () => {
    render(<AiEngineModelPicker models={MODELS} onChange={vi.fn()} value="" />);
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    const labels = screen.getAllByTestId(DropdownTestId.Option).map((o) => o.textContent);
    expect(labels).toEqual([
      "opencode/big-pickle · zdarma",
      "opencode/other-free · zdarma",
      "claude-agent/sonnet · předplatné Claude",
      "anthropic/claude-x",
      "openai/gpt-y",
    ]);
  });

  it("reports the picked id", async () => {
    const onChange = vi.fn();
    render(<AiEngineModelPicker models={MODELS} onChange={onChange} value="" />);
    await userEvent.click(screen.getByTestId(DropdownTestId.Trigger));
    await userEvent.click(screen.getAllByTestId(DropdownTestId.Option)[0] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("opencode/big-pickle");
  });

  it("warns that a non-free choice may cost money, not a free one", () => {
    const { rerender } = render(
      <AiEngineModelPicker models={MODELS} onChange={vi.fn()} value="openai/gpt-y" />,
    );
    expect(screen.getByTestId(AiEngineModelPickerTestId.Notice)).toBeInTheDocument();
    rerender(
      <AiEngineModelPicker models={MODELS} onChange={vi.fn()} value="opencode/big-pickle" />,
    );
    expect(screen.queryByTestId(AiEngineModelPickerTestId.Notice)).not.toBeInTheDocument();
    rerender(
      <AiEngineModelPicker models={MODELS} onChange={vi.fn()} value="claude-agent/sonnet" />,
    );
    expect(screen.queryByTestId(AiEngineModelPickerTestId.Notice)).not.toBeInTheDocument();
  });

  it("flags a chosen model that vanished from the list, but not while loading", () => {
    const { rerender } = render(
      <AiEngineModelPicker models={MODELS} onChange={vi.fn()} value="gone/model" />,
    );
    expect(screen.getByTestId(AiEngineModelPickerTestId.Missing)).toBeInTheDocument();
    rerender(
      <AiEngineModelPicker loaded={false} models={[]} onChange={vi.fn()} value="gone/model" />,
    );
    expect(screen.queryByTestId(AiEngineModelPickerTestId.Missing)).not.toBeInTheDocument();
  });

  it("has explicit states for an empty catalog and for a list with nothing free", () => {
    const { rerender } = render(<AiEngineModelPicker models={[]} onChange={vi.fn()} value="" />);
    expect(screen.getByTestId(AiEngineModelPickerTestId.NoModels)).toBeInTheDocument();
    rerender(
      <AiEngineModelPicker
        models={[{ id: "openai/gpt-y", free: false, subscription: false }]}
        onChange={vi.fn()}
        value=""
      />,
    );
    expect(screen.queryByTestId(AiEngineModelPickerTestId.NoModels)).not.toBeInTheDocument();
    expect(screen.getByTestId(AiEngineModelPickerTestId.NoFree)).toBeInTheDocument();
  });
});
