"use client";

import { Icon, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useRunsQuery } from "../queries/useRunsQuery";
import { runTitle } from "../run";

/**
 * Overview-rail section listing retries-parked pipeline runs (delivery loops
 * that exhausted their retries and wait for an operator note). Reuses the runs
 * feed query and filters client-side; each row links into /runs where the
 * resume-with-note panel lives. Renders nothing while the queue is empty —
 * quiet competence, no empty chrome.
 */
export function ParkedRunsPanel() {
  const t = useTranslations("runs");
  const { runs } = useRunsQuery();
  const parked = runs.filter((r) => r.status === "parked");

  if (parked.length === 0) return null;

  return (
    <HudPanel title={t("parkedQueue")} tone="warn">
      <Stack gap="150">
        {parked.map((run) => (
          <Link href={`/runs?filter=parked&run=${run.runId}`} key={run.runId}>
            <Stack align="center" direction="row" gap="100">
              <Icon name="wait" size="xs" tone="warn" />
              <Stack gap="25">
                <Typography mono size="sm" type="note" weight="semibold">
                  {runTitle(run)}
                </Typography>
                {run.parked && (
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {t("parkedSummary", {
                      phase: run.parked.phaseId,
                      attempts: run.parked.attempts,
                    })}
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Link>
        ))}
      </Stack>
    </HudPanel>
  );
}
