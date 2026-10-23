import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconTileTestId } from "../IconTile/IconTile";
import { AgentBadge, AgentBadgeTestId } from "./AgentBadge";

describe("AgentBadge", () => {
  it("fills the tile with the agent colour, no state frame and no label by default", () => {
    render(<AgentBadge color="#5b8def" glyph="code" />);
    expect(screen.getByTestId(IconTileTestId.Root).style.backgroundColor).toBe("rgb(91, 141, 239)");
    expect(screen.queryByTestId(AgentBadgeTestId.State)).toBeNull();
    expect(screen.queryByTestId(AgentBadgeTestId.Label)).toBeNull();
  });

  it("frames the tile in the state colour and shows the label when given", () => {
    render(<AgentBadge label="Architect" state="working" />);
    const frame = screen.getByTestId(AgentBadgeTestId.State);
    expect(frame).toHaveAttribute("data-state", "working");
    expect(frame).toHaveClass("ring-run");
    expect(screen.getByTestId(AgentBadgeTestId.Label)).toHaveTextContent("Architect");
  });

  it("normalizes a legacy state and only animates the frame with pulse", () => {
    const { rerender } = render(<AgentBadge state="run" />);
    const frame = screen.getByTestId(AgentBadgeTestId.State);
    expect(frame).toHaveAttribute("data-state", "working");
    expect(frame).not.toHaveClass("animate-zb-live");
    rerender(<AgentBadge pulse state="run" />);
    expect(screen.getByTestId(AgentBadgeTestId.State)).toHaveClass("animate-zb-live");
  });
});
