import {
  Alert,
  Button,
  Card,
  Chip,
  Container,
  HoldButton,
  type RiskKind,
  RiskTag,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Approval } from "../../../../domain";

export interface ApprovalCardProps {
  approval: Approval;
  onApprove?: (approval: Approval) => void;
  onReject?: (approval: Approval) => void;
}

/** Domain risk tag (Czech) → DS risk kind. Unknown tags fall back to a chip. */
const riskKind: Record<string, RiskKind> = {
  platba: "payment",
  mazani: "deletion",
  mazání: "deletion",
  push: "push",
  odeslani: "send",
  odeslání: "send",
};

/** High-risk categories require the hold-to-confirm guardrail. */
const highRisk: ReadonlySet<RiskKind> = new Set(["payment", "deletion"]);

/**
 * Guardrail card (design `ZtApproval`, rail density): ZIBBY never clicks
 * "order / pay" itself. The card lives in the amber "waiting for you" state;
 * high-risk actions (payment, deletion) confirm via a 0.9s hold.
 */
export function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const t = useTranslations("approval");
  const [done, setDone] = useState<"ok" | "no" | null>(null);

  const kind = riskKind[approval.risk];
  const hold = kind !== undefined && highRisk.has(kind);

  return (
    <Card corners tone="warn">
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100" justify="between">
            <Stack align="center" direction="row" gap="100">
              <StatusDot pulse={!done} tone={done ? (done === "ok" ? "ok" : "idle") : "wait"} />
              <Typography
                mono
                uppercase
                size="sm"
                tone={done ? undefined : "warn"}
                tracking="widest"
                type="note"
                variant={done ? "tertiary" : undefined}
                weight="semibold"
              >
                {t("waiting")}
              </Typography>
            </Stack>
            {kind ? (
              <RiskTag risk={kind}>{t(`riskTag.${kind}`)}</RiskTag>
            ) : (
              <Chip tone="neutral">{approval.risk}</Chip>
            )}
          </Stack>

          <Stack gap="25">
            <Typography size="md" type="note" weight="semibold">
              <Typography
                mono
                as="span"
                size="md"
                tone="accent"
                type="note"
                weight="semibold"
              >
                {approval.skill}
              </Typography>{" "}
              <Typography
                as="span"
                size="md"
                type="note"
                variant="secondary"
                weight="normal"
              >
                {t("wants")}
              </Typography>{" "}
              {approval.action}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {approval.detail}
            </Typography>
          </Stack>

          {done ? (
            <Alert severity={done === "ok" ? "ok" : "error"}>
              {done === "ok" ? t("approved") : t("rejected")}
            </Alert>
          ) : (
            <Stack gap="100">
              {hold ? (
                <HoldButton
                  block
                  doneLabel={t("holdDone")}
                  label={t("holdToApprove")}
                  onConfirm={() => {
                    setDone("ok");
                    onApprove?.(approval);
                  }}
                  tone={kind === "deletion" ? "bad" : "warn"}
                />
              ) : (
                <Button
                  block
                  icon="check"
                  intent="primary"
                  onClick={() => {
                    setDone("ok");
                    onApprove?.(approval);
                  }}
                  tone="ok"
                >
                  {t("approve")}
                </Button>
              )}
              <Button
                block
                icon="x"
                intent="ghost"
                onClick={() => {
                  setDone("no");
                  onReject?.(approval);
                }}
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
