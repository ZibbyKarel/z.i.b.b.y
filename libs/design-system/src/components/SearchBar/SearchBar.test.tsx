import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { SearchBar, SearchBarTestId } from "./SearchBar";

describe("SearchBar", () => {
  it("renders as a button with the accessible name and placeholder", () => {
    render(<SearchBar ariaLabel="Command or skill" placeholder="Command or skill…" />);
    const root = screen.getByTestId(SearchBarTestId.Root);
    expect(root).toHaveRole("button");
    expect(root).toHaveAccessibleName("Command or skill");
    expect(screen.getByTestId(SearchBarTestId.Placeholder)).toHaveTextContent("Command or skill…");
  });

  it("renders the shortcut hint when provided", () => {
    render(<SearchBar ariaLabel="Command" placeholder="Command…" shortcut="⌘K" />);
    expect(screen.getByTestId(SearchBarTestId.Shortcut)).toHaveTextContent("⌘K");
  });

  it("omits the shortcut hint when not provided", () => {
    render(<SearchBar ariaLabel="Command" placeholder="Command…" />);
    expect(screen.queryByTestId(SearchBarTestId.Shortcut)).not.toBeInTheDocument();
  });

  it("calls onClick when activated", async () => {
    const onClick = vi.fn();
    render(<SearchBar ariaLabel="Command" onClick={onClick} placeholder="Command…" />);
    await userEvent.click(screen.getByTestId(SearchBarTestId.Root));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("forwards a ref", () => {
    let node: HTMLButtonElement | null = null;
    render(
      <SearchBar
        ariaLabel="Command"
        placeholder="Command…"
        ref={(el) => {
          node = el;
        }}
      />,
    );
    expect(node).not.toBeNull();
  });

  it("keeps an opaque fill by default", () => {
    render(<SearchBar ariaLabel="Command" placeholder="Command…" />);
    expect(screen.getByTestId(SearchBarTestId.Root)).toHaveClass("bg-background");
  });

  it("drops the opaque fill in the transparent surface so glass shows through", () => {
    render(<SearchBar ariaLabel="Command" placeholder="Command…" surface="transparent" />);
    const root = screen.getByTestId(SearchBarTestId.Root);
    expect(root).toHaveClass("bg-transparent");
    expect(root).not.toHaveClass("bg-background");
  });
});
