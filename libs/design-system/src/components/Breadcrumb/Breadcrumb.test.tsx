import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { Breadcrumb, BreadcrumbTestId } from "./Breadcrumb";

const items = [
  { label: "Departments", href: "/departments" },
  { label: "Development", href: "/departments/dev" },
  { label: "APR-142" },
];

describe("Breadcrumb", () => {
  it("renders every crumb's label", () => {
    render(<Breadcrumb items={items} />);
    for (const item of items) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it("renders items with an href as links, except the last one", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByTestId(`${BreadcrumbTestId.Item}-0`).tagName).toBe("A");
    expect(screen.getByTestId(`${BreadcrumbTestId.Item}-0`)).toHaveAttribute(
      "href",
      "/departments",
    );
    expect(screen.getByTestId(`${BreadcrumbTestId.Item}-1`).tagName).toBe("A");
  });

  it("renders the last crumb as plain text with aria-current=page", () => {
    render(<Breadcrumb items={items} />);
    const current = screen.getByTestId(BreadcrumbTestId.Current);
    expect(current).toHaveTextContent("APR-142");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.tagName).not.toBe("A");
  });

  it("renders a non-last item without href as plain text too", () => {
    render(<Breadcrumb items={[{ label: "Root" }, { label: "Leaf" }]} />);
    const root = screen.getByTestId(`${BreadcrumbTestId.Item}-0`);
    expect(root.tagName).not.toBe("A");
    expect(root).not.toHaveAttribute("aria-current");
  });

  it("renders the nav landmark with an accessible name", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByTestId(BreadcrumbTestId.Root)).toHaveRole("navigation");
    expect(screen.getByTestId(BreadcrumbTestId.Root)).toHaveAccessibleName("Breadcrumb");
  });

  it("renders a separator between crumbs but not before the first one", () => {
    render(<Breadcrumb items={items} />);
    expect(screen.queryByTestId(`${BreadcrumbTestId.Separator}-0`)).toBeNull();
    expect(screen.getByTestId(`${BreadcrumbTestId.Separator}-1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${BreadcrumbTestId.Separator}-2`)).toBeInTheDocument();
  });

  it("renders through a custom linkComponent instead of a plain anchor", () => {
    function FakeLink({ href, children, ...rest }: React.ComponentProps<"a"> & { href: string }) {
      return (
        <a data-fake-link href={href} {...rest}>
          {children}
        </a>
      );
    }
    render(<Breadcrumb items={items} linkComponent={FakeLink} />);
    expect(screen.getByTestId(`${BreadcrumbTestId.Item}-0`)).toHaveAttribute("data-fake-link");
  });
});
