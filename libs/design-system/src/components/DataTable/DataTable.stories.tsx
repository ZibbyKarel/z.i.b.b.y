import type { Meta, StoryObj } from "@storybook/react";
import { DataTable } from "./DataTable";
import type { DataTableColumn } from "./DataTable";

interface TaskRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

const COLUMNS: DataTableColumn<TaskRow>[] = [
  { key: "code", label: "Code", width: "sm" },
  { key: "name", label: "Task", width: "flex" },
  { key: "status", label: "Status", width: "md", align: "right" },
];

const ROWS: TaskRow[] = [
  { id: "r1", code: "DEV", name: "Add SSO to the client portal", status: "Working" },
  { id: "r2", code: "QA", name: "Verify the SSO flow", status: "Idle" },
  { id: "r3", code: "REL", name: "Ship the release", status: "Done" },
];

const meta: Meta<typeof DataTable> = {
  title: "DesignSystem/DataTable",
  component: DataTable,
  args: {},
};
export default meta;

type Story = StoryObj<typeof DataTable>;

export const Overview: Story = {
  render: () => (
    <div className="flex max-w-3xl flex-col gap-8 p-8">
      <DataTable columns={COLUMNS} getRowKey={(r) => r.id} rows={ROWS} />
      <DataTable
        columns={COLUMNS}
        empty="No tasks match these filters."
        getRowKey={(r) => r.id}
        rows={[]}
      />
      <DataTable loading columns={COLUMNS} getRowKey={(r) => r.id} rows={[]} />
    </div>
  ),
};

export const Playground: Story = {
  render: () => <DataTable columns={COLUMNS} getRowKey={(r) => r.id} rows={ROWS} />,
};
