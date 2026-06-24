"use client";

import { Button, HoldButton, Icon, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import type { DashboardApproval } from "../../approvals/approval";
import { HIGH_RISK_TYPES, SEVERITY } from "../../approvals/approval";
import { ApprovalPreview } from "../../approvals/components/ApprovalPreview";
import { useApproveMutation, useRejectMutation } from "../../approvals";

export interface RunApprovalGateProps {
  approval: DashboardApproval;
}

/**
 * The decision panel for a run paused on `awaiting-approval`: a summary of what
 * exactly happens after confirming (the action, its structured preview and its
 * consequence) with a Potvrdit / Zamítnout footer. Run identity lives in the run
 * header above — this panel never repeats it.
 *
 * The two outcomes are the gate's, not a destructive edit: **confirm** resumes the
 * paused run; **reject** goes through the reject endpoint — it records the denial
 * (`approval-rejected`) and terminates the run *without erasing it*, so the rejected
 * run stays in the feed and remains answerable. (Deleting a run is a separate action
 * on the run header, available once it is no longer gated — never the gate's "no".)
 */
export function RunApprovalGate({ approval }: RunApprovalGateProps) {
  const t = useTranslations("approvals");
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const sev = SEVERITY[approval.risk];
  // Payment/deletion get the same deliberate hold-to-confirm guardrail the queue card
  // uses — the highest-consequence actions must not be a single click on this surface.
  const highRisk = approval.riskType !== undefined && HIGH_RISK_TYPES.has(approval.riskType);
  const confirmAction = () => approve.mutate({ params: { id: approval.id }, body: {} });

  return (
    <HudPanel padding="250" title={t("exactAction")} tone={sev.tone}>
      <Stack gap="200">
        <Stack gap="50">
          <Typography leading="tight" type="subtitle" weight="semibold">
            <Typography mono as="span" tone={sev.tone} type="subtitle">
              {approval.skill}
            </Typography>{" "}
            <Typography as="span" type="subtitle" variant="tertiary">
              {t("wants")}
            </Typography>{" "}
            {approval.action}
          </Typography>
          {approval.summary && (
            <Typography mono size="sm" type="note" variant="secondary">
              {approval.summary}
            </Typography>
          )}
        </Stack>

        {approval.preview ? (
          <ApprovalPreview
            labels={{
              cart: t("previewCart"),
              total: t("previewTotal"),
              targets: t("previewTargets"),
              sendTo: t("previewSendTo"),
            }}
            preview={approval.preview}
          />
        ) : (
          approval.text && (
            <Typography mono size="sm" type="note" variant="secondary">
              {approval.text}
            </Typography>
          )
        )}

        {approval.consequence && (
          // Bespoke severity-tinted callout: background + border are derived from
          // the dynamic `sev.cssVar` (per-severity color), which no DS prop expresses.
          <div
            // eslint-disable-next-line react/forbid-dom-props
            style={{
              display: "flex",
              gap: "0.6rem",
              alignItems: "flex-start",
              padding: "0.7rem 0.8rem",
              background: `color-mix(in srgb, ${sev.cssVar} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${sev.cssVar} 33%, transparent)`,
              borderRadius: 3,
            }}
          >
            <Icon name="warn" size="md" tone={sev.tone} />
            <Stack gap="50">
              <Typography mono uppercase size="2xs" tone={sev.tone} tracking="wide" type="note">
                {t("consequenceLabel")}
              </Typography>
              <Typography leading="snug" size="sm" type="text" variant="secondary">
                {approval.consequence}
              </Typography>
            </Stack>
          </div>
        )}

        <Stack direction="row" gap="100">
          {highRisk ? (
            <HoldButton
              block
              disabled={reject.isPending}
              doneLabel={t("holdDone")}
              label={t("holdToApprove")}
              onConfirm={confirmAction}
              tone={approval.riskType === "mazani" ? "bad" : "warn"}
            />
          ) : (
            <Button
              block
              disabled={reject.isPending}
              icon="check"
              intent="primary"
              loading={approve.isPending}
              onClick={confirmAction}
              tone="ok"
            >
              {t("confirm")}
            </Button>
          )}
          <Button
            block
            disabled={approve.isPending}
            icon="x"
            intent="danger"
            loading={reject.isPending}
            onClick={() => reject.mutate({ params: { id: approval.id }, body: {} })}
          >
            {t("reject")}
          </Button>
        </Stack>

        <Stack align="center">
          <Typography mono align="center" size="2xs" type="note" variant="tertiary">
            {t("guarantee")}
          </Typography>
        </Stack>
      </Stack>
    </HudPanel>
  );
}
