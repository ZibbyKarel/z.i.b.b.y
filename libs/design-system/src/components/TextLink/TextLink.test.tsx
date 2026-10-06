import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { TextLink, TextLinkTestId } from "./TextLink";

describe("TextLink", () => {
  it("renders a plain anchor to the given href by default", () => {
    render(<TextLink href="/org/people">People</TextLink>);
    const link = screen.getByTestId(TextLinkTestId.Root);
    expect(link).toHaveRole("link");
    expect(link).toHaveAttribute("href", "/org/people");
    expect(link).toHaveAccessibleName("People");
  });

  it("renders through a custom linkComponent, forwarding className/data-testid", () => {
    function FakeLink({
      href,
      children,
      ...rest
    }: {
      href: string;
      children?: React.ReactNode;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
      return (
        <a data-fake-link href={href} {...rest}>
          {children}
        </a>
      );
    }
    render(
      <TextLink href="/org/people" linkComponent={FakeLink}>
        People
      </TextLink>,
    );
    const link = screen.getByTestId(TextLinkTestId.Root);
    expect(link).toHaveAttribute("data-fake-link");
    expect(link).toHaveAttribute("href", "/org/people");
  });

  it("accepts a custom data-testid", () => {
    render(
      <TextLink data-testid="pinned-rail-link" href="/org">
        Org
      </TextLink>,
    );
    expect(screen.getByTestId("pinned-rail-link")).toBeInTheDocument();
  });

  it("gets a visible focus ring via its own focus-visible outline class", () => {
    render(<TextLink href="/org">Org</TextLink>);
    expect(screen.getByTestId(TextLinkTestId.Root).className).toMatch(/focus-visible/);
  });
});
