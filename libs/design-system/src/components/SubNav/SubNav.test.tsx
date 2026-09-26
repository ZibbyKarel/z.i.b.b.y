import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { SubNav, SubNavTestId } from "./SubNav";

const items = [
  { href: "/departments/dev/overview", label: "Overview", active: true },
  { href: "/departments/dev/team", label: "Team", active: false },
  { href: "/departments/dev/pipelines", label: "Pipelines", active: false },
];

describe("SubNav", () => {
  it("renders one link per item as plain anchors by default", () => {
    render(<SubNav items={items} />);
    for (const item of items) {
      const link = screen.getByTestId(`${SubNavTestId.Item}-${item.href}`);
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", item.href);
      expect(link).toHaveTextContent(item.label);
    }
  });

  it("marks the active item with aria-current=page and the rest without it", () => {
    render(<SubNav items={items} />);
    expect(screen.getByTestId(`${SubNavTestId.Item}-/departments/dev/overview`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId(`${SubNavTestId.Item}-/departments/dev/team`)).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders the nav landmark", () => {
    render(<SubNav items={items} />);
    expect(screen.getByTestId(SubNavTestId.List)).toHaveRole("navigation");
  });

  it("renders the actions slot when provided", () => {
    render(<SubNav actions={<button>+ New task</button>} items={items} />);
    expect(screen.getByTestId(SubNavTestId.Actions)).toHaveTextContent("+ New task");
  });

  it("omits the actions slot when not provided", () => {
    render(<SubNav items={items} />);
    expect(screen.queryByTestId(SubNavTestId.Actions)).toBeNull();
  });

  it("orientation=responsive still renders every item and preserves the active link", () => {
    render(<SubNav items={items} orientation="responsive" />);
    for (const item of items) {
      expect(screen.getByTestId(`${SubNavTestId.Item}-${item.href}`)).toHaveTextContent(item.label);
    }
    expect(screen.getByTestId(`${SubNavTestId.Item}-/departments/dev/overview`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("orientation=responsive reflows to a left column at the lg breakpoint", () => {
    render(<SubNav items={items} orientation="responsive" />);
    expect(screen.getByTestId(SubNavTestId.List).className).toMatch(/lg:flex-col/);
  });

  it("renders through a custom linkComponent (e.g. next/link) instead of a plain anchor", () => {
    function FakeLink({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) {
      return (
        <a data-fake-link href={href} {...rest}>
          {children}
        </a>
      );
    }
    render(<SubNav items={items} linkComponent={FakeLink} />);
    const link = screen.getByTestId(`${SubNavTestId.Item}-/departments/dev/overview`);
    expect(link).toHaveAttribute("data-fake-link");
  });
});
