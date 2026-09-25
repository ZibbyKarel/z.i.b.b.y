import type { Meta, StoryObj } from "@storybook/react";
import type { StateTone } from "../../stateTone";
import { OrgNode } from "./OrgNode";

const meta: Meta<typeof OrgNode> = {
  title: "DesignSystem/OrgNode",
  component: OrgNode,
  args: {},
};
export default meta;

type Story = StoryObj<typeof OrgNode>;

const DEV_CELLS: StateTone[] = ["working", "working", "thinking", "idle", "done"];
const OPS_CELLS: StateTone[] = ["blocked", "idle"];

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-2xl grid-cols-3 gap-2 p-8">
      <OrgNode cells={DEV_CELLS} code="DEV" href="#dev" name="Development" />
      <OrgNode
        alert={{ state: "blocked", label: "2 blocked" }}
        cells={OPS_CELLS}
        code="OPS"
        href="#ops"
        name="Monitoring & Ops"
      />
      <OrgNode selected cells={DEV_CELLS} code="SEC" href="#sec" name="Security" />
    </div>
  ),
};

export const Playground: Story = {
  args: { code: "DEV", name: "Development", cells: DEV_CELLS, href: "#dev" },
};
