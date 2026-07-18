"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card, Container, HoldButton, Stack, Tag, Typography } from "@zibby/design-system";
import type { MergeQueueEntry, MergeQueueState } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useMergeProjectPrMutation } from "../../projects/mutations";
import { getProjectPrsQueryKey } from "../../projects/queries";
import { getMergeQueueQueryKey, useMergeQueueQuery } from "../queries";

export enum MergeQueueCardTestId {
  Root = "merge-queue",
  Row = "merge-queue-row",
  MergeHold = "merge-queue-merge-hold",
  OpenInGithub = "merge-queue-open-in-github",
}

/** `queueState` → Tag tone (ready reads calm, blocked/stale read louder). */
const STATE_TONE: Record<MergeQueueState, "ok" | "bad" | "neutral"> = {
  ready: "ok",
  blocked: "bad",
  stale: "neutral",
};

function MergeQueueRow({ entry }: { entry: MergeQueueEntry }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const merge = useMergeProjectPrMutation();

  const onConfirmMerge = () => {
    merge.mutate(
      { params: { id: entry.projectId, number: entry.number }, body: {} },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getMergeQueueQueryKey() });
          void qc.invalidateQueries({ queryKey: getProjectPrsQueryKey(entry.projectId) });
        },
      },
    );
  };

  return (
    <Card corners data-testid={MergeQueueCardTestId.Row}>
      <Container padding="200">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="75" justify="between">
            <Stack align="center" direction="row" gap="75">
              <Tag tone={STATE_TONE[entry.queueState]}>
                {t(`maestro.queueState.${entry.queueState}`)}
              </Tag>
              {entry.projectName && <Tag tone="neutral">{entry.projectName}</Tag>}
            </Stack>
            <a
              data-testid={MergeQueueCardTestId.OpenInGithub}
              href={entry.url}
              rel="noreferrer"
              target="_blank"
            >
              <Typography size="sm" tone="accent" type="note" weight="semibold">
                {t("maestro.merge.openInGithub")}
              </Typography>
            </a>
          </Stack>

          <Container minW0>
            <Typography truncate size="base" type="note" variant="secondary">
              #{entry.number} {entry.title}
            </Typography>
          </Container>

          {entry.queueState === "ready" ? (
            <Container data-testid={MergeQueueCardTestId.MergeHold}>
              <HoldButton
                armedLabel={t("maestro.merge.armed")}
                doneLabel={t("maestro.merge.done")}
                label={t("maestro.merge.hold", { number: entry.number })}
                onConfirm={onConfirmMerge}
                size="sm"
                tone="warn"
              />
            </Container>
          ) : (
            <Typography size="xs" type="note" variant="tertiary">
              {t("maestro.merge.blockedReason", {
                check: t(`maestro.check.${entry.checkState}`),
                review: t(`maestro.review.${entry.reviewState}`),
              })}
            </Typography>
          )}
        </Stack>
      </Container>
    </Card>
  );
}

/**
 * Overview surface for Maestro's read-side merge queue (NS2 F7b-1): every open
 * PR across project repos with a merge control ONLY on genuinely `ready`
 * entries — a `HoldButton` (double-confirmation guardrail) whose `onConfirm`
 * fires the EXISTING gated `POST /projects/:id/prs/:number/merge`
 * (`useMergeProjectPrMutation`). No new merge code, no auto-merge: every merge
 * is the operator's deliberate hold. Blocked/stale entries render only the
 * GitHub link plus the reason they aren't ready. Hidden entirely when the
 * queue is empty, the same "state, not noise" convention as the other overview
 * panels.
 */
export function MergeQueueCard() {
  const t = useTranslations();
  const { data } = useMergeQueueQuery();
  const entries = data?.entries ?? [];
  if (entries.length === 0) return null;

  return (
    <Container data-testid={MergeQueueCardTestId.Root}>
      <HudPanel title={t("maestro.title")}>
        <Stack direction="col" gap="100">
          {entries.map((entry) => (
            <MergeQueueRow entry={entry} key={`${entry.projectId}-${entry.number}`} />
          ))}
        </Stack>
      </HudPanel>
    </Container>
  );
}
