"use client";

import {
  Alert,
  Button,
  Card,
  Container,
  HoldButton,
  type RiskKind,
  Stack,
  StatusDot,
  Tag,
  Typography,
  riskIcon,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useApproveMutation, useRejectMutation } from "../../approvals";
import { type DashboardApproval, HIGH_RISK_TYPES, type RiskType } from "../../approvals/approval";
import { formatRelativeTime } from "../statusFlyout";

export enum FlyoutApprovalRowTestId {
  Root = "chat-flyout-approval-row",
  Approve = "chat-flyout-approval-approve",
  Reject = "chat-flyout-approval-reject",
  Source = "chat-flyout-approval-source",
}

export interface FlyoutApprovalRowProps {
  approval: DashboardApproval;
}

/** Semantic risk type → DS risk kind (ApprovalCard's map, typed on RiskType). */
const RISK_KIND: Record<RiskType, RiskKind> = {
  platba: "payment",
  mazani: "deletion",
  push: "push",
  odeslani: "send",
};

/**
 * One pending approval in the flyout's waiting section (design VcApprovalRow) with
 * the real decision wiring the prototype lacks. High-risk approve (platba/mazani)
 * confirms via HoldButton; GATE-BUG law (66af534a): reject calls useRejectMutation
 * directly — never a generic remove/dismiss/delete callback.
 */
export function FlyoutApprovalRow({ approval }: FlyoutApprovalRowProps) {
  const t = useTranslations("approval");
  const locale = useLocale();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const [done, setDone] = useState<"ok" | "no" | null>(null);

  const kind = approval.riskType ? RISK_KIND[approval.riskType] : undefined;
  const hold = approval.riskType != null && HIGH_RISK_TYPES.has(approval.riskType);

  const doApprove = () => {
    setDone("ok");
    approve.mutate({ params: { id: approval.id }, body: {} });
  };

  const doReject = () => {
    setDone("no");
    reject.mutate({ params: { id: approval.id }, body: {} });
  };

  return (
    <Card background="background" data-testid={FlyoutApprovalRowTestId.Root}>
      <Container padding="150">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={done == null} tone={done == null ? "wait" : "idle"} />
              <Typography
                mono
                uppercase
                size="xs"
                tracking="wide"
                type="note"
                variant="tertiary"
                weight="semibold"
              >
                {approval.skill}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="100">
              {kind && (
                <Tag icon={riskIcon[kind]} tone={kind}>
                  {t(`riskTag.${kind}`)}
                </Tag>
              )}
              <Typography mono size="xs" type="note" variant="tertiary">
                {formatRelativeTime(approval.requestedAt, locale)}
              </Typography>
            </Stack>
          </Stack>

          <Typography size="sm" type="note" weight="semibold">
            <Typography mono as="span" size="sm" tone="accent" type="note" weight="semibold">
              {approval.skill}
            </Typography>{" "}
            <Typography as="span" size="sm" type="note" variant="secondary" weight="normal">
              {t("wants")}
            </Typography>{" "}
            {approval.action}
          </Typography>
          <Typography size="sm" type="note" variant="secondary">
            {approval.detail}
          </Typography>

          {approval.sourceUrl && (
            <a
              data-testid={FlyoutApprovalRowTestId.Source}
              href={approval.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <Typography size="sm" tone="accent" type="note" weight="semibold">
                {t("openSource")}
              </Typography>
            </a>
          )}

          {done ? (
            <Alert severity={done === "ok" ? "ok" : "error"}>
              {done === "ok" ? t("approved") : t("rejected")}
            </Alert>
          ) : (
            <Stack direction="row" gap="100">
              {hold ? (
                <HoldButton
                  block
                  armedLabel={t("holdArmed")}
                  doneLabel={t("holdDone")}
                  label={t("holdToApprove")}
                  onConfirm={doApprove}
                  tone={approval.riskType === "mazani" ? "bad" : "warn"}
                />
              ) : (
                <Button
                  data-testid={FlyoutApprovalRowTestId.Approve}
                  disabled={reject.isPending}
                  icon="check"
                  intent="primary"
                  loading={approve.isPending}
                  onClick={doApprove}
                  tone="ok"
                >
                  {t("approve")}
                </Button>
              )}
              <Button
                data-testid={FlyoutApprovalRowTestId.Reject}
                disabled={approve.isPending}
                icon="x"
                intent="ghost"
                loading={reject.isPending}
                onClick={doReject}
              >
                {t("reject")}
              </Button>
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
