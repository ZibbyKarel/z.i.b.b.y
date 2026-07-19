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
 * feed query and filters client-side; each row links into /archiv (F8d — /runs
 * is deleted) where the resume-with-note panel lives. Renders nothing while the
 * queue is empty — quiet competence, no empty chrome.
 *
 * F8d finding: the "Overview-rail" this docblock refers to no longer exists —
 * `/overview` (and its right rail) is deleted, and a repo-wide grep turns up no
 * remaining consumer of this component at all. It is now genuinely orphaned,
 * not (as the F8d brief assumed) still reachable via `/archiv`/chat/the
 * subsystem drawer. Left in place rather than deleted — this phase's mandate is
 * `features/runs/` minus `Screen.tsx`, not an orphan sweep — flagged for F9.
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
          <Link href={`/archiv?filter=parked&run=${run.runId}`} key={run.runId}>
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
