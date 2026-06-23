import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "../../../test/render";
import { ChatMarkdown } from "./ChatMarkdown";

describe("ChatMarkdown", () => {
  it("renders bold and italic as real emphasis elements, not literal markup", () => {
    const { container } = renderWithProviders(<ChatMarkdown text="a **bold** and _em_ word" />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("em");
    // The raw markers are gone from the visible text.
    expect(container.textContent).not.toContain("**");
  });

  it("renders a bullet list as list items", () => {
    const { container } = renderWithProviders(<ChatMarkdown text={"- one\n- two"} />);
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("one");
  });

  it("renders inline code in a code element", () => {
    const { container } = renderWithProviders(<ChatMarkdown text="run `pnpm test` now" />);
    expect(container.querySelector("code")).toHaveTextContent("pnpm test");
  });

  it("opens links in a new tab without leaking the referrer", () => {
    renderWithProviders(<ChatMarkdown text="[docs](https://example.com)" />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
