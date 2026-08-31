import { renderWithProviders as render, screen } from "../../../test/render";
import { describe, expect, it } from "vitest";
import type { TaskTarget } from "@zibby/contracts";
import { IconTileTestId } from "@zibby/design-system";
import { TargetIdentity } from "./TargetIdentity";

const agentTarget: TaskTarget = {
  kind: "agent",
  id: "architect",
  name: "Architekt",
  glyph: "compass",
  avatar: "/avatars/architect.png",
};

describe("chat TargetIdentity", () => {
  it("renders the target avatar in place of the glyph when present", () => {
    render(<TargetIdentity targets={[agentTarget]} />);
    expect(screen.getByTestId(IconTileTestId.Image)).toHaveAttribute(
      "src",
      "/avatars/architect.png",
    );
  });

  it("falls back to the glyph when the target has no avatar", () => {
    render(<TargetIdentity targets={[{ kind: "agent", id: "x", name: "X", glyph: "compass" }]} />);
    expect(screen.queryByTestId(IconTileTestId.Image)).toBeNull();
  });
});
