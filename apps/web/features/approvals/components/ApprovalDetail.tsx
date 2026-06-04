import { useTranslations } from "next-intl";
import { Button, Container, Icon, IconTile, Stack, StatusDot, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import type { DashboardApproval } from "../approval";
import { SEVERITY, riskMeta } from "../approval";
import { ApprovalPreview } from "./ApprovalPreview";
import { RiskBadge } from "./RiskBadge";
import { SeverityMeter } from "./SeverityMeter";

export type ApprovalDecision = "approved" | "rejected" | null;

export interface ApprovalDetailProps {
  approval: DashboardApproval;
  decision: ApprovalDecision;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
}

function MetaCell({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <Stack gap="25">
      <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
        {label}
      </Typography>
      <Typography mono size="sm" tone={tone} type="note">
        {value}
      </Typography>
    </Stack>
  );
}

/** The flagship approval detail: status, the exact action preview, and the decision. */
export function ApprovalDetail({
  approval,
  decision,
  pending,
  onApprove,
  onReject,
  onReset,
}: ApprovalDetailProps) {
  const t = useTranslations("approvals");
  const meta = riskMeta(approval.riskType);
  const sev = SEVERITY[approval.risk];
  const riskLabel = approval.riskType ? t(`risk.${approval.riskType}`) : "";
  const statusTone = decision === "approved" ? "ok" : decision === "rejected" ? "faint" : sev.tone;

  return (
    <Stack gap="200">
      {/* header */}
      <HudPanel padding="300" tone={decision === "approved" ? "ok" : sev.tone}>
        <Stack gap="200">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={!decision} tone={statusTone} />
              <Typography mono uppercase size="xs" tone={decision ? undefined : sev.tone} tracking="widest" type="note" weight="bold">
                {decision === "approved" ? t("approvedLabel") : decision === "rejected" ? t("rejectedLabel") : t("awaiting")}
              </Typography>
            </Stack>
            <Stack align="center" direction="row" gap="150">
              <SeverityMeter showLabel label={t(`severity.${approval.risk}`)} severity={approval.risk} />
              <RiskBadge label={riskLabel} size="md" type={approval.riskType} />
            </Stack>
          </Stack>

          <Stack align="start" direction="row" gap="150">
            <IconTile
              glyph={approval.glyph ?? meta.glyph}
              size="lg"
              style={{
                background: `color-mix(in srgb, ${meta.cssVar} 14%, transparent)`,
                color: meta.cssVar,
                borderColor: `color-mix(in srgb, ${meta.cssVar} 40%, transparent)`,
              }}
            />
            <Container minW0>
              <Stack gap="75">
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
            </Container>
          </Stack>

          <Stack wrap direction="row" gap="300">
            <MetaCell label={t("requestedLabel")} value={new Date(approval.requestedAt).toLocaleString("cs")} />
            {approval.via && <MetaCell label={t("viaLabel")} value={approval.via} />}
            <MetaCell label={t("runLabel")} tone="accent" value={approval.runId} />
          </Stack>
        </Stack>
      </HudPanel>

      {/* exact action preview */}
      {approval.preview && (
        <HudPanel padding="250" title={t("exactAction")}>
          <ApprovalPreview
            labels={{ cart: t("previewCart"), total: t("previewTotal"), targets: t("previewTargets"), sendTo: t("previewSendTo") }}
            preview={approval.preview}
          />
        </HudPanel>
      )}
      {!approval.preview && approval.text && (
        <HudPanel padding="250" title={t("exactAction")}>
          <Typography mono size="sm" type="note" variant="secondary">
            {approval.text}
          </Typography>
        </HudPanel>
      )}

      {/* consequence + decision */}
      <HudPanel padding="250" tone={sev.tone}>
        <Stack gap="200">
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

          {decision ? (
            <Stack align="center" direction="row" gap="100" justify="between">
              <Stack align="center" direction="row" gap="100">
                <Icon name={decision === "approved" ? "ok" : "x"} size="lg" tone={decision === "approved" ? "ok" : "faint"} />
                <Stack gap="25">
                  <Typography tone={decision === "approved" ? "ok" : undefined} type="text" variant={decision === "approved" ? undefined : "secondary"} weight="semibold">
                    {decision === "approved" ? t("approvedMsg") : t("rejectedMsg")}
                  </Typography>
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {decision === "approved" ? t("approvedSub", { run: approval.runId }) : t("rejectedSub", { run: approval.runId })}
                  </Typography>
                </Stack>
              </Stack>
              <Button icon="retry" intent="ghost" onClick={onReset} size="sm">
                {t("backToQueue")}
              </Button>
            </Stack>
          ) : (
            <Stack direction="row" gap="100">
              <Button block disabled={pending} icon="check" intent="approve" onClick={onApprove}>
                {t("approve")}
              </Button>
              <Button block disabled={pending} icon="x" intent="reject" onClick={onReject}>
                {t("reject")}
              </Button>
            </Stack>
          )}

          <Stack align="center">
            <Typography mono align="center" size="2xs" type="note" variant="tertiary">
              {t("guarantee")}
            </Typography>
          </Stack>
        </Stack>
      </HudPanel>
    </Stack>
  );
}
