import type { Meta, StoryObj } from "@storybook/react";
import { DiffstatList } from "./DiffstatList";

const FILES = [
  { path: "apps/api/src/workflows/workflow-runner.service.ts", additions: 120, deletions: 14 },
  { path: "libs/contracts/src/tasks/task-run.schema.ts", additions: 36, deletions: 2 },
  { path: "apps/web/features/runs/components/RunDetail.tsx", additions: 4, deletions: 310 },
  { path: "README.md", additions: 0, deletions: 0 },
];

const meta: Meta<typeof DiffstatList> = {
  title: "DesignSystem/DiffstatList",
  component: DiffstatList,
  argTypes: { density: { control: "radio", options: ["compact", "table"] } },
  args: { files: FILES, density: "compact" },
};
export default meta;

type Story = StoryObj<typeof DiffstatList>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-8">
      <DiffstatList density="compact" files={FILES} />
      <DiffstatList density="table" files={FILES} />
    </div>
  ),
};

export const Playground: Story = {};
