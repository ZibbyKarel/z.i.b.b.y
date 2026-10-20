import type { Ref } from "react";

export interface FileTreeListEntry {
  /** POSIX path; depth = segments - 1. A trailing slash on dirs is ignored. */
  path: string;
  kind: "file" | "dir";
  size?: string;
  when?: string;
}

export enum FileTreeListTestId {
  Root = "file-tree-list-root",
  /** Suffixed with the entry path, e.g. `file-tree-list-row-output/report.md`. */
  Row = "file-tree-list-row",
  Name = "file-tree-list-name",
}

export interface FileTreeListProps {
  /** Pre-ordered entries. */
  entries: FileTreeListEntry[];
  ref?: Ref<HTMLDivElement>;
}

/** Indent per depth level, px. */
const INDENT = 18;

/** Read-only folder listing: indented names with right-aligned size and time. */
export function FileTreeList({ entries, ref }: FileTreeListProps) {
  return (
    <div
      className="flex flex-col border border-border bg-surface"
      data-testid={FileTreeListTestId.Root}
      ref={ref}
    >
      {entries.map((e) => {
        const segments = e.path.replace(/\/$/, "").split("/");
        const depth = segments.length - 1;
        const name = segments[depth] ?? e.path;
        const dir = e.kind === "dir";
        return (
          <div
            className="grid grid-cols-[minmax(0,1fr)_80px_60px] gap-[10px] border-b border-border px-3 py-2 font-mono text-[11px] hover:bg-elevated"
            data-testid={`${FileTreeListTestId.Row}-${e.path}`}
            key={e.path}
          >
            <span
              className={dir ? "truncate text-foreground" : "truncate text-foreground-dim"}
              data-testid={FileTreeListTestId.Name}
              style={{ paddingLeft: `${depth * INDENT}px` }}
            >
              {dir ? `▸ ${name}/` : `· ${name}`}
            </span>
            <span className="text-right text-foreground-faint">{e.size}</span>
            <span className="text-right text-foreground-faint">{e.when}</span>
          </div>
        );
      })}
    </div>
  );
}
