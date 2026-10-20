import type { Ref } from "react";
import { cn } from "../../utils/cn";

export interface DiffstatListFile {
  path: string;
  additions: number;
  deletions: number;
}

export enum DiffstatListTestId {
  Root = "diffstat-list-root",
  /** Suffixed with the file path, e.g. `diffstat-list-row-src/a.ts`. */
  Row = "diffstat-list-row",
  Add = "diffstat-list-add",
  Del = "diffstat-list-del",
  /** The bar track; carries the add/del segments as children. */
  Bar = "diffstat-list-bar",
  /** Add segment of the bar. */
  BarAdd = "diffstat-list-bar-add",
  /** Del segment of the bar. */
  BarDel = "diffstat-list-bar-del",
}

export interface DiffstatListProps {
  files: DiffstatListFile[];
  /** compact = in-banner, no row borders. table = bordered panel with hairline rows. */
  density?: "compact" | "table";
  ref?: Ref<HTMLDivElement>;
}

const rowClass = {
  compact: "grid-cols-[minmax(0,1fr)_44px_44px_80px] py-[3px]",
  table: "grid-cols-[minmax(0,1fr)_50px_50px_90px] px-3 py-2 border-b border-border",
} as const;

/** Per-file diffstat: path, +N, −N and a proportional add/del bar. Bar widths are
 * relative to the largest change in the list. */
export function DiffstatList({ files, density = "compact", ref }: DiffstatListProps) {
  const max = Math.max(1, ...files.map((f) => f.additions + f.deletions));
  return (
    <div
      className={cn(
        "flex flex-col font-mono text-[11px]",
        density === "table" && "border border-border bg-surface",
      )}
      data-testid={DiffstatListTestId.Root}
      ref={ref}
    >
      {files.map((f) => (
        <div
          className={cn("grid items-center gap-[10px]", rowClass[density])}
          data-testid={`${DiffstatListTestId.Row}-${f.path}`}
          key={f.path}
        >
          <span className="truncate text-foreground-dim">{f.path}</span>
          <span className="text-right text-foreground" data-testid={DiffstatListTestId.Add}>
            +{f.additions}
          </span>
          <span className="text-right text-foreground-faint" data-testid={DiffstatListTestId.Del}>
            {"−"}
            {f.deletions}
          </span>
          <span
            className="flex h-[6px] bg-border"
            data-testid={`${DiffstatListTestId.Bar}-${f.path}`}
          >
            <span
              className="bg-foreground"
              data-testid={`${DiffstatListTestId.BarAdd}-${f.path}`}
              style={{ width: `${(f.additions / max) * 100}%` }}
            />
            <span
              className="bg-foreground-faint"
              data-testid={`${DiffstatListTestId.BarDel}-${f.path}`}
              style={{ width: `${(f.deletions / max) * 100}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
