import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatComposer, ChatComposerTestId } from "./ChatComposer";

describe("ChatComposer", () => {
  it("sends trimmed text on Enter and clears the field", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatComposer onSend={onSend} />);

    const input = screen.getByTestId(ChatComposerTestId.Input);
    await user.type(input, "  hello  ");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input).toHaveValue("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatComposer onSend={onSend} />);

    const input = screen.getByTestId(ChatComposerTestId.Input);
    await user.type(input, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(input, "line two");

    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("line one\nline two");
  });

  it("does not send empty / whitespace-only input", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatComposer onSend={onSend} />);

    await user.click(screen.getByTestId(ChatComposerTestId.Input));
    await user.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends via the Send button", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ChatComposer onSend={onSend} />);

    await user.type(screen.getByTestId(ChatComposerTestId.Input), "click send");
    await user.click(screen.getByTestId(ChatComposerTestId.Send));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("click send");
  });

  it("disables input and send while a turn is in flight", () => {
    renderWithProviders(<ChatComposer disabled onSend={vi.fn()} />);
    expect(screen.getByTestId(ChatComposerTestId.Input)).toBeDisabled();
    expect(screen.getByTestId(ChatComposerTestId.Send)).toBeDisabled();
  });

  describe("onDraftChange", () => {
    it("fires true on the first character and false once the field clears", async () => {
      const onDraftChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ChatComposer onDraftChange={onDraftChange} onSend={vi.fn()} />);

      const input = screen.getByTestId(ChatComposerTestId.Input);
      await user.type(input, "h");
      expect(onDraftChange).toHaveBeenCalledTimes(1);
      expect(onDraftChange).toHaveBeenLastCalledWith(true);

      await user.clear(input);
      expect(onDraftChange).toHaveBeenCalledTimes(2);
      expect(onDraftChange).toHaveBeenLastCalledWith(false);
    });

    it("does not re-fire for every keystroke while the draft stays non-empty", async () => {
      const onDraftChange = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ChatComposer onDraftChange={onDraftChange} onSend={vi.fn()} />);

      await user.type(screen.getByTestId(ChatComposerTestId.Input), "hello there");
      expect(onDraftChange).toHaveBeenCalledTimes(1);
      expect(onDraftChange).toHaveBeenLastCalledWith(true);
    });

    it("fires false when the field clears on send", async () => {
      const onDraftChange = vi.fn();
      const onSend = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<ChatComposer onDraftChange={onDraftChange} onSend={onSend} />);

      const input = screen.getByTestId(ChatComposerTestId.Input);
      await user.type(input, "hello");
      expect(onDraftChange).toHaveBeenLastCalledWith(true);

      await user.keyboard("{Enter}");
      expect(onSend).toHaveBeenCalledWith("hello");
      expect(onDraftChange).toHaveBeenLastCalledWith(false);
      expect(onDraftChange).toHaveBeenCalledTimes(2);
    });
  });
});
