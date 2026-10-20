import type { Meta, StoryObj } from "@storybook/react";
import { FileTreeList } from "./FileTreeList";
import type { FileTreeListEntry } from "./FileTreeList";

const ENTRIES: FileTreeListEntry[] = [
  { path: "context", kind: "dir" },
  { path: "context/input.md", kind: "file", size: "1.1 KB" },
  { path: "01_plan", kind: "dir", when: "4m" },
  { path: "01_plan/plan.md", kind: "file", size: "3.2 KB" },
  { path: "output", kind: "dir" },
  { path: "output/report.md", kind: "file", size: "8.4 KB", when: "1m" },
  { path: "output/summary.json", kind: "file", size: "1.1 KB" },
];

const meta: Meta<typeof FileTreeList> = {
  title: "DesignSystem/FileTreeList",
  component: FileTreeList,
  args: { entries: ENTRIES },
};
export default meta;

type Story = StoryObj<typeof FileTreeList>;

export const Overview: Story = {
  render: () => (
    <div className="max-w-xl">
      <FileTreeList entries={ENTRIES} />
    </div>
  ),
};

export const Playground: Story = {};
