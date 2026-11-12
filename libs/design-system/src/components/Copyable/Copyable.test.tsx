import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Copyable, CopyableTestId } from "./Copyable";

describe("Copyable", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("wraps arbitrary children and labels the copy button", () => {
    render(
      <Copyable copyLabel="Copy branch" text="feat/x">
        <a href="/x">feat/x link</a>
      </Copyable>,
    );
    expect(screen.getByTestId(CopyableTestId.Root)).toHaveTextContent("feat/x link");
    expect(screen.getByTestId(CopyableTestId.Copy)).toHaveAccessibleName("Copy branch");
  });

  it("falls back to the text when no children are given", () => {
    render(<Copyable text="main" />);
    expect(screen.getByTestId(CopyableTestId.Root)).toHaveTextContent("main");
  });

  it("copies `text`, not the rendered children", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(
      <Copyable text="#42">
        <span>PR 42</span>
      </Copyable>,
    );
    await userEvent.click(screen.getByTestId(CopyableTestId.Copy));
    expect(writeText).toHaveBeenCalledWith("#42");
  });

  it("shows and announces the copied state, then resets after ~1.5 s", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    render(<Copyable copiedLabel="Zkopírováno" text="x" />);
    const status = screen.getByTestId(CopyableTestId.Status);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toBeEmptyDOMElement();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await userEvent.click(screen.getByTestId(CopyableTestId.Copy));
      expect(status).toHaveTextContent("Zkopírováno");
      act(() => vi.advanceTimersByTime(1600));
      expect(status).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a failure state when the clipboard rejects or is missing", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const { unmount } = render(<Copyable copyFailedLabel="Nelze zkopírovat" text="x" />);
    await userEvent.click(screen.getByTestId(CopyableTestId.Copy));
    expect(screen.getByTestId(CopyableTestId.Status)).toHaveTextContent("Nelze zkopírovat");
    unmount();
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    render(<Copyable text="x" />);
    await userEvent.click(screen.getByTestId(CopyableTestId.Copy));
    expect(screen.getByTestId(CopyableTestId.Status)).toHaveTextContent("Copy failed");
  });
});
