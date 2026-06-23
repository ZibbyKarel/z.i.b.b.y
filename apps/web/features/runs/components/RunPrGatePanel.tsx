"use client";

import { CodeBlock, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useRunArtifactQuery } from "../queries/useRunArtifactQuery";

export interface RunPrGatePanelProps {
  /** The pipeline run id whose PR gate is pending (artifacts are run-scoped). */
  pipelineRunId: string;
  /** Panel title — defaults to the gate label; a completed run passes its own. */
  title?: string;
}

/**
 * The PR-gate decision surface (Phase 3.3): show what is about to be published — the
 * `pr-draft.md` title/body and the branch's `diffstat.txt`. Above the approval panel
 * for a parked run (the Tier-3 decision is made against the real change, not a bare
 * "open a PR?" prompt); also reused on a COMPLETED pipeline run as its produced output
 * (the artifacts persist on disk). A missing artifact (404) simply omits its block,
 * and an empty panel renders nothing.
 */
export function RunPrGatePanel({ pipelineRunId, title }: RunPrGatePanelProps) {
  const t = useTranslations("runs");
  const { data: draft } = useRunArtifactQuery(pipelineRunId, "pr-draft.md");
  const { data: diffstat } = useRunArtifactQuery(pipelineRunId, "diffstat.txt");

  if (!draft?.content && !diffstat?.content) return null;

  return (
    <HudPanel padding="250" title={title ?? t("prGate")} tone="accent">
      <Stack gap="200">
        {draft?.content && (
          <Stack gap="50">
            <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
              {t("prDraft")}
            </Typography>
            <CodeBlock maxHeight="md" text={draft.content} />
          </Stack>
        )}
        {diffstat?.content && (
          <Stack gap="50">
            <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
              {t("prDiffstat")}
            </Typography>
            <CodeBlock maxHeight="md" text={diffstat.content} />
          </Stack>
        )}
      </Stack>
    </HudPanel>
  );
}
