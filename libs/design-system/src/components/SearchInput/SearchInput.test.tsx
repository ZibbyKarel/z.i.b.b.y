import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { SearchInput, SearchInputTestId } from "./SearchInput";

describe("SearchInput", () => {
  it("renders an editable text input with the accessible name", () => {
    render(<SearchInput ariaLabel="Search the archive" onChange={() => {}} value="" />);
    const control = screen.getByTestId(SearchInputTestId.Control);
    expect(control).toHaveRole("textbox");
    expect(control).toHaveAccessibleName("Search the archive");
  });

  it("shows the placeholder", () => {
    render(
      <SearchInput
        ariaLabel="Search"
        onChange={() => {}}
        placeholder="Search the archive…"
        value=""
      />,
    );
    expect(screen.getByTestId(SearchInputTestId.Control)).toHaveAttribute(
      "placeholder",
      "Search the archive…",
    );
  });

  it("calls onChange with the typed value", async () => {
    const onChange = vi.fn();
    function Controlled() {
      return <SearchInput ariaLabel="Search" onChange={onChange} value="" />;
    }
    render(<Controlled />);
    await userEvent.type(screen.getByTestId(SearchInputTestId.Control), "x");
    expect(onChange).toHaveBeenCalled();
  });

  it("forwards a ref", () => {
    let node: HTMLInputElement | null = null;
    render(
      <SearchInput
        ariaLabel="Search"
        onChange={() => {}}
        ref={(el) => {
          node = el;
        }}
        value=""
      />,
    );
    expect(node).not.toBeNull();
  });

  it("renders the leading search icon", () => {
    render(<SearchInput ariaLabel="Search" onChange={() => {}} value="" />);
    expect(screen.getByTestId(SearchInputTestId.Icon)).toBeInTheDocument();
  });
});
