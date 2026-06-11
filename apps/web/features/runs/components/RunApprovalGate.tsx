"use client";

import { Button, Icon, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import type { DashboardApproval } from "../../approvals/approval";
import { SEVERITY } from "../../approvals/approval";
import { ApprovalPreview } from "../../approvals/components/ApprovalPreview";
import { useApproveMutation } from "../../approvals/mutations";

export interface RunApprovalGateProps {
  approval: DashboardApproval;
  /** Deletes the whole run (the reject path of this footer). */
  onDelete: () => void;
  deleting: boolean;
}

/**
 * The decision panel for a run paused on `awaiting-approval`: a summary of what
 * exactly happens after confirming (the action, its structured preview and its
 * consequence) with a Potvrdit / Smazat footer. Run identity lives in the run
 * header above — this panel never repeats it. Confirming resumes the paused run;
 * the runs feed then flips the status and this panel disappears.
 */
export function RunApprovalGate({ approval, onDelete, deleting }: RunApprovalGateProps) {
  const t = useTranslations("approvals");
  const approve = useApproveMutation();
  const sev = SEVERITY[approval.risk];

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
          <Button
            block
            disabled={deleting}
            icon="check"
            intent="primary"
            loading={approve.isPending}
            onClick={() => approve.mutate({ params: { id: approval.id }, body: {} })}
            tone="ok"
          >
            {t("confirm")}
          </Button>
          <Button
            block
            disabled={approve.isPending || deleting}
            icon="x"
            intent="danger"
            onClick={onDelete}
          >
            {t("discard")}
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
