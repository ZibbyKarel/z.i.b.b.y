import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { SheetTestId } from "../Sheet/Sheet";
import type { SubNavLinkComponent } from "../SubNav/SubNav";
import { MobileMenu, type MobileMenuSection, MobileMenuTestId } from "./MobileMenu";

const sections: MobileMenuSection[] = [
  {
    id: "work",
    label: "Work",
    href: "/work",
    active: true,
    items: [
      { href: "/work/tasks", label: "Tasks", active: true },
      { href: "/work/runs", label: "Runs" },
    ],
  },
  { id: "system", label: "System", href: "/system", items: [{ href: "/system/a", label: "A" }] },
  { id: "home", label: "Home", href: "/home", items: [] },
];

// A real anchor would make jsdom try to navigate.
const NoNavLink: SubNavLinkComponent = ({ onClick, ...rest }) => (
  <a
    {...rest}
    onClick={(e) => {
      e.preventDefault();
      onClick?.(e);
    }}
  />
);

const open = async () => {
  const user = userEvent.setup();
  render(
    <MobileMenu closeLabel="Zavřít" label="Menu" linkComponent={NoNavLink} sections={sections} />,
  );
  await user.click(screen.getByTestId(MobileMenuTestId.Trigger));
  return user;
};

describe("MobileMenu", () => {
  it("is closed until the hamburger is pressed", async () => {
    render(<MobileMenu sections={sections} />);
    const trigger = screen.getByTestId(MobileMenuTestId.Trigger);
    expect(trigger).toHaveAccessibleName("Menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(SheetTestId.Root)).toBeNull();
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(SheetTestId.Root)).toHaveAttribute("data-side", "left");
  });

  it("expands the active section only and marks the active item", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Work" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByTestId(`${MobileMenuTestId.Item}-/work/tasks`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId(`${MobileMenuTestId.Item}-/work/runs`)).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.queryByTestId(`${MobileMenuTestId.Item}-/system/a`)).toBeNull();
  });

  it("expands and collapses a section", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByTestId(`${MobileMenuTestId.Item}-/system/a`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.queryByTestId(`${MobileMenuTestId.Item}-/work/tasks`)).toBeNull();
  });

  it("renders a section without items as a plain link", async () => {
    await open();
    const link = screen.getByRole("link", { name: "Home" });
    expect(link).toHaveAttribute("href", "/home");
  });

  it("closes the sheet when a link is followed", async () => {
    const user = await open();
    await user.click(screen.getByTestId(`${MobileMenuTestId.Item}-/work/runs`));
    expect(screen.queryByTestId(SheetTestId.Root)).toBeNull();
  });

  it("closes with the close button", async () => {
    const user = await open();
    await user.click(screen.getByTestId(SheetTestId.CloseButton));
    expect(screen.queryByTestId(SheetTestId.Root)).toBeNull();
  });
});
