import { describe, expect, it } from "vitest";
import { BreadcrumbTestId } from "@zibby/design-system";
import { render, screen, within } from "@testing-library/react";
import { PageBreadcrumb, PageBreadcrumbSlotProvider } from "./PageBreadcrumb";

const items = [{ label: "Projects", href: "/work/projects" }, { label: "CMS4" }];

function setup(activeHref: string, crumbs = items) {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  const view = render(
    <PageBreadcrumbSlotProvider activeHref={activeHref} element={slot}>
      <div data-testid="inline">
        <PageBreadcrumb items={crumbs} />
      </div>
    </PageBreadcrumbSlotProvider>,
  );
  return { slot, ...view };
}

describe("PageBreadcrumb", () => {
  it("renders inline without a provider", () => {
    render(<PageBreadcrumb items={items} />);
    expect(screen.getByTestId(BreadcrumbTestId.Root)).toBeInTheDocument();
  });

  it("portals into the slot and drops the crumb matching the active href", () => {
    const { slot } = setup("/work/projects");
    expect(within(slot).getByText("CMS4")).toBeInTheDocument();
    expect(within(slot).queryByText("Projects")).toBeNull();
    expect(within(slot).getByTestId(`${BreadcrumbTestId.Separator}-0`)).toBeInTheDocument();
    expect(within(screen.getByTestId("inline")).queryByTestId(BreadcrumbTestId.Root)).toBeNull();
  });

  it("keeps all crumbs when the first href is not the active one", () => {
    const { slot } = setup("/org");
    expect(within(slot).getByText("Projects")).toBeInTheDocument();
    expect(within(slot).getByText("CMS4")).toBeInTheDocument();
  });

  it("renders nothing when the only crumb is dropped", () => {
    const { slot } = setup("/work/projects", [items[0]!]);
    expect(slot).toBeEmptyDOMElement();
  });
});
