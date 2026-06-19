"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, CodeBlock, Stack, TextAreaField, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useResumePipelineRunMutation } from "../mutations";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import type { RunView } from "../run";

/** Show at most this many trailing log lines as the failure context. */
const TAIL_LINES = 30;

export interface RunParkedPanelProps {
  run: RunView;
}

/**
 * The resume surface of a retries-parked pipeline run: the failed phase's log
 * tail (why it parked), a note field, and the Resume action — the note is
 * appended to the failure context the retried phase receives as its handoff.
 */
export function RunParkedPanel({ run }: RunParkedPanelProps) {
  const t = useTranslations("runs");
  const [note, setNote] = useState("");
  const resume = useResumePipelineRunMutation();
  const parked = run.parked;
  const { data: log } = useStageRunLogQuery(run.runId, parked?.phaseId);

  if (!parked) return null;

  const tail = (log?.content ?? "")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(-TAIL_LINES)
    .join("\n");

  return (
    <HudPanel padding="250" title={t("parkedContext")} tone="warn">
      <Stack gap="200">
        <Typography mono size="xs" type="note" variant="secondary">
          {t("parkedSummary", { phase: parked.phaseId, attempts: parked.attempts })}
        </Typography>
        {tail && <CodeBlock maxHeight="md" text={tail} />}
        <TextAreaField
          label={t("resumeNote")}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("resumeNotePlaceholder")}
          value={note}
        />
        <Stack direction="row" justify="end">
          <Button
            disabled={resume.isPending}
            icon="run"
            onClick={() =>
              resume.mutate({
                params: { runId: run.runId },
                body: { note: note.trim() || undefined },
              })
            }
            size="sm"
          >
            {t("resumeWithNote")}
          </Button>
        </Stack>
      </Stack>
    </HudPanel>
  );
}
