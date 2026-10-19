"use client";

import { Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
// Third-party diff stylesheet + its DS-token mapping: no DS primitive renders diffs (D-007 exception).
/* eslint-disable no-restricted-imports */
import "react-diff-view/style/index.css";
import "./PrDiff.css";
/* eslint-enable no-restricted-imports */

export enum PrDiffTestId {
  Root = "pr-diff",
  File = "pr-diff-file",
  FileName = "pr-diff-file-name",
  NoHunks = "pr-diff-no-hunks",
  Empty = "pr-diff-empty",
}

export interface PrDiffProps {
  /** Unified diff text (as returned by the PR diff endpoint). */
  diff: string;
}

const DEV_NULL = "/dev/null";

function fileLabel(oldPath: string, newPath: string) {
  if (newPath === DEV_NULL) return oldPath;
  if (oldPath === DEV_NULL || oldPath === newPath) return newPath;
  return `${oldPath} → ${newPath}`;
}

/** Renders a unified PR diff, one section per changed file. */
export function PrDiff({ diff }: PrDiffProps) {
  const t = useTranslations("inboxPage.prs");
  // parseDiff("") yields one phantom empty file, so blank input is short-circuited.
  const files = useMemo(() => (diff.trim() ? parseDiff(diff) : []), [diff]);

  if (files.length === 0) {
    return (
      <Panel padding="300">
        <Typography data-testid={PrDiffTestId.Empty} type="text" variant="secondary">
          {t("diff.empty")}
        </Typography>
      </Panel>
    );
  }

  return (
    <Stack data-testid={PrDiffTestId.Root} gap="200">
      {files.map((file) => (
        <Stack data-testid={PrDiffTestId.File} gap="100" key={`${file.oldPath}->${file.newPath}`}>
          <Typography mono data-testid={PrDiffTestId.FileName} type="data">
            {fileLabel(file.oldPath, file.newPath)}
          </Typography>
          {file.hunks.length === 0 ? (
            <Typography data-testid={PrDiffTestId.NoHunks} type="note" variant="secondary">
              {t("diff.noHunks")}
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
