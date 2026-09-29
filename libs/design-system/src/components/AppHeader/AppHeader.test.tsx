import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../utils/testRender";
import { AgentGlyphTestId } from "../AgentGlyph/AgentGlyph";
import { AppHeader, AppHeaderTestId } from "./AppHeader";

describe("AppHeader", () => {
  it("renders the default Wordmark when no wordmark slot is given", () => {
    render(<AppHeader />);
    expect(screen.getByTestId(AppHeaderTestId.Wordmark)).toHaveTextContent("ZIBBYCORP");
  });

  it("renders a custom wordmark slot", () => {
    render(<AppHeader wordmark={<span>Custom mark</span>} />);
    expect(screen.getByTestId(AppHeaderTestId.Wordmark)).toHaveTextContent("Custom mark");
  });

  it("renders the nav slot content", () => {
    render(<AppHeader nav={<nav>Section nav</nav>} />);
    expect(screen.getByTestId(AppHeaderTestId.Nav)).toHaveTextContent("Section nav");
  });

  it("omits optional trailing slots when not provided", () => {
    render(<AppHeader />);
    expect(screen.queryByTestId(AppHeaderTestId.Operator)).toBeNull();
    expect(screen.queryByTestId(AppHeaderTestId.ActiveCount)).toBeNull();
    expect(screen.queryByTestId(AppHeaderTestId.Limits)).toBeNull();
    expect(screen.queryByTestId(AppHeaderTestId.Search)).toBeNull();
  });

  it("renders the operator/activeCount/limits slots when provided", () => {
    render(
      <AppHeader
        activeCount={<span>4 active</span>}
        limits={<span>5H 40%</span>}
        operator={<span>Karel</span>}
      />,
    );
    expect(screen.getByTestId(AppHeaderTestId.Operator)).toHaveTextContent("Karel");
    expect(screen.getByTestId(AppHeaderTestId.ActiveCount)).toHaveTextContent("4 active");
    expect(screen.getByTestId(AppHeaderTestId.Limits)).toHaveTextContent("5H 40%");
  });

  it("renders the search trigger with the ⌘K shortcut and fires onSearchClick", async () => {
    const onSearchClick = vi.fn();
    render(<AppHeader onSearchClick={onSearchClick} />);
    const trigger = screen.getByTestId(AppHeaderTestId.Search);
    expect(trigger).toHaveAccessibleName("Search");
    expect(screen.getByTestId(AppHeaderTestId.SearchShortcut)).toHaveTextContent("⌘K");
    trigger.click();
    expect(onSearchClick).toHaveBeenCalledOnce();
  });

  it("uses a custom searchLabel", () => {
    render(<AppHeader onSearchClick={() => {}} searchLabel="Search agents" />);
    expect(screen.getByTestId(AppHeaderTestId.Search)).toHaveAccessibleName("Search agents");
  });

  it("renders the wordmark inert (no link) when homeHref is omitted", () => {
    render(<AppHeader />);
    expect(screen.queryByTestId(AppHeaderTestId.HomeLink)).toBeNull();
  });

  it("renders the brand mark as a link to homeHref, with the glyph, when given", () => {
    render(<AppHeader homeHref="/org" />);
    const link = screen.getByTestId(AppHeaderTestId.HomeLink);
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/org");
    expect(link).toHaveAccessibleName("ZibbyCorp");
    expect(screen.getByTestId(AppHeaderTestId.HomeLink)).toContainElement(
      screen.getByTestId(AgentGlyphTestId.Root),
    );
  });

  it("renders the home link through a custom linkComponent", () => {
    function FakeLink({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) {
      return (
        <a data-fake-link href={href} {...rest}>
          {children}
        </a>
      );
    }
    render(<AppHeader homeHref="/org" linkComponent={FakeLink} />);
    expect(screen.getByTestId(AppHeaderTestId.HomeLink)).toHaveAttribute("data-fake-link");
  });

  it("uses a custom homeLabel", () => {
    render(<AppHeader homeHref="/org" homeLabel="Go home" />);
    expect(screen.getByTestId(AppHeaderTestId.HomeLink)).toHaveAccessibleName("Go home");
  });

  it("renders the header landmark", () => {
    render(<AppHeader />);
    expect(screen.getByTestId(AppHeaderTestId.Root)).toHaveRole("banner");
  });
});
