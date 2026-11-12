import { render, screen } from "@testing-library/react";
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
});
