"use client";

import { useMemo } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import { Panel } from "../Panel/Panel";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum FileDiffViewTestId {
  Root = "file-diff-view",
  File = "file-diff-view-file",
  FileName = "file-diff-view-file-name",
  NoHunks = "file-diff-view-no-hunks",
  Empty = "file-diff-view-empty",
}

export interface FileDiffViewProps {
  /** Unified diff text (`git diff` output). */
  diff: string;
  /** Shown when the diff has no files. */
  emptyLabel?: string;
  /** Shown for a file without hunks (binary file or pure rename). */
  noHunksLabel?: string;
}

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
}: FileDiffViewProps) {
  // parseDiff("") yields one phantom empty file, so blank input is short-circuited.
  const files = useMemo(() => (diff.trim() ? parseDiff(diff) : []), [diff]);

  if (files.length === 0) {
    return (
      <Panel padding="300">
        <Typography data-testid={FileDiffViewTestId.Empty} type="text" variant="secondary">
          {emptyLabel}
        </Typography>
      </Panel>
    );
  }

  return (
    <Stack data-testid={FileDiffViewTestId.Root} gap="200">
      {files.map((file) => (
        <Stack
          data-testid={FileDiffViewTestId.File}
          gap="100"
          key={`${file.oldPath}->${file.newPath}`}
        >
          <Typography mono data-testid={FileDiffViewTestId.FileName} type="data">
            {fileLabel(file.oldPath, file.newPath)}
          </Typography>
          {file.hunks.length === 0 ? (
            <Typography data-testid={FileDiffViewTestId.NoHunks} type="note" variant="secondary">
              {noHunksLabel}
            </Typography>
          ) : (
            <Diff diffType={file.type} hunks={file.hunks} viewType="unified">
              {(hunks) => hunks.map((h) => <Hunk hunk={h} key={h.content} />)}
            </Diff>
          )}
        </Stack>
      ))}
    </Stack>
  );
}
