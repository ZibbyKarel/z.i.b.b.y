"use client";

import { useMemo, useRef, useState } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import { cn } from "../../utils/cn";
import { Panel } from "../Panel/Panel";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum FileDiffViewTestId {
  Root = "file-diff-view",
  File = "file-diff-view-file",
  FileName = "file-diff-view-file-name",
  NoHunks = "file-diff-view-no-hunks",
  Empty = "file-diff-view-empty",
  FileList = "file-diff-view-file-list",
  /** Suffixed `-${index}`. */
  FileListItem = "file-diff-view-file-list-item",
  FileListToggle = "file-diff-view-file-list-toggle",
  FileListStrip = "file-diff-view-file-list-strip",
  FileListResizer = "file-diff-view-file-list-resizer",
}

export interface FileDiffViewProps {
  /** Unified diff text (`git diff` output). */
  diff: string;
  /** Shown when the diff has no files. */
  emptyLabel?: string;
  /** Shown for a file without hunks (binary file or pure rename). */
  noHunksLabel?: string;
  /** Show a collapsible changed-files rail left of the diff; click scrolls to the file. */
  fileList?: boolean;
  filesLabel?: string;
  collapseLabel?: string;
  expandLabel?: string;
  resizeLabel?: string;
  /** Show each file's name above its hunks (default). Off when the caller already names the file. */
  showFileName?: boolean;
}

const MIN_WIDTH = 15;
const MAX_WIDTH = 60;
const clampWidth = (n: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));

const DEV_NULL = "/dev/null";

function fileLabel(oldPath: string, newPath: string) {
  if (newPath === DEV_NULL) return oldPath;
  if (oldPath === DEV_NULL || oldPath === newPath) return newPath;
  return `${oldPath} → ${newPath}`;
}

/** Renders a unified diff, one section per changed file. Styles live in theme/globals.css. */
export function FileDiffView({
  diff,
  emptyLabel = "No changes.",
  noHunksLabel = "No textual changes (binary file or rename).",
  fileList = false,
  filesLabel = "Files changed",
  collapseLabel = "Collapse file list",
  expandLabel = "Expand file list",
  resizeLabel = "Resize file list",
  showFileName = true,
}: FileDiffViewProps) {
  // parseDiff("") yields one phantom empty file, so blank input is short-circuited.
  const files = useMemo(() => (diff.trim() ? parseDiff(diff) : []), [diff]);

  const sections = useRef<(HTMLElement | null)[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(25);
  const grid = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  if (files.length === 0) {
    return (
      <Panel padding="300">
        <Typography data-testid={FileDiffViewTestId.Empty} type="text" variant="secondary">
          {emptyLabel}
        </Typography>
      </Panel>
    );
  }

  const sectionsView = (
    <Stack data-testid={FileDiffViewTestId.Root} gap="200">
      {files.map((file, i) => (
        <Stack
          data-testid={FileDiffViewTestId.File}
          gap="100"
          key={`${file.oldPath}->${file.newPath}`}
          ref={(el: HTMLElement | null) => {
            sections.current[i] = el;
          }}
        >
          {showFileName && (
            <Typography mono data-testid={FileDiffViewTestId.FileName} type="data">
              {fileLabel(file.oldPath, file.newPath)}
            </Typography>
          )}
          {file.hunks.length === 0 ? (
            <Typography data-testid={FileDiffViewTestId.NoHunks} type="note" variant="secondary">
              {noHunksLabel}
            </Typography>
          ) : (
            <Diff diffType={file.type} hunks={file.hunks} viewType="unified">
              {(hunks) => hunks.map((h) => <Hunk hunk={h} key={`${h.oldStart}-${h.newStart}`} />)}
            </Diff>
          )}
        </Stack>
      ))}
    </Stack>
  );
  if (!fileList) return sectionsView;

  const toggle = (
    <button
      aria-expanded={!collapsed}
      aria-label={collapsed ? expandLabel : collapseLabel}
      className="cursor-pointer bg-transparent px-[6px] py-[2px] text-[14px] text-ink-2 hover:text-ink"
      data-testid={FileDiffViewTestId.FileListToggle}
      onClick={() => setCollapsed((c) => !c)}
      type="button"
    >
      {collapsed ? "›" : "‹"}
    </button>
  );

  return (
    <div
      className={cn(
        "grid items-start",
        collapsed ? "grid-cols-[28px_minmax(0,1fr)] gap-[12px]" : "gap-x-[3px]",
      )}
      ref={grid}
      style={collapsed ? undefined : { gridTemplateColumns: `${width}% 6px minmax(0,1fr)` }}
    >
      {collapsed ? (
        <div
          className="sticky top-0 flex justify-center border-r border-line"
          data-testid={FileDiffViewTestId.FileListStrip}
        >
          {toggle}
        </div>
      ) : (
        <nav
          aria-label={filesLabel}
          className="sticky top-0 flex max-h-[70vh] flex-col gap-[2px] overflow-y-auto border-r border-line pr-[8px] font-sans text-[12px]"
          data-testid={FileDiffViewTestId.FileList}
        >
          <div className="flex items-center justify-between uppercase tracking-wider text-[10px] text-ink-3">
            <span>{filesLabel}</span>
            {toggle}
          </div>
          {files.map((file, i) => {
            const changes = file.hunks.flatMap((h) => h.changes);
            const added = changes.filter((c) => c.type === "insert").length;
            const removed = changes.filter((c) => c.type === "delete").length;
            const label = fileLabel(file.oldPath, file.newPath);
            return (
              <button
                className="flex cursor-pointer items-baseline justify-between gap-[8px] bg-transparent px-[6px] py-[3px] text-left text-ink-2 hover:bg-line hover:text-ink"
                data-testid={`${FileDiffViewTestId.FileListItem}-${i}`}
                key={`${file.oldPath}->${file.newPath}`}
                onClick={() =>
                  sections.current[i]?.scrollIntoView({ block: "start", behavior: "smooth" })
                }
                title={label}
                type="button"
              >
                <span className="min-w-0 truncate">{label}</span>
                <span className="flex-none text-[10px] text-ink-3">{`+${added} −${removed}`}</span>
              </button>
            );
          })}
        </nav>
      )}
      {!collapsed && (
        <div
          aria-label={resizeLabel}
          aria-orientation="vertical"
          aria-valuemax={MAX_WIDTH}
          aria-valuemin={MIN_WIDTH}
          aria-valuenow={width}
          className="sticky top-0 h-[70vh] cursor-col-resize hover:bg-line"
          data-testid={FileDiffViewTestId.FileListResizer}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWidth((w) => clampWidth(w - 2));
            else if (e.key === "ArrowRight") setWidth((w) => clampWidth(w + 2));
          }}
          onPointerCancel={() => (dragging.current = false)}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            dragging.current = true;
          }}
          onPointerMove={(e) => {
            const rect = grid.current?.getBoundingClientRect();
            if (!dragging.current || !rect || rect.width === 0) return;
            setWidth(clampWidth(((e.clientX - rect.left) / rect.width) * 100));
          }}
          onPointerUp={() => (dragging.current = false)}
          role="separator"
          tabIndex={0}
        />
      )}
      {sectionsView}
    </div>
  );
}
