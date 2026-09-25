import type { ReactNode, Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Typography } from "../Typography/Typography";

/** Sealed column-width scale (no raw px in the public prop) — `flex` columns
 * share the row's remaining width, the rest are fixed px internally via a
 * `<colgroup>` (real `<table>` layout, not a CSS-grid impersonation). */
export type ColumnWidth = "xs" | "sm" | "md" | "lg" | "xl" | "flex";

const columnWidthPx: Record<Exclude<ColumnWidth, "flex">, number> = {
  xs: 56,
  sm: 84,
  md: 110,
  lg: 150,
  xl: 200,
};

export interface DataTableColumn<T> {
  key: string;
  label: string;
  width: ColumnWidth;
  align?: "left" | "center" | "right";
  render?: (row: T) => ReactNode;
}

export enum DataTableTestId {
  Root = "data-table-root",
  Header = "data-table-header",
  /** Each header cell is suffixed with its column `key`. */
  HeaderCell = "data-table-header-cell",
  Body = "data-table-body",
  /** Each row is suffixed with its `getRowKey(row)` value. */
  Row = "data-table-row",
  /** Each cell is suffixed with `${rowKey}-${columnKey}`. */
  Cell = "data-table-cell",
  Empty = "data-table-empty",
  Loading = "data-table-loading",
  RowLink = "data-table-row-link",
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  /** Message rendered in place of rows when `rows` is empty. */
  empty?: ReactNode;
  loading?: boolean;
  stickyHeader?: boolean;
  ref?: Ref<HTMLTableElement>;
}

const alignClass: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function defaultCell<T>(row: T, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  return value === undefined || value === null ? "" : String(value);
}

/**
 * The generic hairline data table (DS.md §8's Table / list) — a real
 * `<table>` (a `<colgroup>` drives the sealed per-column widths, not a
 * CSS-grid stand-in) with a mono-uppercase header row over `--line`-divided
 * rows. A row is keyboard-activatable (`Enter`/`Space`) when `onRowClick` is
 * given, or a real stretched `<a>` (natively focusable/activatable) when
 * `rowHref` is given.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  rowHref,
  empty,
  loading,
  stickyHeader,
  ref,
}: DataTableProps<T>) {
  return (
    <table
      className="w-full table-fixed border-collapse border border-border bg-surface-panel"
      data-testid={DataTableTestId.Root}
      ref={ref}
    >
      <colgroup>
        {columns.map((col) => (
          <col
            key={col.key}
            style={col.width === "flex" ? undefined : { width: columnWidthPx[col.width] }}
          />
        ))}
      </colgroup>
      <thead
        className={cn(stickyHeader && "sticky top-0 z-10 bg-surface-panel")}
        data-testid={DataTableTestId.Header}
      >
        <tr className="border-b border-border">
          {columns.map((col) => (
            <th
              className={cn(
                "px-[14px] py-[9px] font-mono text-[10px] font-medium tracking-wider text-foreground-faint uppercase",
                alignClass[col.align ?? "left"],
              )}
              data-testid={`${DataTableTestId.HeaderCell}-${col.key}`}
              key={col.key}
              scope="col"
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody data-testid={DataTableTestId.Body}>
        {loading ? (
          <tr>
            <td colSpan={columns.length}>
              <div className="px-[14px] py-[14px]" data-testid={DataTableTestId.Loading}>
                <Typography type="bodySm" variant="secondary">
                  Loading…
                </Typography>
              </div>
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>
              <div className="px-[14px] py-[14px]" data-testid={DataTableTestId.Empty}>
                {typeof empty === "string" ? (
                  <Typography type="bodySm" variant="secondary">
                    {empty}
                  </Typography>
                ) : (
                  empty
                )}
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const rowKey = getRowKey(row);
            const href = rowHref?.(row);
            const clickable = Boolean(onRowClick) && !href;
            return (
              <tr
                className={cn(
                  "border-b border-border last:border-b-0",
                  (clickable || href) &&
                    cn("relative cursor-pointer hover:bg-elevated", focusRingInset),
                )}
                data-testid={`${DataTableTestId.Row}-${rowKey}`}
                key={rowKey}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick?.(row);
                        }
                      }
                    : undefined
                }
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
              >
                {columns.map((col, i) => (
                  <td
                    className={cn(
                      "relative min-w-0 px-[14px] py-[10px] text-sm text-foreground",
                      alignClass[col.align ?? "left"],
                    )}
                    data-testid={`${DataTableTestId.Cell}-${rowKey}-${col.key}`}
                    key={col.key}
                  >
                    {i === 0 && href && (
                      <a
                        aria-label={rowKey}
                        className="absolute inset-0"
                        data-testid={DataTableTestId.RowLink}
                        href={href}
                      />
                    )}
                    {col.render ? col.render(row) : defaultCell(row, col.key)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
