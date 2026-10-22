import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconTileTestId } from "../IconTile/IconTile";
import { StatusDotTestId } from "../StatusDot/StatusDot";
import { AgentBadge, AgentBadgeTestId } from "./AgentBadge";

describe("AgentBadge", () => {
  it("renders a tinted tile, no dot and no label by default", () => {
    render(<AgentBadge color="#5b8def" glyph="code" />);
    expect(screen.getByTestId(IconTileTestId.Root).style.color).toBe("rgb(91, 141, 239)");
    expect(screen.queryByTestId(AgentBadgeTestId.Dot)).toBeNull();
    expect(screen.queryByTestId(AgentBadgeTestId.Label)).toBeNull();
  });

  it("shows the state dot and the label when given", () => {
    render(<AgentBadge label="Architect" state="working" />);
    expect(screen.getByTestId(AgentBadgeTestId.Dot)).toContainElement(
      screen.getByTestId(StatusDotTestId.Root),
    );
    expect(screen.getByTestId(AgentBadgeTestId.Label)).toHaveTextContent("Architect");
  });
});
