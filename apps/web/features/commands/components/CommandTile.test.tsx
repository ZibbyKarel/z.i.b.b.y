import { describe, expect, it, vi } from "vitest";
import { renderWithProviders as render, screen } from "../../../test/render";
import type { Command } from "@zibby/contracts";
import { CommandTile } from "./CommandTile";

const command: Command = {
  id: "orchestrate",
  description: "Run the delivery loop",
  enabled: true,
  instructions: "Do the thing with $ARGUMENTS",
};

describe("CommandTile", () => {
  it("shows the /<id> slash name and opens the editor when selectable", () => {
    const onSelect = vi.fn();
    render(
      <CommandTile command={command} onSelect={onSelect} selectLabel="Edit command orchestrate" />,
    );
    expect(screen.getByText("/orchestrate")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Edit command orchestrate" });
    btn.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders statically (no button) without onSelect", () => {
    render(<CommandTile command={command} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("/orchestrate")).toBeInTheDocument();
  });
});
