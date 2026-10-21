import type { Meta, StoryObj } from "@storybook/react";
import { DetailTable } from "./DetailTable";

const meta: Meta<typeof DetailTable> = {
  title: "DesignSystem/DetailTable",
  component: DetailTable,
  args: {
    variant: "kv",
    rows: [{ cells: ["EPIC", "ZB-12 · Runner"] }, { cells: ["TEAM", "Core"] }],
  },
  argTypes: { variant: { control: "select", options: ["kv", "subtask", "check", "file"] } },
};
export default meta;
type Story = StoryObj<typeof DetailTable>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <DetailTable rows={[{ cells: ["EPIC", "ZB-12 · Runner"] }, { cells: ["SCOPE", "api"] }]} />
      <DetailTable
        rows={[{ cells: ["a1b2", "ENG", "BUILD · 2", "WORKING", "out.md"], tone: "working" }]}
        variant="subtask"
      />
      <DetailTable rows={[{ cells: ["LINT", "PASSED"], tone: "working" }]} variant="check" />
      <DetailTable rows={[{ cells: ["apps/api/src/a.ts", "+12 −3"] }]} variant="file" />
      <DetailTable emptyText="None yet." rows={[]} />
    </div>
  ),
};
export const Playground: Story = {};
