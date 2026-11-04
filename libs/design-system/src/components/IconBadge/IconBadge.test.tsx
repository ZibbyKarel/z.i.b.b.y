import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { render } from "../../utils/testRender";
import { IconBadge, IconBadgeTestId } from "./IconBadge";

describe("IconBadge", () => {
  it("renders count with accessible name", () => {
    render(<IconBadge count={3} icon="chat" label="3 unresolved" />);
    const root = screen.getByTestId(IconBadgeTestId.Root);
    expect(root).toHaveRole("img");
    expect(root).toHaveAccessibleName("3 unresolved");
    expect(screen.getByTestId(IconBadgeTestId.Count)).toHaveTextContent("3");
  });

  it("caps at 99+", () => {
    render(<IconBadge count={120} icon="chat" label="120 unresolved" />);
    expect(screen.getByTestId(IconBadgeTestId.Count)).toHaveTextContent("99+");
  });

  it("renders nothing for 0", () => {
    render(<IconBadge count={0} icon="chat" label="none" />);
    expect(screen.queryByTestId(IconBadgeTestId.Root)).toBeNull();
  });
});
