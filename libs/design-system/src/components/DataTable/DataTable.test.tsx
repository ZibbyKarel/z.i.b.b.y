import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable, DataTableTestId } from "./DataTable";
import type { DataTableColumn } from "./DataTable";

interface Row {
  id: string;
  name: string;
  status: string;
}

const ROWS: Row[] = [
  { id: "r1", name: "Add SSO", status: "done" },
  { id: "r2", name: "Verify SSO", status: "working" },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "name", label: "Name", width: "flex" },
  { key: "status", label: "Status", width: "sm" },
];

describe("DataTable", () => {
  it("renders a header cell per column and a row per item using the default cell renderer", () => {
    render(<DataTable columns={COLUMNS} getRowKey={(r) => r.id} rows={ROWS} />);
    expect(screen.getByTestId(`${DataTableTestId.HeaderCell}-name`)).toHaveTextContent("Name");
    expect(screen.getByTestId(`${DataTableTestId.Cell}-r1-name`)).toHaveTextContent("Add SSO");
    expect(screen.getByTestId(`${DataTableTestId.Cell}-r2-status`)).toHaveTextContent("working");
  });

  it("uses a column's custom render when given", () => {
    const columns: DataTableColumn<Row>[] = [
      { key: "name", label: "Name", width: "flex" },
      { key: "status", label: "Status", width: "sm", render: (row) => `[${row.status}]` },
    ];
    render(<DataTable columns={columns} getRowKey={(r) => r.id} rows={ROWS} />);
    expect(screen.getByTestId(`${DataTableTestId.Cell}-r1-status`)).toHaveTextContent("[done]");
  });

  it("renders a string empty message when rows is empty", () => {
    render(<DataTable columns={COLUMNS} empty="No results." getRowKey={(r) => r.id} rows={[]} />);
    expect(screen.getByTestId(DataTableTestId.Empty)).toHaveTextContent("No results.");
    expect(screen.queryByTestId(`${DataTableTestId.Row}-r1`)).not.toBeInTheDocument();
  });

  it("renders a ReactNode empty slot when rows is empty", () => {
    render(
      <DataTable
        columns={COLUMNS}
        empty={<button type="button">New task</button>}
        getRowKey={(r) => r.id}
        rows={[]}
      />,
    );
    expect(screen.getByTestId(DataTableTestId.Empty)).toHaveTextContent("New task");
  });

  it("renders a loading row instead of rows when loading", () => {
    render(<DataTable loading columns={COLUMNS} getRowKey={(r) => r.id} rows={ROWS} />);
    expect(screen.getByTestId(DataTableTestId.Loading)).toBeInTheDocument();
    expect(screen.queryByTestId(`${DataTableTestId.Row}-r1`)).not.toBeInTheDocument();
  });

  it("applies the sticky-header class when stickyHeader is set", () => {
    render(<DataTable stickyHeader columns={COLUMNS} getRowKey={(r) => r.id} rows={ROWS} />);
    expect(screen.getByTestId(DataTableTestId.Header)).toHaveClass("sticky");
  });

  it("makes a row keyboard-activatable and click-activatable when onRowClick is given", async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable columns={COLUMNS} getRowKey={(r) => r.id} onRowClick={onRowClick} rows={ROWS} />,
    );
    const row = screen.getByTestId(`${DataTableTestId.Row}-r1`);
    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabIndex", "0");
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
    await userEvent.click(screen.getByTestId(`${DataTableTestId.Row}-r2`));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });

  it("renders a stretched row link when rowHref is given, taking precedence over onRowClick", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={COLUMNS}
        getRowKey={(r) => r.id}
        onRowClick={onRowClick}
        rowHref={(r) => `/tasks/${r.id}`}
        rows={ROWS}
      />,
    );
    const links = screen.getAllByTestId(DataTableTestId.RowLink);
    expect(links[0]).toHaveAttribute("href", "/tasks/r1");
    expect(screen.getByTestId(`${DataTableTestId.Row}-r1`)).not.toHaveAttribute("role", "button");
  });
});
