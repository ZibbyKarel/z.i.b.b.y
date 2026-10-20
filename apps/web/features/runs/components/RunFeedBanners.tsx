"use client";

import type { Diffstat } from "@zibby/contracts";
import {
  Button,
  Card,
  Container,
  DiffstatList,
  Divider,
  HoldButton,
  IconTile,
  Panel,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { resumeEta } from "../../../utils/time";
import { useApproveMutation, useRejectMutation } from "../../approvals";
import { type DashboardApproval, RISK_META } from "../../approvals/approval";
import type { RunView } from "../run";
import type { StageRailRow } from "../runDetailModel";

export enum RunFeedBannersTestId {
  Approval = "run-banner-approval",
  Question = "run-banner-question",
  Parked = "run-banner-parked",
  Hold = "run-banner-hold",
  Revise = "run-banner-revise",
  Reject = "run-banner-reject",
  Diff = "run-banner-diff",
}

/** What the approval asks for, as one line of plain text (agent content is data, never markup). */
function approvalTitle(approval: DashboardApproval): string {
  return approval.summary ?? approval.action;
}

export interface RunApprovalBannerProps {
  approval: DashboardApproval;
  diffstat?: Diffstat;
  reviseOpen: boolean;
  onToggleRevise: () => void;
  onApproved?: () => void;
}

/** NEEDS YOU — hold to approve, revise (stage approvals only) or reject; the run's pending diffstat underneath. */
export function RunApprovalBanner({
  approval,
  diffstat,
  reviseOpen,
  onToggleRevise,
  onApproved,
}: RunApprovalBannerProps) {
  const t = useTranslations("runs.detail");
  const tApprovals = useTranslations("approvals");
  const tk = useTranslations();
  const locale = useLocale();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const [confirmReject, setConfirmReject] = useState(false);

  const title = approvalTitle(approval);
  const risk = approval.riskType ? RISK_META[approval.riskType].label : approval.action;
  const consequence = approval.consequence ?? approval.text;
  const at = new Date(approval.requestedAt).toLocaleTimeString(locale);

  return (
    <Card corners borderTone="ink" data-testid={RunFeedBannersTestId.Approval}>
      <Container padding={["150", "200"]}>
        <Stack direction="row" gap="250">
          <Stack grow gap="100">
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone="blocked" />
              <Typography as="span" type="labelSm" variant="primary">
                {t("banner.approvalHead", {
                  sev: approval.risk.toUpperCase(),
                  risk: risk.toUpperCase(),
                })}
              </Typography>
            </Stack>
            <Typography type="title">{title}</Typography>
            {consequence && (
              <Typography type="bodySm" variant="secondary">
                {consequence}
              </Typography>
            )}
            <Typography as="span" type="labelSm">
              {t("banner.approvalMeta", {
                at,
                via: (approval.via ?? approval.skill).toUpperCase(),
              })}
            </Typography>
          </Stack>
          <Container shrink={false} width="280px">
            <Stack gap="75" justify="center">
              <HoldButton
                block
                armedLabel={tApprovals("holdArmed")}
                data-testid={RunFeedBannersTestId.Hold}
                disabled={approve.isPending}
                doneLabel={tApprovals("holdDone")}
                label={t("banner.hold")}
                onConfirm={() =>
                  approve.mutate(
                    { params: { id: approval.id }, body: {} },
                    { onSuccess: onApproved },
                  )
                }
                tone="ink"
              />
              <Stack direction="row" gap="75">
                {approval.action === "stage-approval" && (
                  <Button
                    block
                    aria-pressed={reviseOpen}
                    data-testid={RunFeedBannersTestId.Revise}
                    intent="secondary"
                    onClick={onToggleRevise}
                    size="sm"
                  >
                    {t("banner.revise")}
                  </Button>
                )}
                <Button
                  block
                  data-testid={RunFeedBannersTestId.Reject}
                  intent="secondary"
                  onClick={() => setConfirmReject(true)}
                  size="sm"
                >
                  <StatusDot size="75" tone="error" />
                  {t("banner.reject")}
                </Button>
              </Stack>
            </Stack>
          </Container>
        </Stack>
      </Container>
      {diffstat && diffstat.files.length > 0 && (
        <>
          <Divider />
          <Container data-testid={RunFeedBannersTestId.Diff} padding={["100", "200"]}>
            <Stack gap="50">
              <Typography as="span" type="labelSm">
                {t("banner.wouldPublish", {
                  files: String(diffstat.files.length).padStart(2, "0"),
                  add: diffstat.additions,
                  del: diffstat.deletions,
                })}
              </Typography>
              <DiffstatList density="compact" files={diffstat.files} />
            </Stack>
          </Container>
        </>
      )}
      {confirmReject && (
        <ConfirmDeleteDialog
          body={t("confirm.rejectBody", {
            action: title.charAt(0).toLowerCase() + title.slice(1),
          })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("banner.reject")}
          icon="x"
          onCancel={() => setConfirmReject(false)}
          onConfirm={() => {
            setConfirmReject(false);
            reject.mutate({ params: { id: approval.id }, body: {} });
          }}
          pending={reject.isPending}
          title={t("confirm.rejectTitle")}
        />
      )}
    </Card>
  );
}

export interface RunQuestionBannerProps {
  question: string;
  agentName: string;
}

/** NEEDS YOU · QUESTION — the agent's question rendered as plain text; the answer goes through the composer. */
export function RunQuestionBanner({ question, agentName }: RunQuestionBannerProps) {
  const t = useTranslations("runs.detail.banner");
  return (
    <Card borderTone="ink" data-testid={RunFeedBannersTestId.Question}>
      <Container padding={["150", "200"]}>
        <Stack gap="75">
          <Stack align="center" direction="row" gap="100">
            <StatusDot tone="blocked" />
            <Typography as="span" type="labelSm" variant="primary">
              {t("questionHead", { agent: agentName.toUpperCase() })}
            </Typography>
          </Stack>
          <Typography type="bodyLg">{question}</Typography>
          <Typography as="span" type="labelSm">
            {t("questionHint")}
          </Typography>
        </Stack>
      </Container>
    </Card>
  );
}

export interface RunParkedBannerProps {
  run: RunView;
  stage?: StageRailRow;
}

/** PARKED · retries exhausted on a stage. The failure text lives in a file the API does not expose, so no error sentence. */
export function RunParkedBanner({ run, stage }: RunParkedBannerProps) {
  const t = useTranslations("runs.detail.banner");
  const attempts = String(run.parked?.attempts ?? stage?.retries ?? 0).padStart(2, "0");
  return (
    <Card borderTone="ink" data-testid={RunFeedBannersTestId.Parked}>
      <Container padding={["150", "200"]}>
        <Stack gap="75">
          <Stack align="center" direction="row" gap="100">
            <StatusDot size="75" tone="error" />
            <Typography as="span" type="labelSm" variant="primary">
              {t("parkedHead", {
                n: stage?.n ?? "—",
                name: (stage?.name ?? run.parked?.phaseId ?? "").toUpperCase(),
                att: `${attempts}/${attempts}`,
              })}
            </Typography>
          </Stack>
          <Typography as="span" type="labelSm">
            {t("parkedHint")}
          </Typography>
        </Stack>
      </Container>
    </Card>
  );
}

/**
 * The "paused on a usage limit" notice — a pause, not a failure (Phase 9). Shows the
 * reset ETA and, when present, how many auto-resume cycles have been spent.
 */
export function LimitPausedPanel({ run, now }: { run: RunView; now?: number }) {
  const t = useTranslations("runs");
  const locale = useLocale();
  // Without a ticking parent clock, the ETA is computed from mount time.
  const [mountedAt] = useState(Date.now);
  return (
    <Panel padding="300" tone="warn">
      <Stack align="start" direction="row" gap="150">
        <IconTile glyph="pause" size="md" />
        <Stack gap="50">
          <Typography type="note" weight="semibold">
            {t("limitPausedTitle")}
          </Typography>
          <Typography leading="snug" size="sm" type="text" variant="secondary">
            {t("limitPausedBody", { eta: resumeEta(run.resumeAt, now ?? mountedAt, locale) })}
          </Typography>
          {run.limitResumeCycles != null && run.limitResumeCycles > 0 && (
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("limitResumeCycles", { n: run.limitResumeCycles })}
            </Typography>
          )}
        </Stack>
      </Stack>
    </Panel>
  );
}
