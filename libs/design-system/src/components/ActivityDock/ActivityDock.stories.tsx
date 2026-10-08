import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ActivityDock } from "./ActivityDock";
import type { ActivityDockItem } from "./ActivityDock";

const items: ActivityDockItem[] = [
  { id: "pinned", icon: "pin", label: "Pinned", body: <div className="p-3">Pinned items</div> },
  {
    id: "needs-you",
    icon: "bell",
    label: "Needs you",
    badge: 3,
    body: <div className="p-3">3 approvals waiting</div>,
  },
  {
    id: "tasks",
    icon: "check",
    label: "Tasks",
    badge: 2,
    body: <div className="p-3">Running and finished tasks</div>,
  },
];

const meta: Meta<typeof ActivityDock> = {
  title: "DesignSystem/ActivityDock",
  component: ActivityDock,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof ActivityDock>;

export const Default: Story = {
  render: () => {
    const [activeId, setActiveId] = useState<string | null>("needs-you");
    return (
      <div className="h-[480px]">
        <ActivityDock activeId={activeId} items={items} onActiveChange={setActiveId} />
      </div>
    );
  },
};
