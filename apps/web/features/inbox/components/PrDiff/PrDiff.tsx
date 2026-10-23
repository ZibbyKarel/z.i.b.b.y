"use client";

import { FileDiffView } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export interface PrDiffProps {
  /** Unified diff text (as returned by the PR diff endpoint). */
  diff: string;
}

/** The PR diff, with cs/en labels over the DS FileDiffView. */
export function PrDiff({ diff }: PrDiffProps) {
  const t = useTranslations("inboxPage.prs");
  return (
    <FileDiffView
      fileList
      collapseLabel={t("diff.collapseFiles")}
      diff={diff}
      emptyLabel={t("diff.empty")}
      expandLabel={t("diff.expandFiles")}
      filesLabel={t("diff.files")}
      noHunksLabel={t("diff.noHunks")}
    />
  );
}
