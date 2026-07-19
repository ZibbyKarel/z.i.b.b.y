import { renderWithProviders as render, screen } from "../../../test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GateRule } from "@zibby/contracts";
import { SystemFloorPanel } from "./SystemFloorPanel";

let floor: GateRule[] = [];
vi.mock("../queries", () => ({
  useSystemPolicyQuery: () => ({ data: floor }),
}));

const denyRule: GateRule = {
  id: "deny-bash",
  source: "system",
  locked: true,
  match: [{ type: "tool", tool: "Bash" }],
  decision: "deny",
};

describe("SystemFloorPanel (37) — the locked POLICY.md floor is visible in Settings/the subsystem drawer", () => {
  beforeEach(() => {
    floor = [];
  });

  it("renders nothing when the floor is empty", () => {
    floor = [];
    render(<SystemFloorPanel />);
    expect(screen.queryByText("Zděděná systémová pravidla")).not.toBeInTheDocument();
  });

  it("shows the floor title + the rule's decision, with no edit/delete (locked)", () => {
    floor = [denyRule];
    render(<SystemFloorPanel />);
    // Title from the shared gates catalog (cs).
    expect(screen.getByText("Zděděná systémová pravidla")).toBeInTheDocument();
    // The deny decision is surfaced…
    expect(screen.getByText("deny")).toBeInTheDocument();
    // …and a locked floor rule offers no mutation controls.
    expect(screen.queryByRole("button", { name: /smazat|upravit/i })).not.toBeInTheDocument();
  });
});
