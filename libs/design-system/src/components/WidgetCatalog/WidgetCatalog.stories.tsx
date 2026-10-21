import type { Meta, StoryObj } from "@storybook/react";
import { WidgetCatalog } from "./WidgetCatalog";

const meta: Meta<typeof WidgetCatalog> = {
  title: "DesignSystem/WidgetCatalog",
  component: WidgetCatalog,
  args: {
    title: "WIDGET CATALOG",
    addLabel: "ADD",
    closeLabel: "Close",
    emptyText: "Every widget is already on the board.",
    entries: [
      { id: "prs", label: "PULL REQUESTS", description: "Agent PRs and your own, with stacks" },
      { id: "runs", label: "RUNNING NOW", description: "Tasks moving through a workflow" },
    ],
    onAdd: () => {},
    onClose: () => {},
  },
  decorators: [(Story) => <div className="relative h-[260px]">{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof WidgetCatalog>;

export const Overview: Story = {};
export const Empty: Story = { args: { entries: [] } };
